'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AutoRefreshStatus from '../../AutoRefreshStatus'
import { formatTime } from '../../format'

const REFRESH_INTERVAL_MS = 15_000
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

function StatusBadge({
  status,
  registrationId,
}: {
  status: 'confirmed' | 'absent' | null
  registrationId: string
}) {
  if (status === 'confirmed') {
    return (
      <span
        data-testid={`status-badge-${registrationId}`}
        className="app-pill-success whitespace-nowrap"
      >
        Bekräftad
      </span>
    )
  }
  if (status === 'absent') {
    return (
      <span
        data-testid={`status-badge-${registrationId}`}
        className="app-pill-danger whitespace-nowrap"
      >
        Frånvaro
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
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [secondsUntilNextRefresh, setSecondsUntilNextRefresh] = useState<number | null>(null)
  const [overriding, setOverriding] = useState<string | null>(null)
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const overridingRef = useRef(false)
  const refreshInFlightRef = useRef(false)

  const fetchData = useCallback(async () => {
    // Skip poll if an override is in flight to avoid overwriting optimistic state.
    if (overridingRef.current || refreshInFlightRef.current) return

    refreshInFlightRef.current = true
    setIsRefreshing(true)

    try {
      const res = await fetch(`/api/admin/classes/${classId}/attendance`, { cache: 'no-store' })
      if (res.status === 401) {
        router.push(`/${slug}/admin`)
        return
      }
      if (res.ok) {
        setData(await res.json())
        setUpdatedAt(new Date())
        setSecondsUntilNextRefresh(REFRESH_INTERVAL_SECONDS)
      }
    } catch {
      // network error — keep existing data
    } finally {
      setLoading(false)
      setIsRefreshing(false)
      refreshInFlightRef.current = false
    }
  }, [classId, slug, router])

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

  async function setAttendance(registrationId: string, status: 'confirmed' | 'absent') {
    if (overridingRef.current || refreshInFlightRef.current) return
    overridingRef.current = true
    setOverriding(registrationId)
    setOverrideError(null)

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  function downloadCsv() {
    const a = document.createElement('a')
    a.href = `/api/admin/classes/${classId}/export`
    a.click()
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
        <p className="text-muted">Klassen hittades inte.</p>
      </div>
    )
  }

  const isPastDeadline = new Date() > new Date(data.class.attendanceDeadline)

  const confirmed = data.players.filter(p => p.status === 'confirmed')
  const absent = data.players.filter(p => p.status === 'absent')
  const noResponse = data.players.filter(p => p.status === null)
  const missingPlayersText = noResponse.map(player => `${player.name}${player.club ? ` (${player.club})` : ''}`)
  const answeredCount = confirmed.length + absent.length
  const isFullyAttended = data.players.length > 0 && noResponse.length === 0

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
              <button
                data-testid="export-csv-button"
                onClick={downloadCsv}
                className="app-button-secondary mt-3 min-h-10 px-4 py-2 text-xs"
              >
                Exportera CSV
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="app-card-soft text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Bekräftade</p>
            <p className="mt-2 text-2xl font-semibold text-green-700">{confirmed.length}</p>
          </div>
          <div className="app-card-soft text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Frånvaro</p>
            <p className="mt-2 text-2xl font-semibold text-red-700">{absent.length}</p>
          </div>
          <div className="app-card-soft text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Ej rapporterat</p>
            <p className={`mt-2 text-2xl font-semibold ${noResponse.length > 0 && isPastDeadline ? 'text-orange-700' : 'text-muted'}`}>
              {noResponse.length}
            </p>
          </div>
          <div className="app-card-soft text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Totalt</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{data.players.length}</p>
          </div>
          <div className="app-card-soft text-center sm:col-span-2 lg:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Svar inkomna</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{answeredCount}/{data.players.length}</p>
          </div>
        </section>

        {isPastDeadline && noResponse.length > 0 && (
          <div data-testid="past-deadline-warning" className="app-banner-warning">
            <p className="text-sm font-semibold text-amber-950">
              Deadline har passerat. {noResponse.length} spelare saknas fortfarande.
            </p>
            <p className="mt-1 text-sm text-amber-800">
              Dessa spelare bör ropas upp i sekretariatet: {missingPlayersText.join(', ')}.
            </p>
          </div>
        )}

        {isFullyAttended && (
          <div data-testid="attendance-complete-banner" className="app-banner-success">
            <p className="text-sm font-semibold text-green-900">
              Alla {data.players.length} spelare har svarat i klassen.
            </p>
            <p className="text-sm text-green-700">
              Listan är komplett och uppdateras fortfarande automatiskt.
            </p>
          </div>
        )}

        {overrideError && <p data-testid="override-error" className="app-banner-error">{overrideError}</p>}

        <section className="space-y-3">
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
                  <p className="text-xs text-muted/80 truncate">
                    {player.club ?? '–'}
                    {player.reportedAt && (
                      <span className="ml-2">
                        · {formatTime(player.reportedAt)}
                        {player.reportedBy === 'admin' ? ' (admin)' : ' (spelare)'}
                      </span>
                    )}
                  </p>
                </div>

                <StatusBadge status={player.status} registrationId={player.registrationId} />

                <div className="grid gap-2 sm:min-w-[220px] sm:grid-cols-2">
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
