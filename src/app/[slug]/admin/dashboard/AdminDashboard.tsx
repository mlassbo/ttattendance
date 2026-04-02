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
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Sekretariat</p>
            <p data-testid="dashboard-competition-name" className="text-sm text-gray-500">
              {competitionName}
            </p>
            <h1 className="text-lg font-bold text-gray-900">Närvaro</h1>
          </div>
          <AutoRefreshStatus
            intervalSeconds={REFRESH_INTERVAL_SECONDS}
            isRefreshing={isRefreshing}
            updatedAt={updatedAt}
            secondsUntilNextRefresh={secondsUntilNextRefresh}
          />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {loading && (
          <p className="text-gray-500 text-sm">Laddar...</p>
        )}

        {error && (
          <p className="text-red-600 text-sm mb-4">{error}</p>
        )}

        {overdueClasses.length > 0 && (
          <div
            data-testid="dashboard-overdue-summary"
            className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm"
          >
            <p className="text-sm font-semibold text-amber-950">
              Deadline passerad i {formatClassCount(overdueClasses.length)}.
            </p>
            <p className="mt-1 text-sm text-amber-800">
              {formatPlayerCount(overdueMissingPlayers)} saknas fortfarande och bör ropas upp i sekretariatet.
            </p>
          </div>
        )}

        {!loading && sessions.length === 0 && !error && (
          <p className="text-gray-500 text-sm">Inga pass hittades.</p>
        )}

        <div className="space-y-8">
          {sessions.map(session => (
            <div key={session.id}>
              <h2 className="text-base font-semibold text-gray-700 mb-2">
                {session.name}
                <span className="ml-2 text-sm font-normal text-gray-400">
                  {formatDate(session.date)}
                </span>
              </h2>
              <div className="bg-white rounded-lg shadow-sm divide-y">
                {session.classes.map(cls => {
                  const isPastDeadline = new Date() > new Date(cls.attendanceDeadline)
                  const needsAnnouncement = isPastDeadline && cls.counts.noResponse > 0
                  const answeredCount = cls.counts.confirmed + cls.counts.absent
                  const isFullyAttended = cls.counts.total > 0 && cls.counts.noResponse === 0
                  return (
                    <div
                      key={cls.id}
                      data-testid={`class-row-${cls.id}`}
                      className={`flex items-center px-4 py-3 gap-4 ${
                        needsAnnouncement
                          ? 'border-l-4 border-amber-500 bg-amber-50/80'
                          : isFullyAttended
                            ? 'bg-emerald-50/80'
                            : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-gray-900 truncate">{cls.name}</p>
                          {needsAnnouncement && (
                            <span
                              data-testid={`class-overdue-badge-${cls.id}`}
                              className="inline-flex items-center rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-950"
                            >
                              Deadline passerad · {cls.counts.noResponse} saknas
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          Start {formatTime(cls.startTime)}
                          {' · '}
                          <span className={needsAnnouncement ? 'text-amber-700 font-semibold' : ''}>
                            Deadline {formatTime(cls.attendanceDeadline)}
                            {needsAnnouncement ? ' - ropa upp saknade spelare' : ''}
                          </span>
                        </p>
                      </div>

                      {/* Counts */}
                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          data-testid={`count-confirmed-${cls.id}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full"
                          title="Bekräftade"
                        >
                          <span>✓</span> {cls.counts.confirmed}
                        </span>
                        <span
                          data-testid={`count-absent-${cls.id}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full"
                          title="Frånvaro"
                        >
                          <span>✗</span> {cls.counts.absent}
                        </span>
                        <span
                          data-testid={`count-no-response-${cls.id}`}
                          className={`inline-flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded-full ${
                            cls.counts.noResponse > 0 && isPastDeadline
                              ? 'text-orange-700 bg-orange-50'
                              : 'text-gray-500 bg-gray-100'
                          }`}
                          title="Ej rapporterat"
                        >
                          <span>?</span> {cls.counts.noResponse}
                        </span>
                      </div>

                      <div className="shrink-0 text-right">
                        {needsAnnouncement ? (
                          <p className="text-xs font-semibold text-amber-800">
                            Ropa upp {cls.counts.noResponse}
                          </p>
                        ) : isFullyAttended ? (
                          <span
                            data-testid={`class-complete-badge-${cls.id}`}
                            className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800"
                          >
                            Alla har svarat
                          </span>
                        ) : cls.counts.total === 0 ? (
                          <p className="text-xs font-medium text-gray-500">Inga spelare</p>
                        ) : (
                          <p className="text-xs font-medium text-gray-500">
                            {answeredCount}/{cls.counts.total} svar
                          </p>
                        )}
                      </div>

                      <Link
                        data-testid={`class-detail-link-${cls.id}`}
                        href={`/${slug}/admin/classes/${cls.id}`}
                        className="shrink-0 text-sm text-indigo-600 hover:underline font-medium"
                      >
                        Visa →
                      </Link>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
