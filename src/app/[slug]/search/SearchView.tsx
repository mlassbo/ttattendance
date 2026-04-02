'use client'

import { useEffect, useRef, useState } from 'react'
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
  session: Session | null
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

interface Player {
  id: string
  name: string
  club: string | null
  registrations: Registration[]
}

type SearchMode = 'player' | 'club'

export default function SearchView({
  competitionName,
  competitionStartDate,
}: {
  competitionName: string
  competitionStartDate: string
}) {
  const [searchMode, setSearchMode] = useState<SearchMode>('player')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [playerMessages, setPlayerMessages] = useState<Record<string, string | null>>({})
  // Tracks the query value for which the last fetch completed. "No results"
  // is only shown when this matches the current query, preventing flicker
  // during the debounce window and the one-frame gap before effects fire.
  const [fetchedQuery, setFetchedQuery] = useState('')
  const submittingRef = useRef(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const attendanceOpensAt = getCompetitionAttendanceOpensAt(competitionStartDate)
  const attendanceIsOpen = isCompetitionAttendanceOpen(competitionStartDate, now)

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      setLoading(false)
      setFetchedQuery(query)
      setPlayerMessages({})
      return
    }

    setLoading(true)

    // 500 ms debounce — reduces server load during peak event usage.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/players/search?q=${encodeURIComponent(query)}&mode=${searchMode}`
        )
        if (res.ok) {
          const data = await res.json()
          setResults(data.players ?? [])
        } else {
          setResults([])
        }
      } catch {
        setResults([])
      } finally {
        setFetchedQuery(query)
        setLoading(false)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [query, searchMode])

  function selectSearchMode(nextMode: SearchMode) {
    setSearchMode(prevMode => {
      if (prevMode === nextMode) {
        return prevMode
      }

      setQuery('')
      setResults([])
      setLoading(false)
      setFetchedQuery('')
      setPlayerMessages({})

      return nextMode
    })
  }

  async function submitAttendance(
    playerId: string,
    registrationId: string,
    status: 'confirmed' | 'absent'
  ) {
    if (submittingRef.current) return

    submittingRef.current = true
    setSubmitting(registrationId)
    setPlayerMessages(prev => ({ ...prev, [playerId]: null }))

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

      const payload = res.ok ? null : await res.json().catch(() => null)

      if (res.ok) {
        setResults(prev =>
          prev.map(player => {
            if (player.id !== playerId) return player

            return {
              ...player,
              registrations: player.registrations.map(registration =>
                registration.registrationId === registrationId
                  ? {
                      ...registration,
                      attendance: { status, reportedAt: new Date().toISOString() },
                    }
                  : registration
              ),
            }
          })
        )
        return
      }

      const message =
        payload?.code === 'attendance_not_open'
          ? getAttendanceNotOpenMessage(payload.opensAt ?? attendanceOpensAt)
          : payload?.error ?? 'Något gick fel, försök igen'

      setPlayerMessages(prev => ({ ...prev, [playerId]: message }))
    } catch {
      setPlayerMessages(prev => ({ ...prev, [playerId]: 'Nätverksfel, försök igen' }))
    } finally {
      submittingRef.current = false
      setSubmitting(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{competitionName}</h1>
        {!attendanceIsOpen && (
          <p
            data-testid="attendance-not-open-banner"
            className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            {getAttendanceNotOpenMessage(attendanceOpensAt)}
          </p>
        )}
        <div
          role="tablist"
          aria-label="Söktyp"
          className="mb-4 flex border-b border-gray-200"
        >
          <button
            data-testid="search-mode-player"
            type="button"
            role="tab"
            aria-selected={searchMode === 'player'}
            onClick={() => selectSearchMode('player')}
            className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              searchMode === 'player'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Sök spelare
          </button>
          <button
            data-testid="search-mode-club"
            type="button"
            role="tab"
            aria-selected={searchMode === 'club'}
            onClick={() => selectSearchMode('club')}
            className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              searchMode === 'club'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Sök klubb
          </button>
        </div>
        <input
          data-testid="search-input"
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={
            searchMode === 'player'
              ? 'Sök spelare...'
              : 'Sök klubb...'
          }
          className="w-full border border-gray-300 rounded-md px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
          autoFocus
        />
        {loading && (
          <p className="text-gray-500 text-sm mb-2">Söker...</p>
        )}
        {!loading && fetchedQuery === query && query.length >= 2 && results.length === 0 && (
          <p data-testid="no-results" className="text-gray-500 text-sm mb-2">
            {searchMode === 'player'
              ? 'Inga spelare hittades.'
              : 'Inga klubbar hittades.'}
          </p>
        )}
        <ul data-testid="search-results" className="space-y-2">
          {results.map(player => (
            <li
              key={player.id}
              data-testid={`player-result-card-${player.id}`}
              className="rounded-md border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3">
                <div>
                  <p className="font-medium text-gray-900">{player.name}</p>
                  {player.club && (
                    <p className="text-sm text-gray-500">{player.club}</p>
                  )}
                </div>
              </div>

              {playerMessages[player.id] && (
                <p
                  data-testid={`player-message-${player.id}`}
                  className="mb-3 text-sm text-red-600"
                >
                  {playerMessages[player.id]}
                </p>
              )}

              {player.registrations.length === 0 ? (
                <p className="text-sm text-gray-500">Inga klasser registrerade.</p>
              ) : (
                <div className="space-y-4">
                  {Array.from(
                    player.registrations.reduce(
                      (groups, registration) => {
                        const session = registration.class.session
                        const key = session?.id ?? 'unknown'
                        const existing = groups.get(key)

                        if (existing) {
                          existing.registrations.push(registration)
                          return groups
                        }

                        groups.set(key, { session, registrations: [registration] })
                        return groups
                      },
                      new Map<string, { session: Session | null; registrations: Registration[] }>()
                    ).values()
                  ).map(group => (
                    <section key={group.session?.id ?? group.registrations[0].registrationId}>
                      <h3
                        data-testid={`search-session-${player.id}-${group.session?.id ?? 'unknown'}`}
                        className="mb-2 border-b border-gray-200 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500"
                      >
                        {group.session
                          ? formatPlayerSessionLabel(
                              group.session.date,
                              group.session.daySessionOrder ?? group.session.sessionOrder
                            )
                          : 'Okänt pass'}
                      </h3>
                      <div className="space-y-2">
                        {group.registrations.map(registration => {
                          const availability = getPlayerAttendanceAvailability(
                            competitionStartDate,
                            registration.class.attendanceDeadline,
                            now
                          )
                          const currentStatus = registration.attendance?.status ?? null
                          const isSubmitting = submitting === registration.registrationId

                          return (
                            <div
                              key={registration.registrationId}
                              className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3"
                            >
                              <div className="mb-2 flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-gray-900">
                                    {registration.class.name}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    Start {formatSwedishTime(registration.class.startTime)}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    Anmäl senast {formatSwedishTime(registration.class.attendanceDeadline)}
                                  </p>
                                </div>
                                {currentStatus && (
                                  <span
                                    data-testid={`search-status-badge-${registration.registrationId}`}
                                    className={`rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap ${
                                      currentStatus === 'confirmed'
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-red-100 text-red-700'
                                    }`}
                                  >
                                    {currentStatus === 'confirmed' ? 'Bekräftad' : 'Frånvaro'}
                                  </span>
                                )}
                              </div>

                              {availability.state === 'not_open' ? (
                                <p
                                  data-testid={`attendance-not-open-${registration.registrationId}`}
                                  className="text-xs text-amber-700"
                                >
                                  {getAttendanceNotOpenMessage(availability.attendanceOpensAt)}
                                </p>
                              ) : availability.state === 'deadline_passed' ? (
                                <p
                                  data-testid={`search-deadline-passed-${registration.registrationId}`}
                                  className="text-xs text-gray-500"
                                >
                                  Anmälningstiden har gått ut
                                </p>
                              ) : (
                                <div className="flex gap-2">
                                  <button
                                    data-testid={`search-confirm-btn-${registration.registrationId}`}
                                    onClick={() =>
                                      submitAttendance(player.id, registration.registrationId, 'confirmed')
                                    }
                                    disabled={isSubmitting || currentStatus === 'confirmed'}
                                    className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                                      currentStatus === 'confirmed'
                                        ? 'bg-green-600 text-white cursor-default'
                                        : 'border border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                                    } disabled:opacity-60`}
                                  >
                                    Bekräfta
                                  </button>
                                  <button
                                    data-testid={`search-absent-btn-${registration.registrationId}`}
                                    onClick={() =>
                                      submitAttendance(player.id, registration.registrationId, 'absent')
                                    }
                                    disabled={isSubmitting || currentStatus === 'absent'}
                                    className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                                      currentStatus === 'absent'
                                        ? 'bg-red-600 text-white cursor-default'
                                        : 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                    } disabled:opacity-60`}
                                  >
                                    Frånvaro
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
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
