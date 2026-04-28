import Link from 'next/link'
import { formatSwedishTime } from '@/lib/attendance-window'
import type { AttendanceStatusBannerState } from '@/lib/public-competition'

type AttendanceStatusBannerProps = {
  state: AttendanceStatusBannerState
  variant: 'landing' | 'search'
  slug: string
}

export default function AttendanceStatusBanner({
  state,
  variant,
  slug,
}: AttendanceStatusBannerProps) {
  if (state.kind === 'idle') {
    return null
  }

  if (state.kind === 'open') {
    if (variant === 'landing') {
      return (
        <section
          data-testid="attendance-status-banner-open"
          className="rounded-2xl border border-green-200 bg-green-50/80 px-4 py-4 sm:px-5"
        >
          <div className="space-y-4">
            <p className="text-sm font-semibold text-green-800">Närvaroanmälan är öppen</p>
            <Link
              href={`/${slug}/search`}
              data-testid="attendance-status-banner-cta"
              className="app-button-primary inline-flex w-full sm:w-auto"
            >
              Anmäl närvaro
            </Link>
          </div>
        </section>
      )
    }

    return (
      <section
        data-testid="attendance-status-banner-open"
        className="rounded-2xl border border-green-200 bg-green-50/80 px-4 py-3"
      >
        <p className="text-sm font-semibold text-green-800">Närvaroanmälan är öppen</p>
        <p className="text-sm leading-6 text-green-800/90">
          Sök spelare eller klubb för att anmäla närvaro.
        </p>
      </section>
    )
  }

  if (state.kind === 'opens_soon') {
    if (variant !== 'landing') {
      return null
    }

    return (
      <section
        data-testid="attendance-status-banner-opens-soon"
        className="rounded-2xl border border-line/80 bg-surface/85 px-4 py-3"
      >
        <p className="text-sm font-semibold text-ink">Närvaroanmälan</p>
        <p className="text-sm leading-6 text-muted">
          Öppnar kl{' '}
          <span data-testid="attendance-status-banner-opens-at">
            {formatSwedishTime(state.opensAt)}
          </span>
        </p>
      </section>
    )
  }

  if (variant !== 'landing') {
    return null
  }

  return (
    <section
      data-testid="attendance-status-banner-closed-pending"
      className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3"
    >
      <p className="text-sm font-semibold text-amber-900">Närvaroanmälan stängd</p>
      <p className="text-sm leading-6 text-amber-900/90">
        Kontakta sekretariatet om du inte anmält närvaro.
      </p>
    </section>
  )
}
