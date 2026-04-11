'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  formatSwedishTime,
  getAttendanceNotOpenMessage,
  getPlayerAttendanceAvailability,
} from '@/lib/attendance-window'
import {
  getCompetitionScheduleMissingCopy,
  getAttendanceStatusCopy,
  getDeadlinePassedWithoutAttendanceCopy,
} from '@/lib/public-attendance-ui'
import type { PublicPlayerDetails } from '@/lib/public-competition'
import { formatPlayerSessionLabel } from '@/lib/session-format'
import PublicAttendancePinModal from '@/components/PublicAttendancePinModal'
import { usePublicAttendanceActions } from '@/lib/use-public-attendance-actions'

type AttendanceAction =
  | { type: 'submit'; registrationId: string; status: 'confirmed' | 'absent' }
  | { type: 'reset'; registrationId: string }

function getReserveLabel(reservePosition: number | null) {
  return reservePosition ? `Reserv #${reservePosition}` : 'Reserv'
}

export default function PublicPlayerView({
  slug,
  competitionName,
  playerDetails,
  backHref,
}: {
  slug: string
  competitionName: string
  playerDetails: PublicPlayerDetails
  backHref: string
}) {
  const [data, setData] = useState(playerDetails)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

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
        registrations: prev.registrations.map(registration => {
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
        }),
        sessionGroups: prev.sessionGroups.map(group => ({
          ...group,
          registrations: group.registrations.map(registration => {
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
          }),
        })),
      }))
    },
  })

  return (
    <>
      <main data-testid="public-player-page" className="app-shell">
        <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
          <section className="app-card space-y-4">
            <Link
              href={backHref}
              data-testid="public-player-back-link"
              className="w-fit text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-hover"
            >
              ← Tillbaka till sök
            </Link>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                {competitionName}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-ink">
                {data.player.name}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
                {data.player.club ? <span>{data.player.club}</span> : null}
                <span className="app-pill-muted">{data.registrations.length} klasser</span>
              </div>
            </div>
          </section>

          {actionError ? (
            <p data-testid="public-player-error" className="app-banner-error">
              {actionError}
            </p>
          ) : null}

          {data.registrations.length === 0 ? (
            <section data-testid="public-player-empty" className="app-card-soft text-sm text-muted">
              Inga klasser registrerade.
            </section>
          ) : (
            data.sessionGroups.map(group => (
              <section
                key={group.session?.id ?? group.registrations[0].registrationId}
                className="space-y-3"
              >
                <h2
                  data-testid={`public-player-session-${group.session?.id ?? 'unknown'}`}
                  className="px-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted"
                >
                  {group.session
                    ? formatPlayerSessionLabel(
                        group.session.date,
                        group.session.daySessionOrder ?? group.session.sessionOrder,
                      )
                    : 'Okänt pass'}
                </h2>

                <div className="space-y-3">
                  {group.registrations.map(registration => {
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
                        data-testid={`public-player-class-card-${registration.registrationId}`}
                        className="app-card"
                      >
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-ink">{registration.class.name}</h3>
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
                              {getReserveLabel(registration.reservePosition)}
                            </span>
                          ) : currentStatus ? (
                            <span
                              data-testid={`public-player-status-badge-${registration.registrationId}`}
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
                              Närvaro kan rapporteras först när du blir fullt registrerad.
                            </p>
                          </div>
                        ) : statusCopy ? (
                          <div
                            data-testid={`public-player-status-summary-${registration.registrationId}`}
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
                            data-testid={`public-player-missing-attendance-${registration.registrationId}`}
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
                            data-testid={`public-player-schedule-missing-${registration.registrationId}`}
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
                            data-testid={`public-player-attendance-not-open-${registration.registrationId}`}
                            className="text-xs font-medium text-amber-800"
                          >
                            {getAttendanceNotOpenMessage(availability.attendanceOpensAt)}
                          </p>
                        ) : availability.state === 'deadline_passed' ? null : currentStatus ? (
                          <button
                            data-testid={`public-player-reset-btn-${registration.registrationId}`}
                            type="button"
                            onClick={() => handleAttendanceAction({
                              type: 'reset',
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
                              data-testid={`public-player-confirm-btn-${registration.registrationId}`}
                              type="button"
                              onClick={() => handleAttendanceAction({
                                type: 'submit',
                                registrationId: registration.registrationId,
                                status: 'confirmed',
                              })}
                              disabled={isSubmitting || !unlockStateReady}
                              className="min-h-[44px] rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-700 transition-all duration-150 hover:bg-green-100 disabled:opacity-60"
                            >
                              Bekräfta närvaro
                            </button>
                            <button
                              data-testid={`public-player-absent-btn-${registration.registrationId}`}
                              type="button"
                              onClick={() => handleAttendanceAction({
                                type: 'submit',
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
                      </article>
                    )
                  })}
                </div>
              </section>
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