'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Session {
  id: string
  name: string
  date: string
  sessionOrder: number
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
}: {
  slug: string
  playerId: string
}) {
  const router = useRouter()
  const [data, setData] = useState<PlayerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [deadlineError, setDeadlineError] = useState<string | null>(null)
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
        router.push(`/${slug}`)
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
    setDeadlineError(null)

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
        setDeadlineError('Anmälningstiden har gått ut')
        await fetchData()
      } else {
        setDeadlineError('Något gick fel, försök igen')
      }
    } catch {
      setDeadlineError('Nätverksfel, försök igen')
    } finally {
      submittingRef.current = false
      setSubmitting(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Laddar...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Spelaren hittades inte.</p>
      </div>
    )
  }

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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        <button
          data-testid="back-button"
          onClick={() => router.push(`/${slug}/search`)}
          className="text-blue-600 text-sm mb-4 hover:underline"
        >
          ← Sök igen
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">{data.player.name}</h1>
        {data.player.club && (
          <p className="text-gray-500 text-sm mb-1">{data.player.club}</p>
        )}
        {updatedAt && (
          <p className="text-xs text-gray-400 mb-6">
            Senast uppdaterad: {updatedAt.toLocaleTimeString('sv-SE')}
          </p>
        )}

        {deadlineError && (
          <p data-testid="deadline-error" className="text-red-600 text-sm mb-4">
            {deadlineError}
          </p>
        )}

        {data.registrations.length === 0 && (
          <p className="text-gray-500">Inga klasser registrerade.</p>
        )}

        {Array.from(sessionGroups.values()).map(({ session, registrations }) => (
          <div key={session.id} className="mb-8">
            <h2 className="text-base font-semibold text-gray-600 mb-3 border-b pb-2 uppercase tracking-wide text-xs">
              {session.name}
            </h2>
            <div className="space-y-3">
              {registrations.map(reg => {
                const deadline = new Date(reg.class.attendanceDeadline)
                const isPastDeadline = now > deadline
                const isSubmitting = submitting === reg.registrationId
                const currentStatus = reg.attendance?.status ?? null

                return (
                  <div
                    key={reg.registrationId}
                    data-testid={`class-card-${reg.registrationId}`}
                    className="bg-white rounded-lg shadow-sm p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-medium text-gray-900">{reg.class.name}</p>
                        <p className="text-sm text-gray-500">
                          Start:{' '}
                          {new Date(reg.class.startTime).toLocaleTimeString('sv-SE', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                        <p className="text-xs text-gray-400">
                          Anmäl senast:{' '}
                          {deadline.toLocaleTimeString('sv-SE', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      {currentStatus && (
                        <span
                          data-testid={`status-badge-${reg.registrationId}`}
                          className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${
                            currentStatus === 'confirmed'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {currentStatus === 'confirmed' ? 'Bekräftad' : 'Frånvaro'}
                        </span>
                      )}
                    </div>

                    {isPastDeadline ? (
                      <p
                        data-testid={`deadline-passed-${reg.registrationId}`}
                        className="text-xs text-gray-400"
                      >
                        Anmälningstiden har gått ut
                      </p>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          data-testid={`confirm-btn-${reg.registrationId}`}
                          onClick={() => submitAttendance(reg.registrationId, 'confirmed')}
                          disabled={isSubmitting || currentStatus === 'confirmed'}
                          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                            currentStatus === 'confirmed'
                              ? 'bg-green-600 text-white cursor-default'
                              : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                          } disabled:opacity-60`}
                        >
                          Bekräfta närvaro
                        </button>
                        <button
                          data-testid={`absent-btn-${reg.registrationId}`}
                          onClick={() => submitAttendance(reg.registrationId, 'absent')}
                          disabled={isSubmitting || currentStatus === 'absent'}
                          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                            currentStatus === 'absent'
                              ? 'bg-red-600 text-white cursor-default'
                              : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
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
          </div>
        ))}
      </div>
    </div>
  )
}
