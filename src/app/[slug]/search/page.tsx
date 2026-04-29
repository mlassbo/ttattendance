import Link from 'next/link'
import { redirect } from 'next/navigation'
import type {
  AttendanceStatusBannerState,
  PublicSearchMode,
} from '@/lib/public-competition'
import AttendanceStatusBanner from '@/components/AttendanceStatusBanner'
import PublicSearchResultsPanel from '@/components/PublicSearchResultsPanel'
import {
  getCompetitionAttendanceBannerState,
  getPublicCompetitionBySlug,
  searchPublicCompetition,
} from '@/lib/public-competition'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function isSearchMode(value: string | undefined): value is PublicSearchMode {
  return value === 'all' || value === 'player' || value === 'club'
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

function buildSearchResultsSummary(results: {
  players: unknown[]
  clubs: unknown[]
}) {
  const totalCount = results.players.length + results.clubs.length

  if (totalCount === 0) {
    return ''
  }

  if (totalCount === 1) {
    return '1 träff'
  }

  return `${totalCount} träffar`
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams?: { q?: string; mode?: string }
}) {
  const { slug } = params
  const query = searchParams?.q?.trim() ?? ''
  const mode = isSearchMode(searchParams?.mode) ? searchParams.mode : 'all'

  const supabase = createServerClient()
  let competition

  try {
    competition = await getPublicCompetitionBySlug(supabase, slug)
  } catch {
    return (
      <main data-testid="public-search-page" className="app-shell">
        <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
          <section className="app-card space-y-5">
            <Link
              href={`/${slug}`}
              data-testid="public-search-back-link"
              className="inline-flex w-fit text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-hover"
            >
              ← Till startsidan
            </Link>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Sök</p>
              <h1 className="text-3xl font-semibold tracking-tight text-ink">Sök</h1>
              <p className="text-sm leading-6 text-muted">Sök på spelare eller klubb.</p>
            </div>
          </section>

          <section data-testid="public-search-load-error" className="app-banner-error">
            Det gick inte att läsa tävlingsinformationen just nu. Försök igen.
          </section>
        </div>
      </main>
    )
  }

  if (!competition) {
    redirect('/')
  }

  try {
    const resultsPromise = query.length >= 2
      ? searchPublicCompetition(supabase, competition.id, query, mode)
      : Promise.resolve({ players: [], clubs: [] })
    const attendanceBannerStatePromise = getCompetitionAttendanceBannerState(
      supabase,
      competition.id,
    ).catch((error): AttendanceStatusBannerState => {
      console.error('Failed to load attendance banner state', error)
      return { kind: 'idle' }
    })

    const [results, attendanceBannerState] = await Promise.all([
      resultsPromise,
      attendanceBannerStatePromise,
    ])
    const hasSearched = query.length >= 2
    const hasTooShortQuery = query.length > 0 && query.length < 2
    const hasResults = results.players.length > 0 || results.clubs.length > 0
    const tabs: Array<{ mode: PublicSearchMode; label: string; testId: string }> = [
      { mode: 'all', label: 'Alla', testId: 'public-search-mode-all' },
      { mode: 'player', label: 'Spelare', testId: 'public-search-mode-player' },
      { mode: 'club', label: 'Klubbar', testId: 'public-search-mode-club' },
    ]

    return (
      <main data-testid="public-search-page" className="app-shell">
        <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
          <section className="app-card space-y-5">
            <Link
              href={`/${slug}`}
              data-testid="public-search-back-link"
              className="inline-flex w-fit text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-hover"
            >
              ← Till startsidan
            </Link>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Sök</p>
              <h1 className="text-3xl font-semibold tracking-tight text-ink">{competition.name}</h1>
              {attendanceBannerState.kind !== 'open' ? (
                <p className="text-sm leading-6 text-muted">Sök på spelare eller klubb.</p>
              ) : null}
            </div>

            <AttendanceStatusBanner
              state={attendanceBannerState}
              variant="search"
            />

            <nav
              data-testid="public-search-mode-tabs"
              aria-label="Sökfilter"
              className="flex flex-wrap gap-2"
            >
              {tabs.map(tab => {
                const selected = mode === tab.mode

                return (
                  <Link
                    key={tab.mode}
                    href={buildSearchHref(slug, '', tab.mode)}
                    data-testid={tab.testId}
                    aria-current={selected ? 'page' : undefined}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 ${
                      selected
                        ? 'bg-brand text-white'
                        : 'bg-brand-soft/60 text-ink hover:bg-brand-soft'
                    }`}
                  >
                    {tab.label}
                  </Link>
                )
              })}
            </nav>

            <>
              <form
                data-testid="public-search-form"
                action={`/${slug}/search`}
                className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <input type="hidden" name="mode" value={mode} />
                <input
                  data-testid="public-search-input"
                  name="q"
                  type="search"
                  defaultValue={query}
                  placeholder="Skriv minst 2 tecken"
                  className="app-input"
                />
                <button
                  data-testid="public-search-submit"
                  type="submit"
                  className="app-button-primary"
                >
                  Sök
                </button>
              </form>

              {hasTooShortQuery ? (
                <p data-testid="public-search-short-query" className="text-sm text-muted">
                  Skriv minst 2 tecken
                </p>
              ) : null}
            </>
          </section>

          {!hasSearched ? (
            <section data-testid="public-search-empty-state" className="app-card-soft text-sm text-muted">
              Sök på spelare eller klubb.
            </section>
          ) : null}

          {hasSearched && !hasResults ? (
            <section data-testid="public-search-no-results" className="app-card-soft space-y-1 text-center">
              <p className="text-base font-semibold text-ink">Inga träffar på din sökning.</p>
              <p className="text-sm text-muted">Sök på spelare eller klubb.</p>
            </section>
          ) : null}

          {hasSearched && hasResults ? (
            <PublicSearchResultsPanel
              slug={slug}
              query={query}
              mode={mode}
              players={results.players}
              clubs={results.clubs}
              summaryText={buildSearchResultsSummary(results)}
            />
          ) : null}
        </div>
      </main>
    )
  } catch {
    return (
      <main data-testid="public-search-page" className="app-shell">
        <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
          <section className="app-card space-y-5">
            <Link
              href={`/${slug}`}
              data-testid="public-search-back-link"
              className="inline-flex w-fit text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-hover"
            >
              ← Till startsidan
            </Link>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Sök</p>
              <h1 className="text-3xl font-semibold tracking-tight text-ink">Sök</h1>
              <p className="text-sm leading-6 text-muted">Sök på spelare eller klubb.</p>
            </div>
          </section>

          <section data-testid="public-search-load-error" className="app-banner-error">
            Det gick inte att läsa tävlingsinformationen just nu. Försök igen.
          </section>
        </div>
      </main>
    )
  }
}
