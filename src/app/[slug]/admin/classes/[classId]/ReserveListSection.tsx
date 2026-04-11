'use client'

import { useEffect, useRef, useState } from 'react'
import { formatSwedishDateTime } from '@/lib/attendance-window'

export interface ReserveEntry {
  registrationId: string
  position: number
  name: string
  club: string | null
  joinedAt: string | null
}

interface ReservePlayerSuggestion {
  kind: 'existing'
  id: string
  name: string
  club: string | null
  classNames: string[]
}

interface ReserveNewPlayerSuggestion {
  kind: 'new'
  name: string
}

type ReserveSuggestion = ReservePlayerSuggestion | ReserveNewPlayerSuggestion

type ClubSuggestion = {
  name: string
}

export default function ReserveListSection({
  slug,
  classId,
  reserveList,
  onReserveListChange,
  onMutatingChange,
}: {
  slug: string
  classId: string
  reserveList: ReserveEntry[]
  onReserveListChange: (updater: (previous: ReserveEntry[]) => ReserveEntry[]) => void
  onMutatingChange: (mutating: boolean) => void
}) {
  const [showReserveForm, setShowReserveForm] = useState(false)
  const [reserveQuery, setReserveQuery] = useState('')
  const [reserveClub, setReserveClub] = useState('')
  const [reserveSuggestions, setReserveSuggestions] = useState<ReservePlayerSuggestion[]>([])
  const [showReserveSuggestions, setShowReserveSuggestions] = useState(false)
  const [highlightedReserveIndex, setHighlightedReserveIndex] = useState(0)
  const [selectedReserveSuggestion, setSelectedReserveSuggestion] = useState<ReserveSuggestion | null>(null)
  const [reserveClubSuggestions, setReserveClubSuggestions] = useState<ClubSuggestion[]>([])
  const [showReserveClubSuggestions, setShowReserveClubSuggestions] = useState(false)
  const [highlightedReserveClubIndex, setHighlightedReserveClubIndex] = useState(0)
  const [selectedReserveClubSuggestion, setSelectedReserveClubSuggestion] = useState<string | null>(null)
  const [reserveLoading, setReserveLoading] = useState(false)
  const [reserveClubLoading, setReserveClubLoading] = useState(false)
  const [reserveSubmitting, setReserveSubmitting] = useState(false)
  const [reserveRemoving, setReserveRemoving] = useState<string | null>(null)
  const [reserveError, setReserveError] = useState<string | null>(null)
  const [reserveSuggestionsPlacement, setReserveSuggestionsPlacement] = useState<'above' | 'below'>('below')
  const [reserveSuggestionsMaxHeight, setReserveSuggestionsMaxHeight] = useState(320)
  const [reserveClubSuggestionsPlacement, setReserveClubSuggestionsPlacement] = useState<'above' | 'below'>('below')
  const [reserveClubSuggestionsMaxHeight, setReserveClubSuggestionsMaxHeight] = useState(280)
  const reserveInputWrapperRef = useRef<HTMLDivElement | null>(null)
  const reserveClubInputWrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const trimmedQuery = reserveQuery.trim()
    const hasCommittedSelection = selectedReserveSuggestion?.name === trimmedQuery

    if (!showReserveForm || trimmedQuery.length < 2 || hasCommittedSelection) {
      setReserveSuggestions([])
      setShowReserveSuggestions(false)
      setHighlightedReserveIndex(0)
      setReserveLoading(false)
      return
    }

    let cancelled = false
    setReserveLoading(true)

    const timeoutId = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/players/search?q=${encodeURIComponent(trimmedQuery)}`, {
          cache: 'no-store',
          headers: {
            'x-competition-slug': slug,
          },
        })

        if (!res.ok) {
          throw new Error('reserve_search_failed')
        }

        const payload = await res.json() as {
          players: Array<{
            id: string
            name: string
            club: string | null
            classNames: string[]
          }>
        }
        if (cancelled) {
          return
        }

        setReserveSuggestions((payload.players ?? []).map(player => ({
          kind: 'existing',
          id: player.id,
          name: player.name,
          club: player.club,
          classNames: player.classNames,
        })))
        setShowReserveSuggestions(true)
        setHighlightedReserveIndex(0)
      } catch {
        if (!cancelled) {
          setReserveSuggestions([])
          setShowReserveSuggestions(false)
        }
      } finally {
        if (!cancelled) {
          setReserveLoading(false)
        }
      }
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [reserveQuery, selectedReserveSuggestion, showReserveForm, slug])

  useEffect(() => {
    const trimmedClub = reserveClub.trim()
    const hasCommittedSelection = selectedReserveClubSuggestion === trimmedClub

    if (
      !showReserveForm
      || selectedReserveSuggestion?.kind !== 'new'
      || trimmedClub.length < 2
      || hasCommittedSelection
    ) {
      setReserveClubSuggestions([])
      setShowReserveClubSuggestions(false)
      setHighlightedReserveClubIndex(0)
      setReserveClubLoading(false)
      return
    }

    let cancelled = false
    setReserveClubLoading(true)

    const timeoutId = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/clubs/search?q=${encodeURIComponent(trimmedClub)}`, {
          cache: 'no-store',
          headers: {
            'x-competition-slug': slug,
          },
        })

        if (!res.ok) {
          throw new Error('reserve_club_search_failed')
        }

        const payload = await res.json() as { clubs: string[] }
        if (cancelled) {
          return
        }

        const suggestions = (payload.clubs ?? []).map(club => ({ name: club }))
        setReserveClubSuggestions(suggestions)
        setShowReserveClubSuggestions(suggestions.length > 0)
        setHighlightedReserveClubIndex(0)
      } catch {
        if (!cancelled) {
          setReserveClubSuggestions([])
          setShowReserveClubSuggestions(false)
        }
      } finally {
        if (!cancelled) {
          setReserveClubLoading(false)
        }
      }
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [reserveClub, selectedReserveClubSuggestion, selectedReserveSuggestion, showReserveForm, slug])

  useEffect(() => {
    if (!showReserveSuggestions || (reserveSuggestions.length === 0 && reserveQuery.trim().length < 2)) {
      return
    }

    function updateReserveSuggestionPosition() {
      const inputWrapper = reserveInputWrapperRef.current
      if (!inputWrapper) {
        return
      }

      const rect = inputWrapper.getBoundingClientRect()
      const viewportPadding = 16
      const minimumHeight = 180
      const preferredHeight = 360
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding
      const spaceAbove = rect.top - viewportPadding
      const shouldOpenAbove = spaceBelow < minimumHeight && spaceAbove > spaceBelow
      const availableSpace = shouldOpenAbove ? spaceAbove : spaceBelow

      setReserveSuggestionsPlacement(shouldOpenAbove ? 'above' : 'below')
      setReserveSuggestionsMaxHeight(
        Math.max(140, Math.min(preferredHeight, Math.floor(availableSpace)))
      )
    }

    updateReserveSuggestionPosition()
    window.addEventListener('resize', updateReserveSuggestionPosition)
    window.addEventListener('scroll', updateReserveSuggestionPosition, true)

    return () => {
      window.removeEventListener('resize', updateReserveSuggestionPosition)
      window.removeEventListener('scroll', updateReserveSuggestionPosition, true)
    }
  }, [reserveQuery, reserveSuggestions.length, showReserveSuggestions])

  useEffect(() => {
    if (!showReserveClubSuggestions || reserveClubSuggestions.length === 0) {
      return
    }

    function updateReserveClubSuggestionPosition() {
      const inputWrapper = reserveClubInputWrapperRef.current
      if (!inputWrapper) {
        return
      }

      const rect = inputWrapper.getBoundingClientRect()
      const viewportPadding = 16
      const minimumHeight = 160
      const preferredHeight = 280
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding
      const spaceAbove = rect.top - viewportPadding
      const shouldOpenAbove = spaceBelow < minimumHeight && spaceAbove > spaceBelow
      const availableSpace = shouldOpenAbove ? spaceAbove : spaceBelow

      setReserveClubSuggestionsPlacement(shouldOpenAbove ? 'above' : 'below')
      setReserveClubSuggestionsMaxHeight(
        Math.max(120, Math.min(preferredHeight, Math.floor(availableSpace)))
      )
    }

    updateReserveClubSuggestionPosition()
    window.addEventListener('resize', updateReserveClubSuggestionPosition)
    window.addEventListener('scroll', updateReserveClubSuggestionPosition, true)

    return () => {
      window.removeEventListener('resize', updateReserveClubSuggestionPosition)
      window.removeEventListener('scroll', updateReserveClubSuggestionPosition, true)
    }
  }, [reserveClubSuggestions.length, showReserveClubSuggestions])

  function resetReserveForm(closeForm: boolean) {
    setReserveQuery('')
    setReserveClub('')
    setReserveSuggestions([])
    setSelectedReserveSuggestion(null)
    setReserveClubSuggestions([])
    setSelectedReserveClubSuggestion(null)
    setShowReserveSuggestions(false)
    setShowReserveClubSuggestions(false)
    setHighlightedReserveIndex(0)
    setHighlightedReserveClubIndex(0)
    setReserveError(null)
    if (closeForm) {
      setShowReserveForm(false)
    }
  }

  function selectReserveSuggestion(suggestion: ReserveSuggestion) {
    setSelectedReserveSuggestion(suggestion)
    setReserveQuery(suggestion.name)
    setReserveError(null)
    setShowReserveSuggestions(false)
    setHighlightedReserveIndex(0)

    if (suggestion.kind === 'existing') {
      setReserveClub(suggestion.club ?? '')
      setSelectedReserveClubSuggestion(suggestion.club ?? null)
      void submitReservePlayer(suggestion)
      return
    }

    setReserveClub('')
    setSelectedReserveClubSuggestion(null)
  }

  function selectReserveClubSuggestion(suggestion: ClubSuggestion) {
    setReserveClub(suggestion.name)
    setSelectedReserveClubSuggestion(suggestion.name)
    setShowReserveClubSuggestions(false)
    setHighlightedReserveClubIndex(0)
    setReserveError(null)
  }

  async function submitReservePlayer(selectedSuggestionOverride?: ReserveSuggestion) {
    const activeSuggestion = selectedSuggestionOverride ?? selectedReserveSuggestion
    const trimmedName = (selectedSuggestionOverride?.name ?? reserveQuery).trim()
    const isExistingPlayer = activeSuggestion?.kind === 'existing' && activeSuggestion.name === trimmedName
    const isNewPlayer = activeSuggestion?.kind === 'new' && activeSuggestion.name === trimmedName

    if (!trimmedName) {
      setReserveError('Ange ett namn')
      return
    }

    if (!isExistingPlayer && !isNewPlayer) {
      setReserveError('Välj en spelare i listan eller välj Lägg till ny spelare')
      return
    }

    if (isNewPlayer && !reserveClub.trim()) {
      setReserveError('Ange klubb för den nya spelaren')
      return
    }

    setReserveSubmitting(true)
    setReserveError(null)
    onMutatingChange(true)

    try {
      const res = await fetch(`/api/admin/classes/${classId}/reserve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-competition-slug': slug,
        },
        body: JSON.stringify(isExistingPlayer
          ? {
              playerId: activeSuggestion.id,
              name: activeSuggestion.name,
              club: activeSuggestion.club,
            }
          : {
              playerId: null,
              name: trimmedName,
              club: reserveClub.trim(),
            }),
      })

      const payload = await res.json().catch(() => null) as { error?: string; entry?: ReserveEntry } | null
      if (!res.ok || !payload?.entry) {
        setReserveError(payload?.error ?? 'Något gick fel, försök igen')
        return
      }

      const createdEntry = payload.entry
      onReserveListChange(previous =>
        [...previous, createdEntry].sort((left, right) => left.position - right.position)
      )
      resetReserveForm(true)
    } catch {
      setReserveError('Nätverksfel, försök igen')
    } finally {
      setReserveSubmitting(false)
      onMutatingChange(false)
    }
  }

  async function removeReservePlayer(registrationId: string) {
    setReserveRemoving(registrationId)
    setReserveError(null)
    onMutatingChange(true)

    try {
      const res = await fetch(`/api/admin/classes/${classId}/reserve/${registrationId}`, {
        method: 'DELETE',
        headers: {
          'x-competition-slug': slug,
        },
      })

      const payload = await res.json().catch(() => null) as { error?: string } | null
      if (!res.ok) {
        setReserveError(payload?.error ?? 'Något gick fel, försök igen')
        return
      }

      onReserveListChange(previous =>
        previous
          .filter(entry => entry.registrationId !== registrationId)
          .map((entry, index) => ({ ...entry, position: index + 1 }))
      )
    } catch {
      setReserveError('Nätverksfel, försök igen')
    } finally {
      setReserveRemoving(null)
      onMutatingChange(false)
    }
  }

  const trimmedReserveQuery = reserveQuery.trim()
  const reserveSuggestionOptions: ReserveSuggestion[] = trimmedReserveQuery.length >= 2
    ? [
        ...reserveSuggestions,
        { kind: 'new', name: trimmedReserveQuery },
      ]
    : []
  const selectedNewPlayer = selectedReserveSuggestion?.kind === 'new'
    ? selectedReserveSuggestion
    : null
  const showClubSuggestionList = !!selectedNewPlayer
    && showReserveClubSuggestions
    && reserveClubSuggestions.length > 0

  return (
    <section data-testid="reserve-list" className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">Reservlista</h2>
          <p className="text-sm text-muted">
            Lägg till spelare som reserv. För nya spelare måste namnet matcha namnet i tävlingssystemet.
          </p>
        </div>

        <button
          data-testid="reserve-add-toggle"
          type="button"
          onClick={() => {
            setShowReserveForm(current => !current)
            setReserveError(null)
            setShowReserveSuggestions(false)
          }}
          className="app-button-secondary min-h-10 px-4 py-2 text-sm"
        >
          Lägg till på reservlistan
        </button>
      </div>

      {showReserveForm && (
        <div className="app-card relative z-10 space-y-4">
          <div className={selectedNewPlayer
            ? 'grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_auto] lg:items-start'
            : 'grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_auto] lg:items-start'}>
            <div className="space-y-2">
              <label htmlFor="reserve-player-name" className="text-sm font-medium text-ink">
                Spelare
              </label>
              <div ref={reserveInputWrapperRef} className="relative">
                <input
                  id="reserve-player-name"
                  data-testid="reserve-player-name-input"
                  type="text"
                  value={reserveQuery}
                  onChange={event => {
                    const nextValue = event.target.value
                    setReserveQuery(nextValue)
                    setReserveError(null)

                    if (selectedReserveSuggestion && selectedReserveSuggestion.name !== nextValue.trim()) {
                      setSelectedReserveSuggestion(null)
                      setReserveClub('')
                      if (nextValue.trim().length >= 2) {
                        setShowReserveSuggestions(true)
                      }
                      return
                    }

                    if (nextValue.trim().length >= 2) {
                      setShowReserveSuggestions(true)
                    } else {
                      setShowReserveSuggestions(false)
                    }
                  }}
                  onFocus={() => {
                    if (
                      reserveSuggestionOptions.length > 0
                      && selectedReserveSuggestion?.name !== reserveQuery.trim()
                    ) {
                      setShowReserveSuggestions(true)
                    }
                  }}
                  onKeyDown={event => {
                    if (!showReserveSuggestions || reserveSuggestionOptions.length === 0) {
                      return
                    }

                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      setHighlightedReserveIndex(current => (current + 1) % reserveSuggestionOptions.length)
                      return
                    }

                    if (event.key === 'ArrowUp') {
                      event.preventDefault()
                      setHighlightedReserveIndex(current =>
                        current === 0 ? reserveSuggestionOptions.length - 1 : current - 1
                      )
                      return
                    }

                    if (event.key === 'Enter') {
                      event.preventDefault()
                      selectReserveSuggestion(reserveSuggestionOptions[highlightedReserveIndex])
                      return
                    }

                    if (event.key === 'Escape') {
                      setShowReserveSuggestions(false)
                    }
                  }}
                  placeholder="Sök spelare eller skriv nytt namn"
                  className="app-input"
                  autoComplete="off"
                />

                {showReserveSuggestions && reserveSuggestionOptions.length > 0 && (
                  <div
                    data-testid="reserve-player-suggestions"
                    style={{ maxHeight: `${reserveSuggestionsMaxHeight}px` }}
                    className={`absolute z-30 w-full overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-lg ${
                      reserveSuggestionsPlacement === 'above' ? 'bottom-[calc(100%+0.5rem)]' : 'top-[calc(100%+0.5rem)]'
                    }`}
                  >
                    <ul className="space-y-1">
                      {reserveSuggestionOptions.map((suggestion, index) => {
                        const isHighlighted = index === highlightedReserveIndex

                        return (
                          <li key={suggestion.kind === 'existing' ? suggestion.id : `new-${suggestion.name}`}>
                            <button
                              data-testid={suggestion.kind === 'existing'
                                ? `reserve-suggestion-${suggestion.id}`
                                : 'reserve-suggestion-new-player'}
                              type="button"
                              onMouseDown={event => event.preventDefault()}
                              onClick={() => selectReserveSuggestion(suggestion)}
                              className={`flex w-full flex-col rounded-xl px-3 py-2 text-left transition-colors ${
                                isHighlighted ? 'bg-brand-soft/70' : 'hover:bg-stone-50'
                              }`}
                            >
                              {suggestion.kind === 'existing' ? (
                                <>
                                  <span className="text-sm font-semibold text-ink">{suggestion.name}</span>
                                  <span className="text-xs text-muted">
                                    {suggestion.club || 'Ingen klubb'}
                                    {suggestion.classNames.length > 0
                                      ? ` · ${suggestion.classNames.join(', ')}`
                                      : ''}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="text-sm font-semibold text-ink">
                                    Lägg till ny spelare
                                  </span>
                                  <span className="text-xs text-muted">{suggestion.name}</span>
                                </>
                              )}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
              {reserveLoading && (
                <p className="text-xs text-muted">Söker spelare...</p>
              )}
            </div>

            {selectedNewPlayer ? (
              <div className="space-y-2">
                <label htmlFor="reserve-player-club" className="text-sm font-medium text-ink">
                  Klubb
                </label>
                <div ref={reserveClubInputWrapperRef} className="relative">
                  <input
                    id="reserve-player-club"
                    data-testid="reserve-player-club-input"
                    type="text"
                    value={reserveClub}
                    onChange={event => {
                      const nextValue = event.target.value
                      setReserveClub(nextValue)
                      setReserveError(null)

                      if (selectedReserveClubSuggestion && selectedReserveClubSuggestion !== nextValue.trim()) {
                        setSelectedReserveClubSuggestion(null)
                      }

                      if (nextValue.trim().length >= 2) {
                        setShowReserveClubSuggestions(true)
                      } else {
                        setShowReserveClubSuggestions(false)
                      }
                    }}
                    onFocus={() => {
                      if (
                        reserveClubSuggestions.length > 0
                        && selectedReserveClubSuggestion !== reserveClub.trim()
                      ) {
                        setShowReserveClubSuggestions(true)
                      }
                    }}
                    onKeyDown={event => {
                      if (!showClubSuggestionList) {
                        return
                      }

                      if (event.key === 'ArrowDown') {
                        event.preventDefault()
                        setHighlightedReserveClubIndex(current =>
                          (current + 1) % reserveClubSuggestions.length
                        )
                        return
                      }

                      if (event.key === 'ArrowUp') {
                        event.preventDefault()
                        setHighlightedReserveClubIndex(current =>
                          current === 0 ? reserveClubSuggestions.length - 1 : current - 1
                        )
                        return
                      }

                      if (event.key === 'Enter') {
                        event.preventDefault()
                        selectReserveClubSuggestion(reserveClubSuggestions[highlightedReserveClubIndex])
                        return
                      }

                      if (event.key === 'Escape') {
                        setShowReserveClubSuggestions(false)
                      }
                    }}
                    placeholder="Ange klubb"
                    className="app-input"
                    autoComplete="off"
                  />

                  {showClubSuggestionList && (
                    <div
                      data-testid="reserve-club-suggestions"
                      style={{ maxHeight: `${reserveClubSuggestionsMaxHeight}px` }}
                      className={`absolute z-30 w-full overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-lg ${
                        reserveClubSuggestionsPlacement === 'above'
                          ? 'bottom-[calc(100%+0.5rem)]'
                          : 'top-[calc(100%+0.5rem)]'
                      }`}
                    >
                      <ul className="space-y-1">
                        {reserveClubSuggestions.map((suggestion, index) => {
                          const isHighlighted = index === highlightedReserveClubIndex

                          return (
                            <li key={suggestion.name}>
                              <button
                                data-testid={`reserve-club-suggestion-${index}`}
                                type="button"
                                onMouseDown={event => event.preventDefault()}
                                onClick={() => selectReserveClubSuggestion(suggestion)}
                                className={`flex w-full rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                                  isHighlighted ? 'bg-brand-soft/70 text-ink' : 'text-ink hover:bg-stone-50'
                                }`}
                              >
                                {suggestion.name}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </div>
                {reserveClubLoading && (
                  <p className="text-xs text-muted">Söker klubb...</p>
                )}
              </div>
            ) : null}

            <div className="space-y-2 lg:min-w-[190px]">
              <div className="hidden text-sm font-medium text-transparent lg:block" aria-hidden="true">
                Åtgärd
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {selectedNewPlayer ? (
                  <button
                    data-testid="reserve-submit-button"
                    type="button"
                    onClick={() => void submitReservePlayer()}
                    disabled={reserveSubmitting}
                    className="app-button-primary min-h-10 px-4 py-2"
                  >
                    {reserveSubmitting ? 'Lägger till...' : 'Lägg till'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => resetReserveForm(true)}
                  className="app-button-secondary min-h-10 px-4 py-2"
                >
                  Avbryt
                </button>
              </div>
            </div>
          </div>

          {reserveError && (
            <p data-testid="reserve-error" className="app-banner-error">
              {reserveError}
            </p>
          )}
        </div>
      )}

      {reserveList.length > 0 ? (
        <div className="space-y-3">
          {reserveList.map(entry => (
            <div
              key={entry.registrationId}
              data-testid={`reserve-row-${entry.registrationId}`}
              className="app-card flex flex-col gap-4 sm:flex-row sm:items-center"
            >
              <div
                data-testid={`reserve-position-${entry.registrationId}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-semibold text-ink"
              >
                {entry.position}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-medium text-ink">{entry.name}</p>
                <p className="truncate text-xs text-muted/80">{entry.club ?? '–'}</p>
              </div>

              <div className="text-sm text-muted">
                {entry.joinedAt ? `Tillagd ${formatSwedishDateTime(entry.joinedAt)}` : 'Tillagd nyligen'}
              </div>

              <button
                data-testid={`reserve-remove-${entry.registrationId}`}
                type="button"
                onClick={() => removeReservePlayer(entry.registrationId)}
                disabled={reserveRemoving === entry.registrationId}
                className="min-h-[44px] rounded-xl border border-red-200 bg-surface px-4 py-2.5 text-sm font-semibold text-red-700 transition-all duration-150 hover:bg-red-50 disabled:opacity-60"
              >
                {reserveRemoving === entry.registrationId ? 'Tar bort...' : 'Ta bort'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-1 text-sm text-muted">Ingen står på reservlistan i denna klass.</p>
      )}
    </section>
  )
}