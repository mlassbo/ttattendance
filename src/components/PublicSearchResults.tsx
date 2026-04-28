'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  getClassAttendanceOpensAt,
  formatSwedishDateTime,
  formatSwedishTime,
  getAttendanceNotOpenMessage,
  getPlayerAttendanceAvailability,
} from '@/lib/attendance-window'
import {
  getAttendanceStatusCopy,
  getCompetitionScheduleMissingCopy,
  getDeadlinePassedWithoutAttendanceCopy,
} from '@/lib/public-attendance-ui'
import type {
  PublicClassRegistration,
  PublicSearchClass,
  PublicSearchClub,
  PublicSearchMode,
  PublicSearchPlayer,
} from '@/lib/public-competition'
import { usePublicAttendanceActions } from '@/lib/use-public-attendance-actions'

type AttendanceAction =
  | {
      type: 'submit'
      playerId: string
      registrationId: string
      status: 'confirmed' | 'absent'
    }
  | {
      type: 'reset'
      playerId: string
      registrationId: string
    }

function buildSearchHref(slug: string, query: string, mode: PublicSearchMode) {
  const params = new URLSearchParams()

  if (query) {
    params.set('q', query)
  }

  if (mode !== 'all') {
    params.set('mode', mode)
  }

  const queryString = params.toString()
  return queryString ? `/${slug}/search?${queryString}` : `/${slug}/search`
}

function buildClassSearchHref(slug: string, className: string) {
  return buildSearchHref(slug, className, 'class')
}

function buildClassPageHref(slug: string, classId: string, returnTo: string) {
  const params = new URLSearchParams()
  params.set('returnTo', returnTo)

  return `/${slug}/classes/${classId}?${params.toString()}`
}

function sanitizeFragment(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function clubTestIdFragment(clubName: string) {
  return sanitizeFragment(clubName)
}

function getReserveLabel(registration: PublicClassRegistration) {
  return registration.reservePosition
    ? `Reserv #${registration.reservePosition}`
    : 'Reserv'
}

function getReservePillLabel(registration: PublicClassRegistration) {
  return `${registration.class.name} · ${getReserveLabel(registration)}`
}

function getClassPillClassName(registration: PublicClassRegistration, now: Date) {
  const baseClassName = 'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition-all duration-150 hover:-translate-y-px hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

  if (registration.status === 'reserve') {
    return `${baseClassName} bg-stone-100 text-stone-600`
  }

  if (registration.attendance?.status === 'confirmed') {
    return `${baseClassName} bg-green-100 text-green-700`
  }

  if (registration.attendance?.status === 'absent') {
    return `${baseClassName} bg-red-100 text-red-700`
  }

  const availability = getPlayerAttendanceAvailability(
    registration.class.startTime,
    registration.class.attendanceDeadline,
    now,
  )

  if (availability.state === 'available') {
    return `${baseClassName} bg-brand text-white`
  }

  return `${baseClassName} bg-stone-100 text-stone-600`
}

function ClassAvailabilityBadge({ classResult }: { classResult: PublicSearchClass }) {
  if (classResult.maxPlayers == null) {
    return null
  }

  const spotsLeft = classResult.maxPlayers - classResult.playerCount

  if (classResult.playerCount < classResult.maxPlayers && spotsLeft > 2) {
    return <span className="text-xs font-medium text-muted">{spotsLeft} platser kvar</span>
  }

  if (classResult.playerCount < classResult.maxPlayers && spotsLeft === 1) {
    return <span className="app-pill-warning">1 plats kvar</span>
  }

  if (classResult.playerCount < classResult.maxPlayers && spotsLeft === 2) {
    return <span className="app-pill-warning">2 platser kvar</span>
  }

  return <span className="app-pill-muted">Fullt</span>
}

function getPlayerCardAction(registrations: PublicClassRegistration[], now: Date): {
  state: 'available' | 'editable' | 'upcoming' | 'view' | 'hidden'
  label: string | null
} {
  const registeredRegistrations = registrations.filter(registration => registration.status === 'registered')

  if (registeredRegistrations.length === 0) {
    return {
      state: 'hidden',
      label: null,
    }
  }

  const availabilities = registeredRegistrations.map(registration =>
    getPlayerAttendanceAvailability(
      registration.class.startTime,
      registration.class.attendanceDeadline,
      now,
    ),
  )

  const availableRegistrations = registeredRegistrations.filter((registration, index) =>
    availabilities[index]?.state === 'available',
  )

  if (availableRegistrations.some(registration => !registration.attendance)) {
    return {
      state: 'available',
      label: 'Anmäl närvaro',
    }
  }

  if (availableRegistrations.length > 0) {
    return {
      state: 'editable',
      label: 'Ändra närvaro',
    }
  }

  const nextOpeningTimes = availabilities
    .filter((availability): availability is Extract<typeof availability, { state: 'not_open' }> =>
      availability.state === 'not_open',
    )
    .map(availability => availability.attendanceOpensAt.getTime())

  if (nextOpeningTimes.length > 0) {
    return {
      state: 'upcoming',
      label: `Närvaroanmälan öppnar ${formatSwedishDateTime(new Date(Math.min(...nextOpeningTimes)))}`,
    }
  }

  return {
    state: 'hidden',
    label: null,
  }
}

export default function PublicSearchResults({
  slug,
  query,
  mode,
  initialPlayers,
  clubs,
  classes,
}: {
  slug: string
  query: string
  mode: PublicSearchMode
  initialPlayers: PublicSearchPlayer[]
  clubs: PublicSearchClub[]
  classes: PublicSearchClass[]
}) {
  const [players, setPlayers] = useState(initialPlayers)
  const [expandedPlayers, setExpandedPlayers] = useState<string[]>([])
  const [now, setNow] = useState(() => new Date())
  const returnTo = buildSearchHref(slug, query, mode)

  useEffect(() => {
    setPlayers(initialPlayers)
    setExpandedPlayers([])
  }, [initialPlayers, query, mode])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const {
    actionError,
    handleAttendanceAction,
    submitting,
  } = usePublicAttendanceActions<AttendanceAction>({
    onApplySuccess: (action, reportedAt) => {
      setPlayers(previousPlayers => previousPlayers.map(player => {
        if (player.id !== action.playerId) {
          return player
        }

        return {
          ...player,
          registrations: player.registrations.map(registration => {
            if (registration.registrationId !== action.registrationId) {
              return registration
            }

            if (action.type === 'reset') {
              return {
                ...registration,
                attendance: null,
              }
            }

            return {
              ...registration,
              attendance: {
                status: action.status,
                reportedAt,
              },
            }
          }),
        }
      }))
    },
  })

  function toggleExpandedPlayer(playerId: string) {
    setExpandedPlayers(previousExpandedPlayers =>
      previousExpandedPlayers.includes(playerId)
        ? previousExpandedPlayers.filter(expandedPlayerId => expandedPlayerId !== playerId)
        : [...previousExpandedPlayers, playerId],
    )
  }

  return (
    <>
      {actionError ? (
        <section data-testid="public-search-error" className="app-banner-error">
          {actionError}
        </section>
      ) : null}

      {players.length > 0 ? (
        <section data-testid="public-search-players-section" className="space-y-3">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Spelare
          </h2>

          <div className="space-y-3">
            {players.map(player => {
              const isExpanded = expandedPlayers.includes(player.id)
              const action = getPlayerCardAction(player.registrations, now)

              return (
                <article
                  key={player.id}
                  data-testid={`public-search-player-card-${player.id}`}
                  className="app-card space-y-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold text-ink">{player.name}</h3>
                      {player.club ? <p className="text-sm text-muted">{player.club}</p> : null}
                    </div>

                    {action.state !== 'hidden' ? (
                      <button
                        data-testid={`public-search-player-toggle-${player.id}`}
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => toggleExpandedPlayer(player.id)}
                        disabled={action.state === 'upcoming'}
                        className={action.state === 'available'
                          ? 'app-button-primary min-h-[44px]'
                          : 'min-h-[44px] rounded-xl border border-line bg-brand-soft/40 px-4 py-2 text-sm font-semibold text-ink transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-70'}
                      >
                        {action.label}
                      </button>
                    ) : null}
                  </div>

                  {player.classNames.length > 0 ? (
                    <div
                      data-testid={`public-search-player-class-pills-${player.id}`}
                      className="flex flex-wrap gap-2"
                    >
                      {player.registrations.map(registration => (
                        <Link
                          key={registration.registrationId}
                          href={registration.class.id
                            ? buildClassPageHref(slug, registration.class.id, returnTo)
                            : buildClassSearchHref(slug, registration.class.name)}
                          data-testid={`public-search-player-class-pill-${player.id}-${sanitizeFragment(registration.class.name)}`}
                          aria-label={`Visa alla spelare i ${registration.class.name}`}
                          className={getClassPillClassName(registration, now)}
                        >
                          {registration.status === 'reserve'
                            ? getReservePillLabel(registration)
                            : registration.class.name}
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  {isExpanded ? (
                    <div
                      data-testid={`public-search-player-expanded-${player.id}`}
                      className="space-y-3 border-t border-line/70 pt-4"
                    >
                      {player.registrations.map(registration => {
                        const isReserve = registration.status === 'reserve'
                        const availability = getPlayerAttendanceAvailability(
                          registration.class.startTime,
                          registration.class.attendanceDeadline,
                          now,
                        )
                        const currentStatus = registration.attendance?.status ?? null
                        const statusCopy = currentStatus
                          ? getAttendanceStatusCopy(currentStatus, 'player')
                          : null
                        const missingAttendanceCopy =
                          availability.state === 'deadline_passed' && !currentStatus
                            ? getDeadlinePassedWithoutAttendanceCopy()
                            : null
                        const scheduleMissingCopy =
                          availability.state === 'schedule_missing'
                            ? getCompetitionScheduleMissingCopy()
                            : null
                        const isSubmitting = submitting === registration.registrationId

                        return (
                          <article
                            key={registration.registrationId}
                            data-testid={`public-search-player-class-card-${registration.registrationId}`}
                            className="rounded-2xl border border-line bg-brand-soft/25 px-4 py-4"
                          >
                            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <h4 className="text-base font-semibold text-ink">{registration.class.name}</h4>
                                {registration.class.startTime ? (
                                  <p className="text-sm text-muted">
                                    Start {formatSwedishTime(registration.class.startTime)}
                                  </p>
                                ) : null}
                                {registration.class.attendanceDeadline ? (
                                  <p className="text-xs text-muted/80">
                                    Anmäl senast {formatSwedishTime(registration.class.attendanceDeadline)}
                                  </p>
                                ) : null}
                              </div>

                              {isReserve ? (
                                <span className="inline-flex items-center rounded-full border border-stone-300 px-3 py-1 text-xs font-semibold text-stone-700 whitespace-nowrap">
                                  {getReserveLabel(registration)}
                                </span>
                              ) : currentStatus ? (
                                <span
                                  data-testid={`public-search-status-badge-${registration.registrationId}`}
                                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${
                                    currentStatus === 'confirmed'
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-red-100 text-red-700'
                                  }`}
                                >
                                  {statusCopy?.badgeLabel}
                                </span>
                              ) : null}
                            </div>

                            {isReserve ? (
                              <div className="mb-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                                <p className="text-sm font-semibold text-ink">
                                  Du är på plats #{registration.reservePosition ?? '–'} på reservlistan för denna klass.
                                </p>
                                <p className="mt-1 text-sm text-muted">
                                  Närvaroknappar visas först när du blir fullt registrerad i klassen.
                                </p>
                              </div>
                            ) : statusCopy ? (
                              <div
                                data-testid={`public-search-status-summary-${registration.registrationId}`}
                                className={`mb-4 rounded-2xl border px-4 py-3 ${statusCopy.containerClassName}`}
                              >
                                <p className="text-sm font-semibold">{statusCopy.title}</p>
                                <p className={`mt-1 text-sm ${statusCopy.descriptionClassName}`}>
                                  {statusCopy.description}
                                </p>
                                {registration.attendance?.reportedAt ? (
                                  <p className="mt-2 text-xs font-medium opacity-80">
                                    Rapporterad {formatSwedishTime(registration.attendance.reportedAt)}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}

                            {!isReserve && missingAttendanceCopy ? (
                              <div
                                data-testid={`public-search-missing-attendance-${registration.registrationId}`}
                                className={`mb-4 rounded-2xl border px-4 py-3 ${missingAttendanceCopy.containerClassName}`}
                              >
                                <p className="text-sm font-semibold">{missingAttendanceCopy.title}</p>
                                <p className={`mt-1 text-sm ${missingAttendanceCopy.descriptionClassName}`}>
                                  {missingAttendanceCopy.description}
                                </p>
                              </div>
                            ) : null}

                            {!isReserve && scheduleMissingCopy ? (
                              <div
                                data-testid={`public-search-schedule-missing-${registration.registrationId}`}
                                className={`mb-4 rounded-2xl border px-4 py-3 ${scheduleMissingCopy.containerClassName}`}
                              >
                                <p className="text-sm font-semibold">{scheduleMissingCopy.title}</p>
                                <p className={`mt-1 text-sm ${scheduleMissingCopy.descriptionClassName}`}>
                                  {scheduleMissingCopy.description}
                                </p>
                              </div>
                            ) : null}

                            {isReserve ? null : availability.state === 'schedule_missing' ? null : availability.state === 'not_open' ? (
                              <p
                                data-testid={`public-search-attendance-not-open-${registration.registrationId}`}
                                className="text-xs font-medium text-amber-800"
                              >
                                {getAttendanceNotOpenMessage(availability.attendanceOpensAt)}
                              </p>
                            ) : availability.state === 'deadline_passed' ? null : currentStatus ? (
                              <button
                                data-testid={`public-search-reset-btn-${registration.registrationId}`}
                                type="button"
                                onClick={() => handleAttendanceAction({
                                  type: 'reset',
                                  playerId: player.id,
                                  registrationId: registration.registrationId,
                                })}
                                disabled={isSubmitting}
                                className="app-button-link"
                              >
                                Återställ närvaro
                              </button>
                            ) : (
                              <div className="grid gap-2 sm:grid-cols-2">
                                <button
                                  data-testid={`public-search-confirm-btn-${registration.registrationId}`}
                                  type="button"
                                  onClick={() => handleAttendanceAction({
                                    type: 'submit',
                                    playerId: player.id,
                                    registrationId: registration.registrationId,
                                    status: 'confirmed',
                                  })}
                                  disabled={isSubmitting}
                                  className="min-h-[44px] rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-700 transition-all duration-150 hover:bg-green-100 disabled:opacity-60"
                                >
                                  Bekräfta närvaro
                                </button>
                                <button
                                  data-testid={`public-search-absent-btn-${registration.registrationId}`}
                                  type="button"
                                  onClick={() => handleAttendanceAction({
                                    type: 'submit',
                                    playerId: player.id,
                                    registrationId: registration.registrationId,
                                    status: 'absent',
                                  })}
                                  disabled={isSubmitting}
                                  className="min-h-[44px] rounded-xl border border-red-200 bg-surface px-4 py-2.5 text-sm font-semibold text-red-700 transition-all duration-150 hover:bg-red-50 disabled:opacity-60"
                                >
                                  Anmäl frånvaro
                                </button>
                              </div>
                            )}
                          </article>
                        )
                      })}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {clubs.length > 0 ? (
        <section data-testid="public-search-clubs-section" className="space-y-3">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Klubbar
          </h2>

          <div className="space-y-3">
            {clubs.map(club => (
              <article
                key={club.name}
                data-testid={`public-search-club-card-${clubTestIdFragment(club.name)}`}
                className="app-card"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-ink">{club.name}</h3>
                    <p className="text-sm text-muted">{club.playerCount} spelare</p>
                  </div>

                  <Link
                    href={`/${slug}/clubs/${encodeURIComponent(club.name)}?returnTo=${encodeURIComponent(buildSearchHref(slug, query, mode))}`}
                    data-testid={`public-search-club-link-${clubTestIdFragment(club.name)}`}
                    className="app-button-secondary"
                  >
                    Visa klubb
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {classes.length > 0 ? (
        <section data-testid="public-search-classes-section" className="space-y-3">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Klasser
          </h2>

          <div className="space-y-3">
            {classes.map(classResult => (
              <article
                key={classResult.id}
                data-testid={`public-search-class-card-${classResult.id}`}
                className="app-card space-y-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-ink">{classResult.name}</h3>
                    {classResult.startTime ? (
                      <p className="text-sm text-muted">
                        Start {formatSwedishDateTime(classResult.startTime)}
                      </p>
                    ) : null}
                    {classResult.startTime ? (
                      <p className="text-xs text-muted/80">
                        Närvarorapportering öppnar {formatSwedishDateTime(getClassAttendanceOpensAt(classResult.startTime))}
                      </p>
                    ) : null}
                    {classResult.attendanceDeadline ? (
                      <p className="text-xs text-muted/80">
                        Anmäl närvaro senast {formatSwedishDateTime(classResult.attendanceDeadline)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className="app-pill-muted whitespace-nowrap">
                      {classResult.playerCount} spelare
                    </span>
                    <span data-testid={`public-search-class-availability-${classResult.id}`}>
                      <ClassAvailabilityBadge classResult={classResult} />
                    </span>
                    {classResult.reserveList.length > 0 ? (
                      <span
                        data-testid={`public-search-class-reserve-pill-${classResult.id}`}
                        className="app-pill-muted whitespace-nowrap"
                      >
                        {classResult.reserveList.length} på reservlistan
                      </span>
                    ) : null}
                  </div>
                </div>

                <div
                  data-testid={`public-search-class-roster-${classResult.id}`}
                  className="rounded-2xl border border-line/80 bg-stone-50/70 px-4 py-3"
                >
                  {classResult.players.length > 0 ? (
                    <ul className="space-y-2">
                      {classResult.players.map(player => (
                        <li
                          key={player.id}
                          data-testid={`public-search-class-player-${classResult.id}-${player.id}`}
                          className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span className="text-sm font-medium text-ink">{player.name}</span>
                          {player.club ? <span className="text-sm text-muted">{player.club}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">Inga spelare registrerade.</p>
                  )}
                </div>

                {classResult.reserveList.length > 0 ? (
                  <div className="rounded-2xl border border-line/80 bg-surface px-4 py-3">
                    <p className="text-sm font-semibold text-ink">Reservlista</p>
                    <ol className="mt-3 space-y-2">
                      {classResult.reserveList.map(entry => (
                        <li
                          key={entry.registrationId}
                          data-testid={`public-search-class-reserve-${classResult.id}-${entry.registrationId}`}
                          className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span className="text-sm font-medium text-ink">
                            {entry.position}. {entry.name}
                          </span>
                          {entry.club ? <span className="text-sm text-muted">{entry.club}</span> : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

    </>
  )
}
