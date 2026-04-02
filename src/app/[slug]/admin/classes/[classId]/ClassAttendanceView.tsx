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
        className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap"
      >
        Bekräftad
      </span>
    )
  }
  if (status === 'absent') {
    return (
      <span
        data-testid={`status-badge-${registrationId}`}
        className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 whitespace-nowrap"
      >
        Frånvaro
      </span>
    )
  }
  return (
    <span
      data-testid={`status-badge-${registrationId}`}
      className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 whitespace-nowrap"
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
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">Laddar...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">Klassen hittades inte.</p>
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
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <button
                data-testid="back-to-dashboard"
                onClick={() => router.push(`/${slug}/admin/dashboard`)}
                className="text-indigo-600 text-sm hover:underline mb-1"
              >
                ← Tillbaka
              </button>
              <p data-testid="class-competition-name" className="text-sm text-gray-500">
                {competitionName}
              </p>
              <h1 className="text-lg font-bold text-gray-900">{data.class.name}</h1>
              <p className="text-xs text-gray-400">
                Start {formatTime(data.class.startTime)}
                {' · '}
                <span>
                  Deadline {formatTime(data.class.attendanceDeadline)}
                  {isPastDeadline ? ' (passerad)' : ''}
                </span>
              </p>
            </div>
            <div className="text-right shrink-0">
              <AutoRefreshStatus
                intervalSeconds={REFRESH_INTERVAL_SECONDS}
                isRefreshing={isRefreshing}
                updatedAt={updatedAt}
                secondsUntilNextRefresh={secondsUntilNextRefresh}
              />
              <button
                data-testid="export-csv-button"
                onClick={downloadCsv}
                className="mt-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded font-medium transition-colors"
              >
                Exportera CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-2 flex gap-6 text-sm">
          <span className="text-green-700 font-medium">✓ Bekräftade: {confirmed.length}</span>
          <span className="text-red-700 font-medium">✗ Frånvaro: {absent.length}</span>
          <span className={`font-medium ${noResponse.length > 0 && isPastDeadline ? 'text-orange-600' : 'text-gray-500'}`}>
            ? Ej rapporterat: {noResponse.length}
          </span>
          <span className="text-gray-400">Totalt: {data.players.length}</span>
          <span className="text-gray-500">Svar inkomna: {answeredCount}/{data.players.length}</span>
        </div>
      </div>

      {isPastDeadline && noResponse.length > 0 && (
        <div
          data-testid="past-deadline-warning"
          className="border-b border-amber-300 bg-amber-50"
        >
          <div className="max-w-4xl mx-auto px-4 py-3">
            <p className="text-sm font-semibold text-amber-950">
              Deadline har passerat. {noResponse.length} spelare saknas fortfarande.
            </p>
            <p className="mt-1 text-sm text-amber-800">
              Dessa spelare bör ropas upp i sekretariatet: {missingPlayersText.join(', ')}.
            </p>
          </div>
        </div>
      )}

      {isFullyAttended && (
        <div
          data-testid="attendance-complete-banner"
          className="border-b border-emerald-200 bg-emerald-50"
        >
          <div className="max-w-4xl mx-auto px-4 py-3">
            <p className="text-sm font-semibold text-emerald-900">
              Alla {data.players.length} spelare har svarat i klassen.
            </p>
            <p className="text-sm text-emerald-700">
              Listan är komplett och uppdateras fortfarande automatiskt.
            </p>
          </div>
        </div>
      )}

      {overrideError && (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <p data-testid="override-error" className="text-red-600 text-sm">{overrideError}</p>
        </div>
      )}

      {/* Player list */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="bg-white rounded-lg shadow-sm divide-y">
          {data.players.map(player => {
            const isOverriding = overriding === player.registrationId
            return (
              <div
                key={player.registrationId}
                data-testid={`player-row-${player.registrationId}`}
                className="flex items-center px-4 py-3 gap-3"
              >
                {/* Player info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{player.name}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {player.club ?? '–'}
                    {player.reportedAt && (
                      <span className="ml-2">
                        · {formatTime(player.reportedAt)}
                        {player.reportedBy === 'admin' ? ' (admin)' : ' (spelare)'}
                      </span>
                    )}
                  </p>
                </div>

                {/* Status badge */}
                <StatusBadge status={player.status} registrationId={player.registrationId} />

                {/* Override buttons — always visible for admin */}
                <div className="flex gap-2 shrink-0">
                  <button
                    data-testid={`confirm-btn-${player.registrationId}`}
                    onClick={() => setAttendance(player.registrationId, 'confirmed')}
                    disabled={isOverriding || isRefreshing || player.status === 'confirmed'}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
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
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      player.status === 'absent'
                        ? 'bg-red-600 text-white cursor-default'
                        : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                    } disabled:opacity-60`}
                  >
                    Frånvaro
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {data.players.length === 0 && (
          <p className="text-gray-500 text-sm mt-4">Inga spelare registrerade i denna klass.</p>
        )}
      </div>
    </div>
  )
}
