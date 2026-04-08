import Link from 'next/link'
import { createServerClient } from '@/lib/supabase'
import { getPublicClubDetails, getPublicCompetitionBySlug } from '@/lib/public-competition'
import ClubPlayersView from './ClubPlayersView'

export const dynamic = 'force-dynamic'

function decodeClubKey(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default async function ClubPage({
  params,
  searchParams,
}: {
  params: { slug: string; clubKey: string }
  searchParams?: { returnTo?: string }
}) {
  const { slug, clubKey } = params
  const decodedClubKey = decodeClubKey(clubKey)
  const requestedReturnTo = searchParams?.returnTo
  const returnTo = requestedReturnTo?.startsWith(`/${slug}/`)
    ? requestedReturnTo
    : `/${slug}/search?mode=club&q=${encodeURIComponent(decodedClubKey)}`
  const supabase = createServerClient()
  try {
    const competition = await getPublicCompetitionBySlug(supabase, slug)

    if (!competition) {
      return (
        <div className="app-shell flex items-center justify-center">
          <p className="text-muted">Tävlingen hittades inte.</p>
        </div>
      )
    }

    const club = await getPublicClubDetails(supabase, competition.id, decodedClubKey)

    if (!club) {
      return (
        <div className="app-shell flex items-center justify-center">
          <p className="text-muted">Klubben hittades inte.</p>
        </div>
      )
    }

    return (
      <ClubPlayersView
        slug={slug}
        competitionName={competition.name}
        club={club}
        returnTo={returnTo}
      />
    )
  } catch {
    return (
      <main className="app-shell">
        <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
          <section className="app-card">
            <Link
              href={returnTo}
              className="w-fit text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-hover"
            >
              ← Tillbaka till sök
            </Link>
          </section>

          <section data-testid="public-club-load-error" className="app-banner-error">
            Det gick inte att läsa klubbens uppgifter just nu. Försök igen.
          </section>
        </div>
      </main>
    )
  }
}