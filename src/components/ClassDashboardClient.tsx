'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import { useState } from 'react'
import ClassLiveView from '@/components/ClassLiveView'
import PublicClassRosterView from '@/components/PublicClassRosterView'
import type {
  ClassDashboardEntry,
  ClassDashboardSession,
  ClassLiveData,
  ClassLiveStatus,
  PublicSearchClass,
} from '@/lib/public-competition'

type ClassDashboardClientProps = {
  sessions: ClassDashboardSession[]
  slug: string
  liveStatusByClassId: Record<string, ClassLiveStatus>
}

type ClassLiveResponse = {
  status: ClassLiveStatus
  data: ClassLiveData | null
  classDetails: PublicSearchClass | null
}

type ClassLiveState = {
  loading: boolean
  status: ClassLiveStatus
  data: ClassLiveData | null
  classDetails: PublicSearchClass | null
  error: boolean
}

type ExpandedTab = 'players' | 'pools'

function OpenInNewTabIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4h5v5" />
      <path d="M16 4l-7 7" />
      <path d="M8 6H6.5A2.5 2.5 0 0 0 4 8.5v5A2.5 2.5 0 0 0 6.5 16h5A2.5 2.5 0 0 0 14 13.5V12" />
    </svg>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex min-h-32 items-center justify-center">
      <span
        aria-label="Laddar"
        className="h-8 w-8 animate-spin rounded-full border-2 border-brand/20 border-t-brand"
      />
    </div>
  )
}

function fromDateString(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatSessionHeading(date: string, sessionName: string): string {
  const weekday = format(fromDateString(date), 'EEE', { locale: sv })
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} - ${sessionName}`
}

function formatTime(iso: string | null): string {
  if (!iso) {
    return '–'
  }

  return new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Stockholm',
  }).format(new Date(iso))
}

function buildClassLiveHref(slug: string, classId: string): string {
  return `/${slug}/classes/${classId}`
}

function AvailabilityIndicator({ entry }: { entry: ClassDashboardEntry }) {
  if (entry.maxPlayers === null) {
    return <span className="text-xs text-muted">–</span>
  }

  const spotsLeft = entry.maxPlayers - entry.registeredCount

  if (entry.registeredCount < entry.maxPlayers && spotsLeft > 2) {
    return <span className="app-pill-warning">{spotsLeft} platser kvar</span>
  }

  if (entry.registeredCount < entry.maxPlayers && spotsLeft === 1) {
    return <span className="app-pill-warning">1 plats kvar</span>
  }

  if (entry.registeredCount < entry.maxPlayers && spotsLeft === 2) {
    return <span className="app-pill-warning">2 platser kvar</span>
  }

  return (
    <span className="flex flex-wrap items-center justify-end gap-2 text-right">
      <span className="app-pill-muted">Fullt</span>
      {entry.reserveCount > 0 ? (
        <span className="app-pill-muted">{entry.reserveCount} på reservlistan</span>
      ) : null}
    </span>
  )
}

export default function ClassDashboardClient({
  sessions,
  slug,
  liveStatusByClassId,
}: ClassDashboardClientProps) {
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null)
  const [liveStateByClassId, setLiveStateByClassId] = useState<Record<string, ClassLiveState>>({})
  const [activeTabByClassId, setActiveTabByClassId] = useState<Record<string, ExpandedTab>>({})

  function getDefaultTab(classId: string): ExpandedTab {
    return liveStatusByClassId[classId] === 'pools_available' ? 'pools' : 'players'
  }

  async function loadLiveState(classId: string) {
    setLiveStateByClassId(previous => ({
      ...previous,
      [classId]: {
        loading: true,
        status: previous[classId]?.status ?? 'none',
        data: previous[classId]?.data ?? null,
        classDetails: previous[classId]?.classDetails ?? null,
        error: false,
      },
    }))

    try {
      const response = await fetch(`/api/public/classes/${classId}/live`, {
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error('Request failed')
      }

      const payload = await response.json() as ClassLiveResponse
      setLiveStateByClassId(previous => ({
        ...previous,
        [classId]: {
          loading: false,
          status: payload.status,
          data: payload.data,
          classDetails: payload.classDetails,
          error: false,
        },
      }))
    } catch {
      setLiveStateByClassId(previous => ({
        ...previous,
        [classId]: {
          loading: false,
          status: 'none',
          data: null,
          classDetails: null,
          error: true,
        },
      }))
    }
  }

  function toggleClass(classId: string) {
    if (expandedClassId === classId) {
      setExpandedClassId(null)
      return
    }

    setExpandedClassId(classId)
    setActiveTabByClassId(previous => ({
      ...previous,
      [classId]: getDefaultTab(classId),
    }))

    const existingState = liveStateByClassId[classId]
    if (!existingState || existingState.error) {
      void loadLiveState(classId)
    }
  }

  return (
    <section data-testid="class-dashboard" className="space-y-6">
      {sessions.map((session, index) => (
        <div
          key={session.id}
          className={index === 0 ? undefined : 'border-t border-line/60 pt-6'}
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {formatSessionHeading(session.date, session.name)}
          </p>

          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {session.classes.map(classEntry => {
              const isExpanded = expandedClassId === classEntry.id
              const liveState = liveStateByClassId[classEntry.id]
              const hasLivePools = liveStatusByClassId[classEntry.id] === 'pools_available'
              const activeTab = activeTabByClassId[classEntry.id] ?? getDefaultTab(classEntry.id)

              return (
                <li
                  key={classEntry.id}
                  data-testid={`class-dashboard-row-${classEntry.id}`}
                  className={`min-w-0 ${isExpanded ? 'sm:col-span-2 xl:col-span-3' : ''}`}
                >
                  <div className="overflow-hidden rounded-2xl border border-line/80 bg-surface/85 shadow-card">
                    <button
                      type="button"
                      data-testid={`class-card-expand-${classEntry.id}`}
                      aria-expanded={isExpanded}
                      onClick={() => toggleClass(classEntry.id)}
                      className="group flex w-full flex-col gap-3 px-4 py-4 text-left transition-colors duration-150 hover:bg-brand-soft/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <h3 className="text-base font-semibold leading-tight text-ink transition-colors group-hover:text-brand-hover">
                            {classEntry.name}
                          </h3>
                          <span className="block text-sm tabular-nums text-muted">
                            {formatTime(classEntry.startTime)}
                          </span>
                        </div>

                        <div className="shrink-0 space-y-2 text-right">
                          <div className="text-sm font-medium text-muted">
                            {classEntry.registeredCount} anmälda
                          </div>
                          {hasLivePools ? (
                            <span
                              data-testid={`class-live-pill-${classEntry.id}`}
                              className="app-pill-success"
                            >
                              Pooler lottade
                            </span>
                          ) : (
                            <AvailabilityIndicator entry={classEntry} />
                          )}
                        </div>
                      </div>
                    </button>

                    {isExpanded ? (
                      <div className="border-t border-line/70 bg-brand-soft/20 px-4 py-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div
                            role="tablist"
                            aria-label={`Visa innehall for ${classEntry.name}`}
                            className="flex items-center gap-2"
                          >
                            <button
                              type="button"
                              role="tab"
                              aria-selected={activeTab === 'players'}
                              onClick={() => setActiveTabByClassId(previous => ({
                                ...previous,
                                [classEntry.id]: 'players',
                              }))}
                              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                                activeTab === 'players'
                                  ? 'bg-brand text-white'
                                  : 'border border-line/80 bg-white text-ink shadow-sm hover:border-brand/30 hover:bg-brand-soft/40'
                              }`}
                            >
                              Spelare
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={activeTab === 'pools'}
                              aria-disabled={!hasLivePools}
                              disabled={!hasLivePools}
                              onClick={() => setActiveTabByClassId(previous => ({
                                ...previous,
                                [classEntry.id]: 'pools',
                              }))}
                              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                                activeTab === 'pools'
                                  ? 'bg-brand text-white'
                                  : 'border border-line/80 bg-white text-ink shadow-sm hover:border-brand/30 hover:bg-brand-soft/40'
                              } disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-muted disabled:shadow-none disabled:hover:bg-stone-100`}
                            >
                              Pooler
                            </button>
                          </div>
                          <Link
                            href={buildClassLiveHref(slug, classEntry.id)}
                            data-testid="class-live-open-tab"
                            target="_blank"
                            rel="noopener"
                            aria-label="Öppna i ny flik"
                            title="Öppna i ny flik"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-brand transition-colors duration-150 hover:border-brand/30 hover:text-brand-hover"
                          >
                            <OpenInNewTabIcon />
                          </Link>
                        </div>

                        {liveState?.loading ? (
                          <LoadingSpinner />
                        ) : activeTab === 'pools' && liveState?.status === 'pools_available' && liveState.data ? (
                          <ClassLiveView pools={liveState.data.pools} />
                        ) : liveState?.classDetails ? (
                          <PublicClassRosterView
                            classDetails={liveState.classDetails}
                            showSummaryPills={false}
                          />
                        ) : liveState?.error ? (
                          <p className="text-sm text-muted">Försök igen om en liten stund.</p>
                        ) : (
                          <p className="text-sm text-muted">Ingen lottning ännu</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
