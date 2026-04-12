import Link from 'next/link'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import { type ClassDashboardEntry, type ClassDashboardSession } from '@/lib/public-competition'

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

function buildClassSearchHref(slug: string, className: string): string {
  const params = new URLSearchParams()
  params.set('mode', 'class')
  params.set('q', className)

  return `/${slug}/search?${params.toString()}`
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
      {entry.reserveCount > 0 && (
        <span className="app-pill-muted">
          {entry.reserveCount} på reservlistan
        </span>
      )}
    </span>
  )
}

export default function ClassDashboard({
  sessions,
  slug,
}: {
  sessions: ClassDashboardSession[]
  slug: string
}) {
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
            {session.classes.map(classEntry => (
              <li key={classEntry.id} className="min-w-0">
                <Link
                  href={buildClassSearchHref(slug, classEntry.name)}
                  data-testid={`class-dashboard-row-${classEntry.id}`}
                  className="group flex h-full flex-col gap-3 rounded-2xl border border-line/80 bg-surface/85 px-4 py-4 shadow-card transition-colors duration-150 hover:border-brand/30 hover:bg-brand-soft/40"
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
                      <AvailabilityIndicator entry={classEntry} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}