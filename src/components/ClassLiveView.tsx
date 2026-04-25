import type { ClassLivePool } from '@/lib/public-competition'

type ClassLiveViewProps = {
  pools: ClassLivePool[]
}

export default function ClassLiveView({ pools }: ClassLiveViewProps) {
  return (
    <div
      data-testid="class-live-view"
      className="grid items-start grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {pools.map(pool => {
        const hasFixtures = pool.totalMatches > 0
        const standings = pool.standings ?? []
        const hasPublishedStandings = pool.standings !== null
        const isAwaitingResults =
          !hasPublishedStandings &&
          hasFixtures &&
          pool.playedMatches === pool.totalMatches

        return (
          <section
            key={pool.poolNumber}
            data-testid={`class-live-pool-${pool.poolNumber}`}
            className="rounded-2xl border border-stone-300 bg-stone-50/70 px-4 py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">Pool {pool.poolNumber}</h2>
              {hasPublishedStandings ? (
                <span
                  data-testid={`class-live-pool-final-pill-${pool.poolNumber}`}
                  className="app-pill-success shrink-0"
                >
                  Klar
                </span>
              ) : hasFixtures ? (
                <span
                  data-testid={`class-live-pool-progress-${pool.poolNumber}`}
                  className="app-pill-muted shrink-0"
                >
                  {pool.playedMatches}/{pool.totalMatches} matcher spelade
                </span>
              ) : null}
            </div>

            {hasPublishedStandings ? (
              <ol
                data-testid={`class-live-pool-standings-${pool.poolNumber}`}
                className="mt-3 space-y-2"
              >
                {standings.map(standing => (
                  <li
                    key={`${pool.poolNumber}-${standing.placement}-${standing.playerName}`}
                    data-testid={`class-live-pool-standing-${pool.poolNumber}-${standing.placement}`}
                    className="flex items-start gap-3 text-sm text-ink"
                  >
                    <span className="w-5 shrink-0 text-right font-medium tabular-nums">
                      {standing.placement}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{standing.playerName}</span>
                      {standing.clubName ? (
                        <span className="block text-xs text-muted">{standing.clubName}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <ul className="mt-3 space-y-2">
                {pool.players.map((player, index) => (
                  <li key={`${pool.poolNumber}-${index}-${player.name}`} className="text-sm text-ink">
                    <span className="block font-medium">{player.name}</span>
                    {player.club ? <span className="block text-xs text-muted">{player.club}</span> : null}
                  </li>
                ))}
              </ul>
            )}

            {isAwaitingResults ? (
              <p
                data-testid={`class-live-pool-awaiting-results-${pool.poolNumber}`}
                className="mt-3 text-xs font-semibold text-amber-800"
              >
                OBS. Alla matcher är klara men poolresultatet är inte publicerat ännu
              </p>
            ) : null}

            {hasFixtures ? (
              <details
                data-testid={`class-live-pool-matches-${pool.poolNumber}`}
                className="group mt-3 -mx-4 -mb-4 overflow-hidden rounded-b-2xl bg-white text-ink"
              >
                <summary
                  data-testid={`class-live-pool-matches-toggle-${pool.poolNumber}`}
                  className="flex w-full cursor-pointer list-none items-center justify-between gap-3 bg-slate-700 px-4 py-3 text-sm font-medium text-white"
                >
                  <span>
                    <span className="group-open:hidden">Visa matcher</span>
                    <span className="hidden group-open:inline">Dölj matcher</span>
                  </span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="none"
                    className="h-4 w-4 shrink-0 text-slate-300 transition-transform duration-150 group-open:rotate-180"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 8l5 5 5-5" />
                  </svg>
                </summary>

                <ul>
                  {pool.matches.map((match, matchIndex) => (
                    <li
                      key={`${pool.poolNumber}-${matchIndex}-${match.playerA.name}-${match.playerB.name}`}
                      data-testid={`class-live-match-${pool.poolNumber}-${matchIndex}`}
                      className={`flex items-start justify-between gap-3 px-4 py-3 text-sm ${
                        matchIndex % 2 === 0 ? 'bg-white' : 'bg-slate-100'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className={match.isPlayed && !match.isWalkover && match.setScoreA! > match.setScoreB! ? 'font-semibold text-ink' : 'text-muted'}>
                          {match.playerA.name} -
                        </p>
                        <p className={match.isPlayed && !match.isWalkover && match.setScoreB! > match.setScoreA! ? 'font-semibold text-ink' : 'text-muted'}>
                          {match.playerB.name}
                        </p>
                      </div>
                      {match.isWalkover ? (
                        <span className="shrink-0 rounded-full bg-slate-700 px-2.5 py-1 text-xs font-semibold text-white">
                          WO
                        </span>
                      ) : match.isPlayed ? (
                        <span className="shrink-0 rounded-full bg-slate-700 px-2.5 py-1 text-xs font-semibold tabular-nums text-white">
                          {match.setScoreA}&ndash;{match.setScoreB}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs font-medium text-muted">
                          Ej spelad än
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
