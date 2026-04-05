'use client'

import { useEffect, useRef, useState } from 'react'
import {
  formatSwedishTime,
  getAttendanceNotOpenMessage,
  getPlayerAttendanceAvailability,
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

const SEARCH_DEBOUNCE_MS = 250

function getAttendanceStatusCopy(status: 'confirmed' | 'absent') {
  if (status === 'confirmed') {
    return {
      badgeLabel: 'Närvaro bekräftad',
      title: 'Närvaro bekräftad',
      description: 'Spelaren är markerad som närvarande i klassen.',
      containerClassName: 'border-green-200 bg-green-50 text-green-900',
      descriptionClassName: 'text-green-800',
    }
  }

  return {
    badgeLabel: 'Frånvaro',
    title: 'Frånvaro anmäld',
    description: 'Spelaren är markerad som frånvarande i klassen.',
    containerClassName: 'border-red-200 bg-red-50 text-red-900',
    descriptionClassName: 'text-red-700',
  }
}

function getDeadlinePassedWithoutAttendanceCopy() {
  return {
    title: 'Ingen närvaro är registrerad',
    description: 'Anmälningstiden har gått ut och ingen närvaro är registrerad för klassen. Kontakta sekretariatet.',
    containerClassName: 'border-amber-200 bg-amber-50 text-amber-950',
    descriptionClassName: 'text-amber-900',
  }
}

export default function SearchView({
  competitionName,
  competitionFirstClassStart,
}: {
  competitionName: string
  competitionFirstClassStart: string | null
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
  const searchTerm = query.trim()

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const competitionScheduleMissingMessage = 'Tävlingsschemat är inte importerat än.'

  useEffect(() => {
    if (searchTerm.length < 2) {
      setResults([])
      setLoading(false)
      setFetchedQuery(searchTerm)
      setPlayerMessages({})
      return
    }

    setLoading(true)
    let controller: AbortController | null = null

    // Short debounce plus aborting stale requests keeps search responsive
    // without flooding the backend when users type quickly.
    const timer = setTimeout(async () => {
      try {
        controller = new AbortController()
        const res = await fetch(
          `/api/players/search?q=${encodeURIComponent(searchTerm)}&mode=${searchMode}`,
          { signal: controller.signal }
        )
        if (res.ok) {
          const data = await res.json()
          setResults(data.players ?? [])
        } else {
          setResults([])
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        setResults([])
      } finally {
        if (!controller?.signal.aborted) {
          setFetchedQuery(searchTerm)
          setLoading(false)
        }
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller?.abort()
    }
  }, [searchMode, searchTerm])

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
        payload?.code === 'competition_schedule_missing'
          ? competitionScheduleMissingMessage
          : payload?.code === 'attendance_not_open' && payload?.opensAt
            ? getAttendanceNotOpenMessage(payload.opensAt)
          : payload?.error ?? 'Något gick fel, försök igen'

      setPlayerMessages(prev => ({ ...prev, [playerId]: message }))
    } catch {
      setPlayerMessages(prev => ({ ...prev, [playerId]: 'Nätverksfel, försök igen' }))
    } finally {
      submittingRef.current = false
      setSubmitting(null)
    }
  }

  async function resetAttendance(playerId: string, registrationId: string) {
    if (submittingRef.current) return

    submittingRef.current = true
    setSubmitting(registrationId)
    setPlayerMessages(prev => ({ ...prev, [playerId]: null }))

    try {
      const res = await fetch('/api/attendance', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId }),
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
                      attendance: null,
                    }
                  : registration
              ),
            }
          })
        )
        return
      }

      const message =
        payload?.code === 'competition_schedule_missing'
          ? competitionScheduleMissingMessage
          : payload?.code === 'attendance_not_open' && payload?.opensAt
            ? getAttendanceNotOpenMessage(payload.opensAt)
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
    <main className="app-shell">
      <div className="mx-auto max-w-2xl space-y-4">
        <section className="app-card space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
              Spelare
            </p>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-ink">{competitionName}</h1>
              <p className="mt-2 text-sm leading-6 text-muted">
                Sök snabbt efter spelare eller klubb och rapportera närvaro direkt.
              </p>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Söktyp"
            className="grid grid-cols-2 gap-2 rounded-2xl bg-brand-soft/60 p-1"
          >
            <button
              data-testid="search-mode-player"
              type="button"
              role="tab"
              aria-selected={searchMode === 'player'}
              onClick={() => selectSearchMode('player')}
              className={`rounded-xl px-4 py-3 text-sm font-medium transition-all duration-150 ${
                searchMode === 'player'
                  ? 'bg-surface text-brand shadow-sm'
                  : 'text-muted hover:bg-surface/70 hover:text-ink'
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
              className={`rounded-xl px-4 py-3 text-sm font-medium transition-all duration-150 ${
                searchMode === 'club'
                  ? 'bg-surface text-brand shadow-sm'
                  : 'text-muted hover:bg-surface/70 hover:text-ink'
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
            placeholder={searchMode === 'player' ? 'Sök spelare...' : 'Sök klubb...'}
            className="app-input text-lg"
            autoFocus
          />
        </section>

        {!competitionFirstClassStart ? (
          <p
            data-testid="attendance-not-open-banner"
            className="app-banner-warning"
          >
            {competitionScheduleMissingMessage}
          </p>
        ) : null}

        {loading && <p className="px-1 text-sm text-muted">Söker...</p>}

        {!loading && fetchedQuery === searchTerm && searchTerm.length >= 2 && results.length === 0 && (
          <p data-testid="no-results" className="px-1 text-sm text-muted">
            {searchMode === 'player' ? 'Inga spelare hittades.' : 'Inga klubbar hittades.'}
          </p>
        )}

        <ul data-testid="search-results" className="space-y-3">
          {results.map(player => (
            <li
              key={player.id}
              data-testid={`player-result-card-${player.id}`}
              className="app-card"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-ink">{player.name}</p>
                  {player.club && <p className="text-sm text-muted">{player.club}</p>}
                </div>
                <span className="app-pill-muted">{player.registrations.length} klasser</span>
              </div>

              {playerMessages[player.id] && (
                <p data-testid={`player-message-${player.id}`} className="app-banner-error mb-4">
                  {playerMessages[player.id]}
                </p>
              )}

              {player.registrations.length === 0 ? (
                <p className="text-sm text-muted">Inga klasser registrerade.</p>
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
                        className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted"
                      >
                        {group.session
                          ? formatPlayerSessionLabel(
                              group.session.date,
                              group.session.daySessionOrder ?? group.session.sessionOrder
                            )
                          : 'Okänt pass'}
                      </h3>
                      <div className="space-y-3">
                        {group.registrations.map(registration => {
                          const availability = competitionFirstClassStart
                            ? getPlayerAttendanceAvailability(
                                registration.class.startTime,
                                registration.class.attendanceDeadline,
                                now,
                              )
                            : null
                          const currentStatus = registration.attendance?.status ?? null
                          const isSubmitting = submitting === registration.registrationId
                          const statusCopy = currentStatus ? getAttendanceStatusCopy(currentStatus) : null
                          const showMissingAttendanceWarning =
                            availability?.state === 'deadline_passed' && !currentStatus
                          const missingAttendanceCopy = showMissingAttendanceWarning
                            ? getDeadlinePassedWithoutAttendanceCopy()
                            : null

                          return (
                            <div
                              key={registration.registrationId}
                              className="rounded-2xl border border-line bg-brand-soft/25 px-4 py-4"
                            >
                              <div className="mb-3 flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-ink">
                                    {registration.class.name}
                                  </p>
                                  <p className="text-xs text-muted">
                                    Start {formatSwedishTime(registration.class.startTime)}
                                  </p>
                                  <p className="text-xs text-muted/80">
                                    Anmäl senast {formatSwedishTime(registration.class.attendanceDeadline)}
                                  </p>
                                </div>
                                {currentStatus && (
                                  <span
                                    data-testid={`search-status-badge-${registration.registrationId}`}
                                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${
                                      currentStatus === 'confirmed'
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-red-100 text-red-700'
                                    }`}
                                  >
                                    {statusCopy?.badgeLabel}
                                  </span>
                                )}
                              </div>

                              {statusCopy && (
                                <div
                                  data-testid={`search-status-summary-${registration.registrationId}`}
                                  className={`mb-4 rounded-2xl border px-4 py-3 ${statusCopy.containerClassName}`}
                                >
                                  <p className="text-sm font-semibold">{statusCopy.title}</p>
                                  <p className={`mt-1 text-sm ${statusCopy.descriptionClassName}`}>
                                    {statusCopy.description}
                                  </p>
                                  {registration.attendance?.reportedAt && (
                                    <p className="mt-2 text-xs font-medium opacity-80">
                                      Rapporterad {formatSwedishTime(registration.attendance.reportedAt)}
                                    </p>
                                  )}
                                </div>
                              )}

                              {missingAttendanceCopy && (
                                <div
                                  data-testid={`search-missing-attendance-${registration.registrationId}`}
                                  className={`mb-4 rounded-2xl border px-4 py-3 ${missingAttendanceCopy.containerClassName}`}
                                >
                                  <p className="text-sm font-semibold">{missingAttendanceCopy.title}</p>
                                  <p className={`mt-1 text-sm ${missingAttendanceCopy.descriptionClassName}`}>
                                    {missingAttendanceCopy.description}
                                  </p>
                                </div>
                              )}

                              {!availability ? (
                                <p
                                  data-testid={`attendance-not-open-${registration.registrationId}`}
                                  className="text-xs font-medium text-amber-800"
                                >
                                  {competitionScheduleMissingMessage}
                                </p>
                              ) : availability.state === 'not_open' ? (
                                <p
                                  data-testid={`attendance-not-open-${registration.registrationId}`}
                                  className="text-xs font-medium text-amber-800"
                                >
                                  {getAttendanceNotOpenMessage(availability.attendanceOpensAt)}
                                </p>
                              ) : availability.state === 'deadline_passed' ? null : currentStatus ? (
                                <button
                                  data-testid={`search-reset-btn-${registration.registrationId}`}
                                  onClick={() =>
                                    resetAttendance(player.id, registration.registrationId)
                                  }
                                  disabled={isSubmitting}
                                  className="app-button-link"
                                >
                                  Återställ närvaro
                                </button>
                              ) : (
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <button
                                    data-testid={`search-confirm-btn-${registration.registrationId}`}
                                    onClick={() =>
                                      submitAttendance(player.id, registration.registrationId, 'confirmed')
                                    }
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
                                    data-testid={`search-absent-btn-${registration.registrationId}`}
                                    onClick={() =>
                                      submitAttendance(player.id, registration.registrationId, 'absent')
                                    }
                                    disabled={isSubmitting || currentStatus === 'absent'}
                                    className={`min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 ${
                                      currentStatus === 'absent'
                                        ? 'bg-red-600 text-white cursor-default'
                                        : 'border border-red-200 bg-surface text-red-700 hover:bg-red-50'
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
    </main>
  )
}
