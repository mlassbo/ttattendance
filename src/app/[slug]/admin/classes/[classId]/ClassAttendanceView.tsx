'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { formatSwedishDateTime, formatSwedishWeekdayTime } from '@/lib/attendance-window'
import AutoRefreshStatus from '../../AutoRefreshStatus'
import { formatTime } from '../../format'

const REFRESH_INTERVAL_MS = 30_000
const REFRESH_INTERVAL_SECONDS = REFRESH_INTERVAL_MS / 1000

interface PlayerAttendance {
  registrationId: string
  playerId: string
  name: string
  club: string | null
  status: 'confirmed' | 'absent' | null
  reportedAt: string | null
  reportedBy: 'player' | 'admin' | null
}

interface ClassInfo {
  id: string
  name: string
  startTime: string
  attendanceDeadline: string
}

interface ClassData {
  class: ClassInfo
  players: PlayerAttendance[]
}

interface WorkflowAttendance {
  confirmed: number
  absent: number
  noResponse: number
  total: number
  state: 'awaiting_attendance' | 'callout_needed' | 'attendance_complete'
  lastCalloutAt: string | null
}

interface WorkflowNextAction {
  key: string
  label: string
}

interface WorkflowStep {
  key: string
  order: number
  label: string
  helper: string
  canSkip: boolean
  dependsOn: string[]
  requiresAttendanceComplete: boolean
  status: 'not_started' | 'active' | 'done' | 'skipped'
  derivedState: 'blocked' | 'ready' | 'active' | 'done' | 'skipped'
  note: string | null
  updatedAt: string | null
  canStart: boolean
  canMarkDone: boolean
  canSkipAction: boolean
  canReopen: boolean
}

interface WorkflowData {
  class: ClassInfo
  attendance: WorkflowAttendance
  workflow: {
    currentPhaseKey: string
    currentPhaseLabel: string
    nextAction: WorkflowNextAction | null
    canLogCallout: boolean
    steps: WorkflowStep[]
  }
}

class FetchError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function normalizeWorkflowData(payload: WorkflowData): WorkflowData {
  return {
    ...payload,
    workflow: {
      ...payload.workflow,
      steps: payload.workflow.steps.map(step => ({
        ...step,
        canSkipAction: step.canSkip,
      })),
    },
  }
}

function getWorkflowStateLabel(state: WorkflowStep['derivedState']) {
  if (state === 'blocked') return 'Blockerad'
  if (state === 'ready') return 'Kan påbörjas'
  if (state === 'active') return 'Pågår'
  if (state === 'done') return 'Klar'
  return 'Skippad'
}

function getWorkflowStateClassName(state: WorkflowStep['derivedState']) {
  if (state === 'blocked') return 'app-pill-muted'
  if (state === 'ready') return 'app-pill-warning'
  if (state === 'active') return 'rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white'
  if (state === 'done') return 'app-pill-success'
  return 'rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold text-stone-700'
}

function getWorkflowHeadlineClassName(currentPhaseKey: string) {
  if (currentPhaseKey === 'callout_needed') return 'app-pill-warning'
  if (
    currentPhaseKey === 'finished'
    || currentPhaseKey === 'pool_play_complete'
    || currentPhaseKey === 'playoffs_complete'
  ) {
    return 'app-pill-success'
  }
  if (currentPhaseKey.endsWith('_in_progress')) {
    return 'rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white'
  }

  return null
}

function StatusBadge({
  status,
  registrationId,
  reportedAt,
  reportedBy,
}: {
  status: 'confirmed' | 'absent' | null
  registrationId: string
  reportedAt: string | null
  reportedBy: 'player' | 'admin' | null
}) {
  const reportedByLabel = reportedBy === 'player' ? 'spelare' : reportedBy
  const reportedSuffix =
    reportedAt && reportedByLabel ? ` ${formatTime(reportedAt)} (${reportedByLabel})` : ''

  if (status === 'confirmed') {
    return (
      <span
        data-testid={`status-badge-${registrationId}`}
        className="app-pill-success whitespace-nowrap"
      >
        {`Bekräftad${reportedSuffix}`}
      </span>
    )
  }
  if (status === 'absent') {
    return (
      <span
        data-testid={`status-badge-${registrationId}`}
        className="app-pill-danger whitespace-nowrap"
      >
        {`Frånvaro${reportedSuffix}`}
      </span>
    )
  }
  return (
    <span
      data-testid={`status-badge-${registrationId}`}
      className="app-pill-muted whitespace-nowrap"
    >
      Ej rapporterat
    </span>
  )
}

export default function ClassAttendanceView({
  slug,
  classId,
  competitionName,
}: {
  slug: string
  classId: string
  competitionName: string
}) {
  const router = useRouter()
  const [data, setData] = useState<ClassData | null>(null)
  const [workflowData, setWorkflowData] = useState<WorkflowData | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [secondsUntilNextRefresh, setSecondsUntilNextRefresh] = useState<number | null>(null)
  const [overriding, setOverriding] = useState<string | null>(null)
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const [workflowMutation, setWorkflowMutation] = useState<string | null>(null)
  const [workflowError, setWorkflowError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const overridingRef = useRef(false)
  const workflowMutatingRef = useRef(false)
  const refreshInFlightRef = useRef(false)

  const fetchAttendanceData = useCallback(async () => {
    const res = await fetch(`/api/admin/classes/${classId}/attendance`, {
      cache: 'no-store',
      headers: {
        'x-competition-slug': slug,
      },
    })
    if (res.status === 401) {
      router.push(`/${slug}/admin`)
      return null
    }
    if (!res.ok) {
      throw new FetchError(res.status, 'attendance_fetch_failed')
    }

    return res.json() as Promise<ClassData>
  }, [classId, slug, router])

  const fetchWorkflowData = useCallback(async () => {
    const res = await fetch(`/api/admin/classes/${classId}/workflow`, {
      cache: 'no-store',
      headers: {
        'x-competition-slug': slug,
      },
    })
    if (res.status === 401) {
      router.push(`/${slug}/admin`)
      return null
    }
    if (!res.ok) {
      throw new FetchError(res.status, 'workflow_fetch_failed')
    }

    const payload = await res.json() as WorkflowData
    return normalizeWorkflowData(payload)
  }, [classId, slug, router])

  const fetchData = useCallback(async () => {
    // Skip poll if an override is in flight to avoid overwriting optimistic state.
    if (overridingRef.current || workflowMutatingRef.current || refreshInFlightRef.current) return
    if (typeof document !== 'undefined' && document.hidden) return

    const hadDataBeforeRequest = data !== null
    refreshInFlightRef.current = true
    setIsRefreshing(true)

    try {
      const [attendanceResult, workflowResult] = await Promise.allSettled([
        fetchAttendanceData(),
        fetchWorkflowData(),
      ])

      let receivedFreshData = false
      let attendanceWasNotFound = false

      if (attendanceResult.status === 'fulfilled') {
        if (attendanceResult.value) {
          setData(attendanceResult.value)
          setPageError(null)
          receivedFreshData = true
        }
      } else if (attendanceResult.reason instanceof FetchError) {
        if (attendanceResult.reason.status === 404) {
          attendanceWasNotFound = true
        } else {
          setPageError('Kunde inte hämta klassen')
        }
      } else {
        setPageError('Kunde inte hämta klassen')
      }

      if (workflowResult.status === 'fulfilled') {
        if (workflowResult.value) {
          setWorkflowData(workflowResult.value)
          setWorkflowError(null)
          receivedFreshData = true
        }
      } else if (workflowResult.reason instanceof FetchError) {
        setWorkflowError(
          workflowResult.reason.status === 404
            ? 'Checklistan kunde inte hämtas'
            : 'Kunde inte hämta checklistan'
        )
      } else {
        setWorkflowError('Kunde inte hämta checklistan')
      }

      if (attendanceWasNotFound) {
        setNotFound(true)
      } else if (receivedFreshData || hadDataBeforeRequest) {
        setNotFound(false)
      }

      if (receivedFreshData) {
        setUpdatedAt(new Date())
        setSecondsUntilNextRefresh(REFRESH_INTERVAL_SECONDS)
      }
    } finally {
      setLoading(false)
      setIsRefreshing(false)
      refreshInFlightRef.current = false
    }
  }, [fetchAttendanceData, fetchWorkflowData])

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

  async function setAttendance(registrationId: string, status: 'confirmed' | 'absent') {
    if (overridingRef.current || refreshInFlightRef.current) return
    overridingRef.current = true
    setOverriding(registrationId)
    setOverrideError(null)

    try {
      const res = await fetch(`/api/admin/classes/${classId}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-competition-slug': slug,
        },
        body: JSON.stringify({
          registrationId,
          status,
          idempotencyKey: `${registrationId}:${status}`,
        }),
      })

      if (res.ok) {
        setData(prev => {
          if (!prev) return prev
          return {
            ...prev,
            players: prev.players.map(p =>
              p.registrationId === registrationId
                ? { ...p, status, reportedAt: new Date().toISOString(), reportedBy: 'admin' }
                : p
            ),
          }
        })
        try {
          const workflowPayload = await fetchWorkflowData()
          if (workflowPayload) {
            setWorkflowData(workflowPayload)
          }
        } catch {
          setWorkflowError('Kunde inte uppdatera checklistan')
        }
        setUpdatedAt(new Date())
        setSecondsUntilNextRefresh(REFRESH_INTERVAL_SECONDS)
      } else {
        setOverrideError('Något gick fel, försök igen')
      }
    } catch {
      setOverrideError('Nätverksfel, försök igen')
    } finally {
      overridingRef.current = false
      setOverriding(null)
    }
  }

  async function resetAttendance(registrationId: string) {
    if (overridingRef.current || refreshInFlightRef.current) return
    overridingRef.current = true
    setOverriding(registrationId)
    setOverrideError(null)

    try {
      const res = await fetch(`/api/admin/classes/${classId}/attendance`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-competition-slug': slug,
        },
        body: JSON.stringify({ registrationId }),
      })

      if (res.ok) {
        setData(prev => {
          if (!prev) return prev
          return {
            ...prev,
            players: prev.players.map(p =>
              p.registrationId === registrationId
                ? { ...p, status: null, reportedAt: null, reportedBy: null }
                : p
            ),
          }
        })
        try {
          const workflowPayload = await fetchWorkflowData()
          if (workflowPayload) {
            setWorkflowData(workflowPayload)
          }
        } catch {
          setWorkflowError('Kunde inte uppdatera checklistan')
        }
        setUpdatedAt(new Date())
        setSecondsUntilNextRefresh(REFRESH_INTERVAL_SECONDS)
      } else {
        setOverrideError('Något gick fel, försök igen')
      }
    } catch {
      setOverrideError('Nätverksfel, försök igen')
    } finally {
      overridingRef.current = false
      setOverriding(null)
    }
  }

  async function mutateWorkflowStep(stepKey: string, status: 'active' | 'done' | 'skipped' | 'not_started') {
    if (workflowMutatingRef.current || refreshInFlightRef.current) return

    workflowMutatingRef.current = true
    setWorkflowMutation(`${stepKey}:${status}`)
    setWorkflowError(null)

    try {
      const res = await fetch(`/api/admin/classes/${classId}/workflow/steps/${stepKey}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-competition-slug': slug,
        },
        body: JSON.stringify({ status }),
      })

      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        setWorkflowError(payload?.error ?? 'Något gick fel, försök igen')
        return
      }

      setWorkflowData(normalizeWorkflowData(payload as WorkflowData))
      setUpdatedAt(new Date())
      setSecondsUntilNextRefresh(REFRESH_INTERVAL_SECONDS)
    } catch {
      setWorkflowError('Nätverksfel, försök igen')
    } finally {
      workflowMutatingRef.current = false
      setWorkflowMutation(null)
    }
  }

  async function logCallout() {
    if (workflowMutatingRef.current || refreshInFlightRef.current) return

    workflowMutatingRef.current = true
    setWorkflowMutation('missing_players_callout')
    setWorkflowError(null)

    try {
      const res = await fetch(`/api/admin/classes/${classId}/workflow/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-competition-slug': slug,
        },
        body: JSON.stringify({ eventKey: 'missing_players_callout' }),
      })

      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        setWorkflowError(payload?.error ?? 'Något gick fel, försök igen')
        return
      }

      setWorkflowData(normalizeWorkflowData(payload as WorkflowData))
      setUpdatedAt(new Date())
      setSecondsUntilNextRefresh(REFRESH_INTERVAL_SECONDS)
    } catch {
      setWorkflowError('Nätverksfel, försök igen')
    } finally {
      workflowMutatingRef.current = false
      setWorkflowMutation(null)
    }
  }

  function downloadCsv() {
    const a = document.createElement('a')
    a.href = `/api/admin/classes/${classId}/export?slug=${encodeURIComponent(slug)}`
    a.click()
  }

  if (loading && !data) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-muted">Laddar...</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-muted">Klassen hittades inte.</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-muted">{pageError ?? 'Kunde inte hämta klassen.'}</p>
      </div>
    )
  }

  const isPastDeadline = new Date() > new Date(data.class.attendanceDeadline)

  const confirmed = data.players.filter(p => p.status === 'confirmed')
  const absent = data.players.filter(p => p.status === 'absent')
  const noResponse = data.players.filter(p => p.status === null)
  const absentPlayersText = absent.map(player => `${player.name}${player.club ? ` (${player.club})` : ''}`)
  const missingPlayersText = noResponse.map(player => `${player.name}${player.club ? ` (${player.club})` : ''}`)
  const currentPhase = workflowData?.workflow.currentPhaseLabel ?? null
  const currentPhaseClassName = workflowData
    ? getWorkflowHeadlineClassName(workflowData.workflow.currentPhaseKey)
    : null
  const nextAction = workflowData?.workflow.nextAction?.label ?? null
  const attendanceStepState = workflowData?.attendance.state === 'attendance_complete'
    ? 'done'
    : 'active'

  return (
    <main className="app-shell">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="app-card space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <button
                data-testid="back-to-dashboard"
                onClick={() => router.push(`/${slug}/admin/dashboard`)}
                className="w-fit text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-hover"
              >
                ← Tillbaka
              </button>
              <p data-testid="class-competition-name" className="text-sm text-muted">
                {competitionName}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-ink">{data.class.name}</h1>
              <p className="text-sm text-muted">
                Start {formatTime(data.class.startTime)}
                {' · '}
                <span>
                  Deadline {formatTime(data.class.attendanceDeadline)}
                  {isPastDeadline ? ' (passerad)' : ''}
                </span>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <AutoRefreshStatus
                intervalSeconds={REFRESH_INTERVAL_SECONDS}
                isRefreshing={isRefreshing}
                updatedAt={updatedAt}
                secondsUntilNextRefresh={secondsUntilNextRefresh}
              />
            </div>
          </div>
        </section>

        <section className="app-card space-y-4">
          {workflowData ? (
            <>
              <div className="flex justify-center">
                <div className="space-y-2 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Checklista
                  </p>
                  {currentPhaseClassName && currentPhase && (
                    <span
                      data-testid="workflow-current-phase"
                      className={currentPhaseClassName}
                    >
                      {currentPhase}
                    </span>
                  )}
                  {nextAction && (
                    <p data-testid="workflow-next-action" className="text-sm text-muted">
                      Nästa: <span className="font-semibold text-ink">{nextAction}</span>
                    </p>
                  )}
                </div>
              </div>

              {workflowError && (
                <p data-testid="workflow-error" className="app-banner-error">
                  {workflowError}
                </p>
              )}

              <div className="space-y-3">
            <div
              data-testid="workflow-step-attendance"
              className="rounded-2xl border border-line bg-surface px-4 py-4"
            >
              <div className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-ink">Kolla närvaro</p>
                      <span
                        data-testid="workflow-step-state-attendance"
                        className={getWorkflowStateClassName(attendanceStepState)}
                      >
                        {attendanceStepState === 'done' ? 'Klar' : 'Pågår'}
                      </span>
                    </div>
                    <p data-testid="workflow-attendance-state" className="text-sm text-muted">
                      {workflowData.attendance.state === 'awaiting_attendance'
                        ? 'Inväntar fler svar före deadline.'
                        : workflowData.attendance.state === 'callout_needed'
                          ? 'Deadline passerad och spelare saknas.'
                          : 'Närvaron är klar för klassen.'}
                    </p>
                    {workflowData.attendance.lastCalloutAt && (
                      <p data-testid="workflow-last-callout" className="text-xs text-muted/80">
                        Senaste upprop {formatSwedishWeekdayTime(workflowData.attendance.lastCalloutAt)}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {data.players.length > 0 && (
                      <a
                        data-testid="attendance-list-jump-link"
                        href="#attendance-list"
                        className="app-button-secondary min-h-10 px-4 py-2"
                      >
                        Gå till närvarolistan
                      </a>
                    )}
                    {workflowData.workflow.canLogCallout && (
                      <button
                        data-testid="workflow-callout-button"
                        onClick={logCallout}
                        disabled={workflowMutation === 'missing_players_callout' || isRefreshing}
                        className="app-button-secondary min-h-10 px-4 py-2"
                      >
                        Markera upprop gjort
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <span
                    data-testid="attendance-count-confirmed"
                    className="inline-flex items-center justify-center gap-1 rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-700"
                    title="Bekräftade"
                  >
                    <span>✓</span> {workflowData.attendance.confirmed}
                  </span>
                  <span
                    data-testid="attendance-count-absent"
                    className="inline-flex items-center justify-center gap-1 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                    title="Frånvaro"
                  >
                    <span>✗</span> {workflowData.attendance.absent}
                  </span>
                  <span
                    data-testid="attendance-count-no-response"
                    className={`inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold ${
                      workflowData.attendance.noResponse > 0 && isPastDeadline
                        ? 'bg-orange-50 text-orange-700'
                        : 'bg-stone-100 text-muted'
                    }`}
                    title="Ej rapporterat"
                  >
                    <span>?</span> {workflowData.attendance.noResponse}
                  </span>
                </div>

                <div className="rounded-2xl border border-line/70 bg-stone-50/80 px-4 py-3 text-sm text-muted">
                  <p data-testid="attendance-response-summary">
                    Svar inkomna {workflowData.attendance.confirmed + workflowData.attendance.absent}/{workflowData.attendance.total}
                  </p>
                  {workflowData.attendance.state === 'attendance_complete' && workflowData.attendance.total > 0 && (
                    <p data-testid="workflow-attendance-complete" className="mt-1 font-medium text-green-700">
                      Alla {workflowData.attendance.total} spelare har svarat i klassen.
                    </p>
                  )}
                </div>

                {noResponse.length > 0 && (
                  <div
                    data-testid="workflow-missing-players"
                    className="rounded-2xl border border-amber-200 bg-amber-50/75 px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-amber-950">
                      {isPastDeadline ? 'Dessa spelare bör ropas upp i sekretariatet:' : 'Dessa spelare saknar fortfarande svar:'}
                    </p>
                    <div className="mt-2 space-y-1 text-sm text-amber-900">
                      {missingPlayersText.map(playerName => (
                        <p key={playerName}>{playerName}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {workflowData.workflow.steps.map(step => {
              const isMutatingStep = workflowMutation?.startsWith(`${step.key}:`) ?? false

              return (
                <div
                  key={step.key}
                  data-testid={`workflow-step-${step.key}`}
                  className="rounded-2xl border border-line bg-surface px-4 py-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-ink">{step.label}</p>
                        <span
                          data-testid={`workflow-step-state-${step.key}`}
                          className={getWorkflowStateClassName(step.derivedState)}
                        >
                          {getWorkflowStateLabel(step.derivedState)}
                        </span>
                      </div>
                      <p className="text-sm text-muted">{step.helper}</p>
                      {step.updatedAt && (
                        <p className="text-xs text-muted/80">
                          Senast uppdaterad {formatSwedishDateTime(step.updatedAt)}
                        </p>
                      )}
                      {step.key === 'remove_absent_players' && absentPlayersText.length > 0 && (
                        <div
                          data-testid="workflow-absent-players"
                          className="mt-3 rounded-2xl border border-red-200 bg-red-50/75 px-4 py-3"
                        >
                          <p className="text-sm font-semibold text-red-950">
                            Dessa spelare ska tas bort i tävlingssystemet:
                          </p>
                          <div className="mt-2 space-y-1 text-sm text-red-900">
                            {absentPlayersText.map(playerName => (
                              <p key={playerName}>{playerName}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 lg:min-w-[260px] lg:self-center">
                      {step.canMarkDone && (
                        <button
                          data-testid={`workflow-done-btn-${step.key}`}
                          onClick={() => mutateWorkflowStep(step.key, 'done')}
                          disabled={isMutatingStep || isRefreshing}
                          className="min-h-10 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-green-700 disabled:opacity-60"
                        >
                          Klar
                        </button>
                      )}
                      {step.canSkipAction && (
                        <button
                          data-testid={`workflow-skip-btn-${step.key}`}
                          onClick={() => mutateWorkflowStep(step.key, 'skipped')}
                          disabled={isMutatingStep || isRefreshing}
                          className="min-h-10 rounded-xl border border-stone-300 bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-stone-50 disabled:opacity-60"
                        >
                          Skippa
                        </button>
                      )}
                      {step.canReopen && (
                        <button
                          data-testid={`workflow-reset-btn-${step.key}`}
                          onClick={() => mutateWorkflowStep(step.key, 'not_started')}
                          disabled={isMutatingStep || isRefreshing}
                          className="min-h-10 rounded-xl border border-stone-300 bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-stone-50 disabled:opacity-60"
                        >
                          Nollställ
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
              </div>
            </>
          ) : (
            <p data-testid="workflow-error" className="app-banner-error">
              {workflowError ?? 'Checklistan kunde inte laddas just nu.'}
            </p>
          )}
        </section>

        {pageError && <p data-testid="class-load-error" className="app-banner-error">{pageError}</p>}
        {overrideError && <p data-testid="override-error" className="app-banner-error">{overrideError}</p>}

        <section id="attendance-list" data-testid="attendance-list" className="scroll-mt-6 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-ink">Närvarolista</h2>
              <p className="text-sm text-muted">
                Bekräfta, markera frånvaro eller återställ närvaro per spelare.
              </p>
            </div>
            <button
              data-testid="export-csv-button"
              onClick={downloadCsv}
              className="app-button-secondary min-h-10 px-4 py-2 text-xs"
            >
              Exportera CSV
            </button>
          </div>

          {data.players.map(player => {
            const isOverriding = overriding === player.registrationId
            return (
              <div
                key={player.registrationId}
                data-testid={`player-row-${player.registrationId}`}
                className="app-card flex flex-col gap-4 sm:flex-row sm:items-center"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-medium text-ink truncate">{player.name}</p>
                  <p className="text-xs text-muted/80 truncate">{player.club ?? '–'}</p>
                </div>

                <StatusBadge
                  status={player.status}
                  registrationId={player.registrationId}
                  reportedAt={player.reportedAt}
                  reportedBy={player.reportedBy}
                />

                <div className="grid gap-2 sm:min-w-[340px] sm:grid-cols-3">
                  <button
                    data-testid={`confirm-btn-${player.registrationId}`}
                    onClick={() => setAttendance(player.registrationId, 'confirmed')}
                    disabled={isOverriding || isRefreshing || player.status === 'confirmed'}
                    className={`min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 ${
                      player.status === 'confirmed'
                        ? 'bg-green-600 text-white cursor-default'
                        : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                    } disabled:opacity-60`}
                  >
                    Bekräfta
                  </button>
                  <button
                    data-testid={`absent-btn-${player.registrationId}`}
                    onClick={() => setAttendance(player.registrationId, 'absent')}
                    disabled={isOverriding || isRefreshing || player.status === 'absent'}
                    className={`min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 ${
                      player.status === 'absent'
                        ? 'bg-red-600 text-white cursor-default'
                        : 'bg-surface text-red-700 hover:bg-red-50 border border-red-200'
                    } disabled:opacity-60`}
                  >
                    Frånvaro
                  </button>
                  <button
                    data-testid={`reset-btn-${player.registrationId}`}
                    onClick={() => resetAttendance(player.registrationId)}
                    disabled={isOverriding || isRefreshing || player.status === null}
                    className="min-h-[44px] rounded-xl border border-stone-300 bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-all duration-150 hover:bg-stone-50 disabled:opacity-60"
                  >
                    Återställ närvaro
                  </button>
                </div>
              </div>
            )
          })}

          {data.players.length === 0 && (
            <p className="px-1 text-sm text-muted">Inga spelare registrerade i denna klass.</p>
          )}
        </section>
      </div>
    </main>
  )
}
