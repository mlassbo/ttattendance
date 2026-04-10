'use client'

import { useRef } from 'react'
import PublicSearchResults from '@/components/PublicSearchResults'
import type {
  PublicSearchClass,
  PublicSearchClub,
  PublicSearchMode,
  PublicSearchPlayer,
} from '@/lib/public-competition'
import { useMobileSearchResultsScroll } from '@/lib/use-mobile-search-results-scroll'

export default function PublicSearchResultsPanel({
  slug,
  query,
  mode,
  players,
  clubs,
  classes,
  summaryText,
}: {
  slug: string
  query: string
  mode: PublicSearchMode
  players: PublicSearchPlayer[]
  clubs: PublicSearchClub[]
  classes: PublicSearchClass[]
  summaryText: string
}) {
  const summaryRef = useRef<HTMLElement | null>(null)
  const resultsRef = useRef<HTMLDivElement | null>(null)

  useMobileSearchResultsScroll({
    hasResults: true,
    mode,
    query,
    summaryRef,
    resultsRef,
  })

  return (
    <>
      <section
        ref={summaryRef}
        data-testid="public-search-results-summary"
        className="space-y-1 px-1"
      >
        <p className="text-sm font-bold text-ink">Sökresultat</p>
        <p className="text-sm font-medium text-ink">{summaryText}</p>
      </section>

      <div ref={resultsRef}>
        <PublicSearchResults
          slug={slug}
          query={query}
          mode={mode}
          initialPlayers={players}
          clubs={clubs}
          classes={classes}
        />
      </div>
    </>
  )
}