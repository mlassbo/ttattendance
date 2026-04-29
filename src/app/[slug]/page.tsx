import Link from 'next/link'
import AttendanceStatusBanner from '@/components/AttendanceStatusBanner'
import ClassDashboard from '@/components/ClassDashboard'
import { formatCompetitionDateRange, getCompetitionDateRange } from '@/lib/competition-dates'
import {
  getClassDashboard,
  getClassDashboardLiveStatus,
  getCompetitionAttendanceBannerState,
} from '@/lib/public-competition'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export default async function CompetitionPage({
  params,
}: {
  params: { slug: string }
}) {
  const { slug } = params

  const supabase = createServerClient()
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name')
    .eq('slug', slug)
    .is('deleted_at', null)
    .single()

  if (!competition) {
    return (
      <div className="app-shell flex items-center justify-center">
        <p className="text-muted">Tävlingen hittades inte.</p>
      </div>
    )
  }

  const [
    competitionDateRange,
    dashboardSessions,
    dashboardLiveStatus,
    attendanceBannerState,
  ] = await Promise.all([
    getCompetitionDateRange(supabase, competition.id),
    getClassDashboard(supabase, competition.id),
    getClassDashboardLiveStatus(supabase, competition.id),
    getCompetitionAttendanceBannerState(supabase, competition.id),
  ])

  return (
    <main data-testid="public-start-page" className="app-shell">
      <div className="mx-auto max-w-5xl space-y-6 sm:space-y-8">
        <section className="app-card relative overflow-hidden">
          <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-brand/10 blur-3xl" />
          <div className="relative space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                {formatCompetitionDateRange(
                  competitionDateRange.firstClassStart,
                  competitionDateRange.lastClassStart,
                )}
              </p>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-5xl">
                  {competition.name}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted sm:text-base">
                  Se registrerade spelare och klubbar samt anmäl närvaro.
                </p>
              </div>
            </div>

            <AttendanceStatusBanner
              state={attendanceBannerState}
              variant="landing"
            />

            <form
              data-testid="public-start-search-form"
              action={`/${slug}/search`}
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <input
                data-testid="public-start-search-input"
                name="q"
                type="search"
                placeholder="Sök spelare eller klubb"
                className="app-input"
              />
              <button
                data-testid="public-start-search-button"
                type="submit"
                className="app-button-primary"
              >
                Sök
              </button>
            </form>
          </div>
        </section>

        {dashboardSessions.length > 0 && (
          <ClassDashboard
            sessions={dashboardSessions}
            slug={slug}
            liveStatus={dashboardLiveStatus}
          />
        )}

        <section className="mt-4 border-t border-line/70 pt-6 sm:pt-8">
          <article
            data-testid="public-start-admin-card"
            className="max-w-xs space-y-3 rounded-2xl border border-dashed border-stone-300/80 bg-stone-50/80 p-4 shadow-sm"
          >
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">
                För funktionärer
              </p>
              <h2 className="text-lg font-semibold tracking-tight text-stone-800">Sekretariat</h2>
              <p className="text-sm leading-5 text-stone-600">Logga in som sekretariat</p>
            </div>

            <Link
              href={`/${slug}/admin`}
              data-testid="public-start-admin-link"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-stone-300 bg-stone-100 px-3 py-2 text-sm font-medium text-stone-700 transition-colors duration-150 hover:border-stone-400 hover:bg-stone-200"
            >
              Logga in
            </Link>
          </article>
        </section>
      </div>
    </main>
  )
}
