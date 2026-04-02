'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  formatSwedishTime,
  getAttendanceNotOpenMessage,
  getCompetitionAttendanceOpensAt,
  getPlayerAttendanceAvailability,
  isCompetitionAttendanceOpen,
} from '@/lib/attendance-window'
import { formatPlayerSessionLabel } from '@/lib/session-format'

interface Session {
  id: string
  name: string
  date: string
  sessionOrder: number
  daySessionOrder?: number
}

interface ClassInfo {
  id: string
  name: string
  startTime: string
  attendanceDeadline: string
  session: Session
}

interface AttendanceInfo {
  status: 'confirmed' | 'absent'
  reportedAt: string
}

interface Registration {
  registrationId: string
  class: ClassInfo
  attendance: AttendanceInfo | null
}

interface PlayerData {
  player: { id: string; name: string; club: string | null }
  registrations: Registration[]
}

export default function ClassesView({
  slug,
  playerId,
  competitionFirstClassStart,
}: {
  slug: string
  playerId: string
  competitionFirstClassStart: string | null
}) {
  const router = useRouter()
  const [data, setData] = useState<PlayerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const submittingRef = useRef(false)
  // Live clock: re-evaluates deadline status every minute so buttons disappear
  // on deadline without requiring a page refresh.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/players/${playerId}/classes`)
      if (res.status === 401) {
        router.push(`/${slug}/player`)
        return
      }
      if (res.ok) {
        setData(await res.json())
        setUpdatedAt(new Date())
      }
    } catch {
      // network failure — leave existing data, spinner stops via finally
    } finally {
      setLoading(false)
    }
  }, [playerId, slug, router])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function submitAttendance(registrationId: string, status: 'confirmed' | 'absent') {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(registrationId)
    setActionError(null)

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationId,
          status,
          // Deterministic per (registration, intent) so retries after a dropped
          // response use the same key rather than creating a phantom duplicate.
          idempotencyKey: `${registrationId}:${status}`,
        }),
      })

      const payload = res.ok ? null : await res.json().catch(() => null)

      if (res.ok) {
        // Optimistic update — reflect the new status immediately.
        setData(prev => {
          if (!prev) return prev
          return {
            ...prev,
            registrations: prev.registrations.map(r =>
              r.registrationId === registrationId
                ? { ...r, attendance: { status, reportedAt: new Date().toISOString() } }
                : r
            ),
          }
        })
        setUpdatedAt(new Date())
      } else if (res.status === 409) {
        const message =
          payload?.code === 'competition_schedule_missing'
            ? 'Tävlingsschemat är inte importerat än.'
            : payload?.code === 'attendance_not_open' && competitionFirstClassStart
              ? getAttendanceNotOpenMessage(
                  payload.opensAt ?? getCompetitionAttendanceOpensAt(competitionFirstClassStart)
                )
            : payload?.error ?? 'Anmälningstiden har gått ut'

        setActionError(message)

        if (payload?.code === 'deadline_passed') {
          await fetchData()
        }
      } else {
        setActionError(payload?.error ?? 'Något gick fel, försök igen')
      }
    } catch {
      setActionError('Nätverksfel, försök igen')
    } finally {
      submittingRef.current = false
      setSubmitting(null)
    }
  }

  if (loading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-muted">Laddar...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-muted">Spelaren hittades inte.</p>
      </div>
    )
  }

  const competitionScheduleMissingMessage = 'Tävlingsschemat är inte importerat än.'
  const attendanceOpensAt = competitionFirstClassStart
    ? getCompetitionAttendanceOpensAt(competitionFirstClassStart)
    : null
  const attendanceIsOpen = competitionFirstClassStart
    ? isCompetitionAttendanceOpen(competitionFirstClassStart, now)
    : false

  // Group registrations by session.
  const sessionGroups = new Map<string, { session: Session; registrations: Registration[] }>()
  for (const reg of data.registrations) {
    const sid = reg.class.session.id
    if (!sessionGroups.has(sid)) {
      sessionGroups.set(sid, { session: reg.class.session, registrations: [] })
    }
    sessionGroups.get(sid)!.registrations.push(reg)
  }

  return (
    <main className="app-shell">
      <div className="mx-auto max-w-2xl space-y-4">
        <section className="app-card space-y-4">
          <button
            data-testid="back-button"
            onClick={() => router.push(`/${slug}/search`)}
            className="w-fit text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-hover"
          >
            ← Sök igen
          </button>

          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-ink">{data.player.name}</h1>
            {data.player.club && <p className="text-sm text-muted">{data.player.club}</p>}
            {updatedAt && (
              <p className="text-xs font-medium text-muted/80">
                Senast uppdaterad: {formatSwedishTime(updatedAt)}
              </p>
            )}
          </div>
        </section>

        {!competitionFirstClassStart ? (
          <p data-testid="attendance-not-open-banner" className="app-banner-warning">
            {competitionScheduleMissingMessage}
          </p>
        ) : !attendanceIsOpen && attendanceOpensAt ? (
          <p data-testid="attendance-not-open-banner" className="app-banner-warning">
            {getAttendanceNotOpenMessage(attendanceOpensAt)}
          </p>
        ) : null}

        {actionError && (
          <p data-testid="deadline-error" className="app-banner-error">
            {actionError}
          </p>
        )}

        {data.registrations.length === 0 && <p className="px-1 text-sm text-muted">Inga klasser registrerade.</p>}

        {Array.from(sessionGroups.values()).map(({ session, registrations }) => (
          <section key={session.id} className="space-y-3">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              {formatPlayerSessionLabel(
                session.date,
                session.daySessionOrder ?? session.sessionOrder
              )}
            </h2>
            <div className="space-y-3">
              {registrations.map(reg => {
                const availability = competitionFirstClassStart
                  ? getPlayerAttendanceAvailability(
                      competitionFirstClassStart,
                      reg.class.attendanceDeadline,
                      now,
                    )
                  : null
                const isSubmitting = submitting === reg.registrationId
                const currentStatus = reg.attendance?.status ?? null

                return (
                  <div
                    key={reg.registrationId}
                    data-testid={`class-card-${reg.registrationId}`}
                    className="app-card"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-ink">{reg.class.name}</p>
                        <p className="text-sm text-muted">
                          Start: {formatSwedishTime(reg.class.startTime)}
                        </p>
                        <p className="text-xs text-muted/80">
                          Anmäl senast: {formatSwedishTime(reg.class.attendanceDeadline)}
                        </p>
                      </div>
                      {currentStatus && (
                        <span
                          data-testid={`status-badge-${reg.registrationId}`}
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${
                            currentStatus === 'confirmed'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {currentStatus === 'confirmed' ? 'Bekräftad' : 'Frånvaro'}
                        </span>
                      )}
                    </div>

                    {!availability ? (
                      <p
                        data-testid={`attendance-not-open-${reg.registrationId}`}
                        className="text-xs font-medium text-amber-800"
                      >
                        {competitionScheduleMissingMessage}
                      </p>
                    ) : availability.state === 'not_open' ? (
                      <p
                        data-testid={`attendance-not-open-${reg.registrationId}`}
                        className="text-xs font-medium text-amber-800"
                      >
                        {getAttendanceNotOpenMessage(availability.attendanceOpensAt)}
                      </p>
                    ) : availability.state === 'deadline_passed' ? (
                      <p
                        data-testid={`deadline-passed-${reg.registrationId}`}
                        className="text-xs font-medium text-muted"
                      >
                        Anmälningstiden har gått ut
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          data-testid={`confirm-btn-${reg.registrationId}`}
                          onClick={() => submitAttendance(reg.registrationId, 'confirmed')}
                          disabled={isSubmitting || currentStatus === 'confirmed'}
                          className={`min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 ${
                            currentStatus === 'confirmed'
                              ? 'bg-green-600 text-white cursor-default'
                              : 'border border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                          } disabled:opacity-60`}
                        >
                          Bekräfta närvaro
                        </button>
                        <button
                          data-testid={`absent-btn-${reg.registrationId}`}
                          onClick={() => submitAttendance(reg.registrationId, 'absent')}
                          disabled={isSubmitting || currentStatus === 'absent'}
                          className={`min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 ${
                            currentStatus === 'absent'
                              ? 'bg-red-600 text-white cursor-default'
                              : 'border border-red-200 bg-surface text-red-700 hover:bg-red-50'
                          } disabled:opacity-60`}
                        >
                          Anmäl frånvaro
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
