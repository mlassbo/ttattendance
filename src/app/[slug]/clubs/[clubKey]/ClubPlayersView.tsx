'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  formatSwedishTime,
  getAttendanceNotOpenMessage,
  getPlayerAttendanceAvailability,
} from '@/lib/attendance-window'
import PublicAttendancePinModal from '@/components/PublicAttendancePinModal'
import {
  getCompetitionScheduleMissingCopy,
  getAttendanceStatusCopy,
  getDeadlinePassedWithoutAttendanceCopy,
} from '@/lib/public-attendance-ui'
import { formatPlayerSessionLabel } from '@/lib/session-format'
import type { PublicClubDetails } from '@/lib/public-competition'
import { usePublicAttendanceActions } from '@/lib/use-public-attendance-actions'

type AttendanceAction =
  | {
      type: 'submit'
      playerId: string
      registrationId: string
      status: 'confirmed' | 'absent'
    }
  | { type: 'reset'; playerId: string; registrationId: string }

export default function ClubPlayersView({
  slug,
  competitionName,
  club,
  returnTo,
}: {
  slug: string
  competitionName: string
  club: PublicClubDetails
  returnTo: string
}) {
  const [data, setData] = useState(club)
  const [query, setQuery] = useState('')
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const filteredPlayers = useMemo(() => {
    const searchTerm = query.trim().toLocaleLowerCase('sv-SE')

    if (!searchTerm) {
      return data.players
    }

    return data.players.filter(player =>
      player.name.toLocaleLowerCase('sv-SE').includes(searchTerm),
    )
  }, [data.players, query])

  const {
    actionError,
    authenticatePin,
    closePinModal,
    handleAttendanceAction,
    pendingAction,
    pin,
    pinError,
    pinLoading,
    pinModalOpen,
    setPin,
    submitting,
    unlockStateReady,
  } = usePublicAttendanceActions<AttendanceAction>({
    slug,
    onApplySuccess: (action, reportedAt) => {
      setData(prev => ({
        ...prev,
        players: prev.players.map(player => {
          if (player.id !== action.playerId) {
            return player
          }

          const updateRegistration = <T extends { registrationId: string; attendance: { status: 'confirmed' | 'absent'; reportedAt: string } | null }>(registration: T): T => {
            if (registration.registrationId !== action.registrationId) {
              return registration
            }

            if (action.type === 'reset') {
              return { ...registration, attendance: null }
            }

            return {
              ...registration,
              attendance: { status: action.status, reportedAt },
            }
          }

          return {
            ...player,
            registrations: player.registrations.map(updateRegistration),
            sessionGroups: player.sessionGroups.map(group => ({
              ...group,
              registrations: group.registrations.map(updateRegistration),
            })),
          }
        }),
      }))
    },
  })

  return (
    <>
      <main data-testid="public-club-page" className="app-shell">
        <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
          <section className="app-card space-y-4">
            <Link
              href={returnTo}
              data-testid="public-club-back-link"
              className="w-fit text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-hover"
            >
              ← Tillbaka till sök
            </Link>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                {competitionName}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-ink">{data.clubName}</h1>
              <p className="text-sm text-muted">{data.players.length} spelare</p>
            </div>

            <input
              data-testid="public-club-filter-input"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Sök bland klubbens spelare"
              className="app-input"
            />
          </section>

          {actionError ? (
            <p data-testid="public-club-error" className="app-banner-error">
              {actionError}
            </p>
          ) : null}

          {filteredPlayers.length === 0 ? (
            <section data-testid="public-club-empty-filter" className="app-card-soft text-sm text-muted">
              Inga spelare matchar sökningen.
            </section>
          ) : (
            filteredPlayers.map(player => (
              <article
                key={player.id}
                data-testid={`public-club-player-card-${player.id}`}
                className="app-card space-y-4"
              >
                <div className="space-y-1">
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-ink">{player.name}</h2>
                    <p className="text-sm text-muted">{player.classCount} klasser</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {player.sessionGroups.map(group => (
                    <section
                      key={group.session?.id ?? group.registrations[0].registrationId}
                      className="space-y-2"
                    >
                      <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
                        {group.session
                          ? formatPlayerSessionLabel(
                              group.session.date,
                              group.session.daySessionOrder ?? group.session.sessionOrder,
                            )
                          : 'Okänt pass'}
                      </h3>

                      <ul className="space-y-2">
                        {group.registrations.map(registration => {
                          const availability = getPlayerAttendanceAvailability(
                            registration.class.startTime,
                            registration.class.attendanceDeadline,
                            now,
                          )
                          const currentStatus = registration.attendance?.status ?? null
                          const statusCopy = currentStatus
                            ? getAttendanceStatusCopy(currentStatus, 'club')
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
                            <li
                              key={registration.registrationId}
                              data-testid={`public-club-class-card-${registration.registrationId}`}
                              className="rounded-2xl border border-line bg-brand-soft/25 px-4 py-3"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-ink">{registration.class.name}</p>
                                  {registration.class.startTime ? (
                                    <p className="text-xs text-muted">
                                      Start {formatSwedishTime(registration.class.startTime)}
                                    </p>
                                  ) : null}
                                  {registration.class.attendanceDeadline ? (
                                    <p className="text-xs text-muted/80">
                                      Anmäl senast {formatSwedishTime(registration.class.attendanceDeadline)}
                                    </p>
                                  ) : null}
                                </div>

                                {currentStatus ? (
                                  <span
                                    data-testid={`public-club-status-badge-${registration.registrationId}`}
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

                              {statusCopy ? (
                                <div
                                  data-testid={`public-club-status-summary-${registration.registrationId}`}
                                  className={`mt-3 rounded-2xl border px-4 py-3 ${statusCopy.containerClassName}`}
                                >
                                  <p className="text-sm font-semibold">{statusCopy.title}</p>
                                  <p className={`mt-1 text-sm ${statusCopy.descriptionClassName}`}>
                                    {statusCopy.description}
                                  </p>
                                </div>
                              ) : null}

                              {missingAttendanceCopy ? (
                                <div
                                  data-testid={`public-club-missing-attendance-${registration.registrationId}`}
                                  className={`mt-3 rounded-2xl border px-4 py-3 ${missingAttendanceCopy.containerClassName}`}
                                >
                                  <p className="text-sm font-semibold">{missingAttendanceCopy.title}</p>
                                  <p className={`mt-1 text-sm ${missingAttendanceCopy.descriptionClassName}`}>
                                    {missingAttendanceCopy.description}
                                  </p>
                                </div>
                              ) : null}

                              {scheduleMissingCopy ? (
                                <div
                                  data-testid={`public-club-schedule-missing-${registration.registrationId}`}
                                  className={`mt-3 rounded-2xl border px-4 py-3 ${scheduleMissingCopy.containerClassName}`}
                                >
                                  <p className="text-sm font-semibold">{scheduleMissingCopy.title}</p>
                                  <p className={`mt-1 text-sm ${scheduleMissingCopy.descriptionClassName}`}>
                                    {scheduleMissingCopy.description}
                                  </p>
                                </div>
                              ) : null}

                              <div className="mt-3">
                                {availability.state === 'schedule_missing' ? null : availability.state === 'not_open' ? (
                                  <p
                                    data-testid={`public-club-attendance-not-open-${registration.registrationId}`}
                                    className="text-xs font-medium text-amber-800"
                                  >
                                    {getAttendanceNotOpenMessage(availability.attendanceOpensAt)}
                                  </p>
                                ) : availability.state === 'deadline_passed' ? null : currentStatus ? (
                                  <button
                                    data-testid={`public-club-reset-btn-${registration.registrationId}`}
                                    type="button"
                                    onClick={() => handleAttendanceAction({
                                      type: 'reset',
                                      playerId: player.id,
                                      registrationId: registration.registrationId,
                                    })}
                                    disabled={isSubmitting || !unlockStateReady}
                                    className="app-button-link"
                                  >
                                    Återställ närvaro
                                  </button>
                                ) : (
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <button
                                      data-testid={`public-club-confirm-btn-${registration.registrationId}`}
                                      type="button"
                                      onClick={() => handleAttendanceAction({
                                        type: 'submit',
                                        playerId: player.id,
                                        registrationId: registration.registrationId,
                                        status: 'confirmed',
                                      })}
                                      disabled={isSubmitting || !unlockStateReady}
                                      className="min-h-[44px] rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-700 transition-all duration-150 hover:bg-green-100 disabled:opacity-60"
                                    >
                                      Bekräfta närvaro
                                    </button>
                                    <button
                                      data-testid={`public-club-absent-btn-${registration.registrationId}`}
                                      type="button"
                                      onClick={() => handleAttendanceAction({
                                        type: 'submit',
                                        playerId: player.id,
                                        registrationId: registration.registrationId,
                                        status: 'absent',
                                      })}
                                      disabled={isSubmitting || !unlockStateReady}
                                      className="min-h-[44px] rounded-xl border border-red-200 bg-surface px-4 py-2.5 text-sm font-semibold text-red-700 transition-all duration-150 hover:bg-red-50 disabled:opacity-60"
                                    >
                                      Anmäl frånvaro
                                    </button>
                                  </div>
                                )}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      </main>

      <PublicAttendancePinModal
        open={pinModalOpen}
        pin={pin}
        onPinChange={setPin}
        onSubmit={authenticatePin}
        onCancel={closePinModal}
        error={pinError}
        loading={pinLoading}
        submitLabel={pendingAction?.type === 'submit' && pendingAction.status === 'absent'
          ? 'Anmäl frånvaro'
          : 'Bekräfta närvaro'}
      />
    </>
  )
}