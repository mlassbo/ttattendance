'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AutoRefreshStatus from '../AutoRefreshStatus'
import { formatTime } from '../format'

const REFRESH_INTERVAL_MS = 15_000
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
}

interface Session {
  id: string
  name: string
  date: string
  sessionOrder: number
  classes: ClassSummary[]
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
  const refreshInFlightRef = useRef(false)

  const fetchData = useCallback(async () => {
    if (refreshInFlightRef.current) return

    refreshInFlightRef.current = true
    setIsRefreshing(true)

    try {
      const res = await fetch('/api/admin/sessions', { cache: 'no-store' })
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
    if (isRefreshing || secondsUntilNextRefresh === null) return

    const countdown = setInterval(() => {
      setSecondsUntilNextRefresh(current => {
        if (current === null) return null
        return current > 0 ? current - 1 : 0
      })
    }, 1000)

    return () => clearInterval(countdown)
  }, [isRefreshing, secondsUntilNextRefresh])

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
            <h1 className="text-3xl font-semibold tracking-tight text-ink">Närvaro</h1>
            <p className="text-sm leading-6 text-muted">
              Håll koll på svaren i varje pass och fånga upp spelare som fortfarande saknas.
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
              <div className="space-y-3">
                {session.classes.map(cls => {
                  const isPastDeadline = new Date() > new Date(cls.attendanceDeadline)
                  const needsAnnouncement = isPastDeadline && cls.counts.noResponse > 0
                  const answeredCount = cls.counts.confirmed + cls.counts.absent
                  const isFullyAttended = cls.counts.total > 0 && cls.counts.noResponse === 0
                  return (
                    <div
                      key={cls.id}
                      data-testid={`class-row-${cls.id}`}
                      className={`app-card flex flex-col gap-4 sm:flex-row sm:items-stretch ${
                        needsAnnouncement
                          ? 'border-amber-300 bg-amber-50/85'
                          : isFullyAttended
                            ? 'border-green-200 bg-green-50/80'
                            : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-ink truncate">{cls.name}</p>
                          {needsAnnouncement && (
                            <span
                              data-testid={`class-overdue-badge-${cls.id}`}
                              className="app-pill-warning"
                            >
                              Deadline passerad · {cls.counts.noResponse} saknas
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted">
                          Start {formatTime(cls.startTime)}
                          {' · '}
                          <span className={needsAnnouncement ? 'font-semibold text-amber-800' : ''}>
                            Deadline {formatTime(cls.attendanceDeadline)}
                            {needsAnnouncement ? ' - ropa upp saknade spelare' : ''}
                          </span>
                        </p>
                      </div>

                      <div className="grid flex-1 grid-cols-3 gap-2 sm:max-w-sm sm:self-stretch">
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
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line/60 bg-stone-50/80 px-3 py-3 sm:ml-auto sm:min-w-[190px] sm:flex-col sm:items-stretch sm:justify-between sm:text-left">
                        {needsAnnouncement ? (
                          <p className="text-xs font-semibold text-amber-800 sm:text-sm">
                            Ropa upp {cls.counts.noResponse}
                          </p>
                        ) : isFullyAttended ? (
                          <span
                            data-testid={`class-complete-badge-${cls.id}`}
                            className="app-pill-success sm:w-fit"
                          >
                            Alla har svarat
                          </span>
                        ) : cls.counts.total === 0 ? (
                          <p className="text-xs font-medium text-muted sm:text-sm">Inga spelare</p>
                        ) : (
                          <p className="text-xs font-medium text-muted sm:text-sm">
                            {answeredCount}/{cls.counts.total} svar
                          </p>
                        )}

                        <Link
                          data-testid={`class-detail-link-${cls.id}`}
                          href={`/${slug}/admin/classes/${cls.id}`}
                          className="app-button-secondary min-h-10 w-auto shrink-0 px-4 py-2 sm:w-full"
                        >
                          Visa detaljer
                        </Link>
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
