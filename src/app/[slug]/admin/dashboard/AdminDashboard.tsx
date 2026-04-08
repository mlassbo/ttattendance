'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatSwedishWeekdayTime } from '@/lib/attendance-window'
import AutoRefreshStatus from '../AutoRefreshStatus'
import { formatTime } from '../format'

const REFRESH_INTERVAL_MS = 30_000
const REFRESH_INTERVAL_SECONDS = REFRESH_INTERVAL_MS / 1000

interface ClassCounts {
  confirmed: number
  absent: number
  noResponse: number
  total: number
}

interface ClassSummary {
  id: string
  name: string
  startTime: string
  attendanceDeadline: string
  counts: ClassCounts
  workflow: {
    currentPhaseKey: string | null
    currentPhaseLabel: string | null
    nextActionKey: string | null
    nextActionLabel: string | null
    nextActionHelper: string | null
    followUpActionLabel: string | null
    lastCalloutAt: string | null
    missingPlayers: string[]
    absentPlayers: string[]
  }
}

interface Session {
  id: string
  name: string
  date: string
  sessionOrder: number
  classes: ClassSummary[]
}

function getWorkflowBadgeClassName(currentPhaseKey: string | null) {
  if (currentPhaseKey === 'callout_needed') return 'app-pill-warning'
  if (
    currentPhaseKey === 'finished'
    || currentPhaseKey === 'pool_play_complete'
    || currentPhaseKey === 'playoffs_complete'
  ) {
    return 'app-pill-success'
  }
  if (currentPhaseKey?.endsWith('_in_progress')) {
    return 'rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white'
  }

  return null
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('sv-SE', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function formatClassCount(count: number) {
  return `${count} ${count === 1 ? 'klass' : 'klasser'}`
}

function formatPlayerCount(count: number) {
  return `${count} spelare`
}

function canSkipDashboardAction(actionKey: string | null) {
  return actionKey === 'seed_class'
    || actionKey === 'a_playoff'
    || actionKey === 'b_playoff'
    || actionKey === 'register_playoff_match_results'
}

export default function AdminDashboard({
  slug,
  competitionName,
}: {
  slug: string
  competitionName: string
}) {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [secondsUntilNextRefresh, setSecondsUntilNextRefresh] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dashboardMutation, setDashboardMutation] = useState<string | null>(null)
  const refreshInFlightRef = useRef(false)

  const fetchData = useCallback(async () => {
    if (refreshInFlightRef.current) return
    if (typeof document !== 'undefined' && document.hidden) return

    refreshInFlightRef.current = true
    setIsRefreshing(true)

    try {
      const res = await fetch('/api/admin/sessions', {
        cache: 'no-store',
        headers: {
          'x-competition-slug': slug,
        },
      })
      if (res.status === 401) {
        router.push(`/${slug}/admin`)
        return
      }
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions)
        setUpdatedAt(new Date())
        setSecondsUntilNextRefresh(REFRESH_INTERVAL_SECONDS)
        setError(null)
      } else {
        setError('Kunde inte hämta data')
      }
    } catch {
      setError('Nätverksfel')
    } finally {
      setLoading(false)
      setIsRefreshing(false)
      refreshInFlightRef.current = false
    }
  }, [slug, router])

  useEffect(() => {
    void fetchData()
    const interval = setInterval(() => {
      void fetchData()
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchData])

  useEffect(() => {
    function handleVisibilityChange() {
      if (!document.hidden) {
        void fetchData()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [fetchData])

  useEffect(() => {
    if (isRefreshing || secondsUntilNextRefresh === null) return

    const countdown = setInterval(() => {
      setSecondsUntilNextRefresh(current => {
        if (current === null) return null
        return current > 0 ? current - 1 : 0
      })
    }, 1000)

    return () => clearInterval(countdown)
  }, [isRefreshing, secondsUntilNextRefresh])

  async function mutateDashboardStep(classId: string, stepKey: string, status: 'done' | 'skipped') {
    if (refreshInFlightRef.current || dashboardMutation) return

    setDashboardMutation(`${classId}:${stepKey}:${status}`)
    setError(null)

    try {
      const res = await fetch(`/api/admin/classes/${classId}/workflow/steps/${stepKey}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-competition-slug': slug,
        },
        body: JSON.stringify({ status }),
      })

      if (res.status === 401) {
        router.push(`/${slug}/admin`)
        return
      }

      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        setError(payload?.error ?? 'Kunde inte uppdatera checklistan')
        return
      }

      await fetchData()
    } catch {
      setError('Nätverksfel')
    } finally {
      setDashboardMutation(null)
    }
  }

  async function logDashboardCallout(classId: string) {
    if (refreshInFlightRef.current || dashboardMutation) return

    setDashboardMutation(`${classId}:missing_players_callout`)
    setError(null)

    try {
      const res = await fetch(`/api/admin/classes/${classId}/workflow/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-competition-slug': slug,
        },
        body: JSON.stringify({ eventKey: 'missing_players_callout' }),
      })

      if (res.status === 401) {
        router.push(`/${slug}/admin`)
        return
      }

      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        setError(payload?.error ?? 'Kunde inte uppdatera checklistan')
        return
      }

      await fetchData()
    } catch {
      setError('Nätverksfel')
    } finally {
      setDashboardMutation(null)
    }
  }

  const now = Date.now()
  const overdueClasses = sessions.flatMap(session =>
    session.classes
      .filter(cls => new Date(cls.attendanceDeadline).getTime() < now && cls.counts.noResponse > 0)
      .map(cls => ({ noResponse: cls.counts.noResponse }))
  )
  const overdueMissingPlayers = overdueClasses.reduce((sum, cls) => sum + cls.noResponse, 0)

  return (
    <main className="app-shell">
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="app-card flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Sekretariat</p>
            <p data-testid="dashboard-competition-name" className="text-sm text-muted">
              {competitionName}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-ink">Översikt</h1>
            <p className="text-sm leading-6 text-muted">
              Ha koll på alla klasser, deras status och vad som behöver göras i sekretariatet.
            </p>
          </div>
          <AutoRefreshStatus
            intervalSeconds={REFRESH_INTERVAL_SECONDS}
            isRefreshing={isRefreshing}
            updatedAt={updatedAt}
            secondsUntilNextRefresh={secondsUntilNextRefresh}
          />
        </section>

        {loading && <p className="px-1 text-sm text-muted">Laddar...</p>}

        {error && <p className="app-banner-error">{error}</p>}

        {overdueClasses.length > 0 && (
          <div data-testid="dashboard-overdue-summary" className="app-banner-warning">
            <p className="text-sm font-semibold text-amber-950">
              Deadline passerad i {formatClassCount(overdueClasses.length)}.
            </p>
            <p className="mt-1 text-sm text-amber-800">
              {formatPlayerCount(overdueMissingPlayers)} saknas fortfarande och bör ropas upp i sekretariatet.
            </p>
          </div>
        )}

        {!loading && sessions.length === 0 && !error && (
          <p className="px-1 text-sm text-muted">Inga pass hittades.</p>
        )}

        <div className="space-y-8">
          {sessions.map(session => (
            <section key={session.id} className="space-y-3">
              <h2 className="px-1 text-base font-semibold text-ink">
                {session.name}
                <span className="ml-2 text-sm font-normal text-muted">
                  {formatDate(session.date)}
                </span>
              </h2>
              <div
                data-testid={`dashboard-session-grid-${session.id}`}
                className="grid gap-3 lg:grid-cols-2"
              >
                {session.classes.map(cls => {
                  const isPastDeadline = new Date() > new Date(cls.attendanceDeadline)
                  const needsAnnouncement = isPastDeadline && cls.counts.noResponse > 0
                  const answeredCount = cls.counts.confirmed + cls.counts.absent
                  const workflowBadgeClassName = getWorkflowBadgeClassName(cls.workflow.currentPhaseKey)
                  const showAttendanceCounts =
                    cls.workflow.currentPhaseKey === 'awaiting_attendance'
                    || cls.workflow.currentPhaseKey === 'callout_needed'
                  const showCurrentActionStep =
                    !!cls.workflow.nextActionLabel
                    && cls.workflow.nextActionLabel !== cls.workflow.currentPhaseLabel
                  const canQuickComplete =
                    !!cls.workflow.nextActionKey
                    && cls.workflow.nextActionKey !== 'missing_players_callout'
                  const canQuickSkip = canSkipDashboardAction(cls.workflow.nextActionKey)
                  const canQuickCallout = cls.workflow.nextActionKey === 'missing_players_callout'
                  const isMutatingDone = dashboardMutation === `${cls.id}:${cls.workflow.nextActionKey}:done`
                  const isMutatingSkip = dashboardMutation === `${cls.id}:${cls.workflow.nextActionKey}:skipped`
                  const isMutatingCallout = dashboardMutation === `${cls.id}:missing_players_callout`
                  const showWorkflowPanel = cls.workflow.currentPhaseKey !== 'finished'
                  const cardTone = needsAnnouncement
                    ? 'border-amber-300 bg-amber-50/85'
                    : cls.workflow.currentPhaseKey === 'finished'
                      ? 'border-green-200 bg-green-50/80'
                      : ''

                  return (
                    <div
                      key={cls.id}
                      data-testid={`class-row-${cls.id}`}
                      className={`app-card h-full space-y-4 ${cardTone}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-2">
                          {cls.workflow.currentPhaseLabel && workflowBadgeClassName && (
                            <span
                              data-testid={`dashboard-workflow-badge-${cls.id}`}
                              className={`inline-flex whitespace-nowrap ${workflowBadgeClassName}`}
                            >
                              {cls.workflow.currentPhaseLabel}
                            </span>
                          )}

                          <p className="text-lg font-semibold text-ink truncate">{cls.name}</p>

                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                            <p>Start {formatTime(cls.startTime)}</p>
                            {showAttendanceCounts && (
                              <p className={needsAnnouncement ? 'font-semibold text-amber-800' : ''}>
                                Deadline {formatTime(cls.attendanceDeadline)}
                              </p>
                            )}
                          </div>
                        </div>

                        <Link
                          data-testid={`class-detail-link-${cls.id}`}
                          href={`/${slug}/admin/classes/${cls.id}`}
                          className="app-button-secondary min-h-9 shrink-0 px-3 py-1.5 text-xs text-center"
                        >
                          Visa detaljer
                        </Link>
                      </div>

                      <div className="space-y-3">
                        {showAttendanceCounts && (
                          <div className="flex flex-wrap gap-2">
                            <span
                              data-testid={`count-confirmed-${cls.id}`}
                              className="inline-flex items-center justify-center gap-1 rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-700"
                              title="Bekräftade"
                            >
                              <span>✓</span> {cls.counts.confirmed}
                            </span>
                            <span
                              data-testid={`count-absent-${cls.id}`}
                              className="inline-flex items-center justify-center gap-1 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                              title="Frånvaro"
                            >
                              <span>✗</span> {cls.counts.absent}
                            </span>
                            <span
                              data-testid={`count-no-response-${cls.id}`}
                              className={`inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold ${
                                cls.counts.noResponse > 0 && isPastDeadline
                                  ? 'bg-orange-50 text-orange-700'
                                  : 'bg-stone-100 text-muted'
                              }`}
                              title="Ej rapporterat"
                            >
                              <span>?</span> {cls.counts.noResponse}
                            </span>
                            <span
                              data-testid={`dashboard-attendance-summary-${cls.id}`}
                              className="inline-flex items-center rounded-xl border border-line/70 bg-stone-50 px-3 py-2 text-sm text-muted"
                            >
                              {answeredCount}/{cls.counts.total} svar
                            </span>
                          </div>
                        )}

                        {showWorkflowPanel && (
                          <div className="w-full max-w-xl rounded-2xl border border-line/70 bg-stone-50/80 px-4 py-3">
                            <div className="space-y-3">
                              <div className="min-w-0 space-y-2">
                                {cls.workflow.currentPhaseKey === 'callout_needed' && cls.workflow.missingPlayers.length > 0 ? (
                                  <div
                                    data-testid={`dashboard-callout-list-${cls.id}`}
                                    className="space-y-1 text-sm text-amber-900"
                                  >
                                    <p className="font-semibold text-amber-950">Ropa upp nu:</p>
                                    {cls.workflow.missingPlayers.map(playerName => (
                                      <p key={playerName}>{playerName}</p>
                                    ))}
                                    {cls.workflow.lastCalloutAt && (
                                      <p
                                        data-testid={`dashboard-last-callout-${cls.id}`}
                                        className="pt-1 text-xs text-amber-800/90"
                                      >
                                        Senaste upprop {formatSwedishWeekdayTime(cls.workflow.lastCalloutAt)}
                                      </p>
                                    )}
                                  </div>
                                ) : cls.workflow.nextActionKey === 'remove_absent_players' && cls.workflow.absentPlayers.length > 0 ? (
                                  <div
                                    data-testid={`dashboard-absent-list-${cls.id}`}
                                    className="space-y-1 text-sm text-red-900"
                                  >
                                    <p className="font-semibold text-red-950">
                                      Ta bort i tävlingssystemet:
                                    </p>
                                    {cls.workflow.absentPlayers.map(playerName => (
                                      <p key={playerName}>{playerName}</p>
                                    ))}
                                  </div>
                                ) : showCurrentActionStep ? (
                                  <div className="space-y-1">
                                    <p
                                      data-testid={`dashboard-next-action-${cls.id}`}
                                      className="text-sm font-semibold text-ink"
                                    >
                                      {cls.workflow.nextActionLabel}
                                    </p>
                                    {cls.workflow.nextActionHelper && (
                                      <p
                                        data-testid={`dashboard-next-action-helper-${cls.id}`}
                                        className="text-sm text-muted"
                                      >
                                        {cls.workflow.nextActionHelper}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted">Inget sekretariatet behöver göra med klassen just nu.</p>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {canQuickComplete && cls.workflow.nextActionKey && (
                                  <button
                                    data-testid={`dashboard-done-btn-${cls.id}`}
                                    onClick={() => mutateDashboardStep(cls.id, cls.workflow.nextActionKey as string, 'done')}
                                    disabled={isMutatingDone || !!dashboardMutation || isRefreshing}
                                    className="min-h-10 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-green-700 disabled:opacity-60"
                                  >
                                    Klar
                                  </button>
                                )}
                                {canQuickSkip && cls.workflow.nextActionKey && (
                                  <button
                                    data-testid={`dashboard-skip-btn-${cls.id}`}
                                    onClick={() => mutateDashboardStep(cls.id, cls.workflow.nextActionKey as string, 'skipped')}
                                    disabled={isMutatingSkip || !!dashboardMutation || isRefreshing}
                                    className="min-h-10 rounded-xl border border-stone-300 bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-stone-50 disabled:opacity-60"
                                  >
                                    Skippa
                                  </button>
                                )}
                                {canQuickCallout && (
                                  <button
                                    data-testid={`dashboard-callout-btn-${cls.id}`}
                                    onClick={() => logDashboardCallout(cls.id)}
                                    disabled={isMutatingCallout || !!dashboardMutation || isRefreshing}
                                    className="app-button-secondary min-h-10 px-4 py-2"
                                  >
                                    Upprop gjort
                                  </button>
                                )}
                              </div>

                              {showCurrentActionStep && cls.workflow.followUpActionLabel && (
                                <p
                                  data-testid={`dashboard-followup-action-${cls.id}`}
                                  className="text-xs text-muted"
                                >
                                  Nästa: {cls.workflow.followUpActionLabel}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
