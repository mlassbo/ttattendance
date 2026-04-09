import Link from 'next/link'
import { formatCompetitionDateRange, getCompetitionDateRange } from '@/lib/competition-dates'
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

  const competitionDateRange = await getCompetitionDateRange(supabase, competition.id)

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
                  Se registrerade spelare, anmäl närvaro och följ tävlingen live.
                </p>
              </div>
            </div>

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

        <section className="grid gap-4 md:grid-cols-2 lg:gap-6">
          <article data-testid="public-start-live-card" className="app-card-soft space-y-4 opacity-80">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-ink">Följ tävlingen live</h2>
              <p className="text-sm leading-6 text-muted">
                Pooler, matcher, resultat och slutspel. Kommer snart.
              </p>
            </div>

            <button
              data-testid="public-start-live-disabled"
              type="button"
              disabled
              className="app-button-secondary w-full"
            >
              Kommer snart
            </button>
          </article>

          <article data-testid="public-start-admin-card" className="app-card-soft space-y-4">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-ink">Sekretariat</h2>
              <p className="text-sm leading-6 text-muted">Logga in för att arbeta med tävlingen.</p>
            </div>

            <Link
              href={`/${slug}/admin`}
              data-testid="public-start-admin-link"
              className="app-button-secondary w-full"
            >
              Sekretariat
            </Link>
          </article>
        </section>
      </div>
    </main>
  )
}
