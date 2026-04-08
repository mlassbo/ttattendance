import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { PublicSearchMode } from '@/lib/public-competition'
import { getPublicCompetitionBySlug, searchPublicCompetition } from '@/lib/public-competition'
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

function buildReturnTo(slug: string, query: string, mode: PublicSearchMode) {
  return buildSearchHref(slug, query, mode)
}

function clubTestIdFragment(clubName: string) {
  return clubName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
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
    const results = query.length >= 2
      ? await searchPublicCompetition(supabase, competition.id, query, mode)
      : { players: [], clubs: [] }
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
              <p className="text-sm leading-6 text-muted">Sök på spelare eller klubb.</p>
            </div>

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
                    href={buildSearchHref(slug, query, tab.mode)}
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
                autoFocus
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

          {results.players.length > 0 ? (
            <section data-testid="public-search-players-section" className="space-y-3">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                Spelare
              </h2>

              <div className="space-y-3">
                {results.players.map(player => (
                  <article
                    key={player.id}
                    data-testid={`public-search-player-card-${player.id}`}
                    className="app-card"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold text-ink">{player.name}</h3>
                        {player.club ? <p className="text-sm text-muted">{player.club}</p> : null}
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2 sm:max-w-[55%]">
                        {player.classNames.length > 0 ? (
                          <div
                            data-testid={`public-search-player-class-pills-${player.id}`}
                            className="flex flex-wrap justify-end gap-2"
                          >
                            {player.classNames.map(className => (
                              <span
                                key={className}
                                className="app-pill-muted"
                              >
                                {className}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <Link
                          href={`/${slug}/players/${player.id}?returnTo=${encodeURIComponent(buildReturnTo(slug, query, mode))}`}
                          data-testid={`public-search-player-link-${player.id}`}
                          className="app-button-secondary"
                        >
                          Visa spelare
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {results.clubs.length > 0 ? (
            <section data-testid="public-search-clubs-section" className="space-y-3">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                Klubbar
              </h2>

              <div className="space-y-3">
                {results.clubs.map(club => (
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
                        href={`/${slug}/clubs/${encodeURIComponent(club.name)}?returnTo=${encodeURIComponent(buildReturnTo(slug, query, mode))}`}
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
