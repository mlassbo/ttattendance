import Link from 'next/link'
import { getPublicCompetitionBySlug, getPublicPlayerDetails } from '@/lib/public-competition'
import { createServerClient } from '@/lib/supabase'
import PublicPlayerView from './PublicPlayerView'

export const dynamic = 'force-dynamic'

export default async function PlayerClassesPage({
  params,
  searchParams,
}: {
  params: { slug: string; playerId: string }
  searchParams?: { returnTo?: string }
}) {
  const { slug, playerId } = params
  const requestedReturnTo = searchParams?.returnTo
  const backHref = requestedReturnTo?.startsWith(`/${slug}/`)
    ? requestedReturnTo
    : `/${slug}/search`

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

    const playerDetails = await getPublicPlayerDetails(supabase, competition.id, playerId)

    if (!playerDetails) {
      return (
        <div className="app-shell flex items-center justify-center">
          <p className="text-muted">Spelaren hittades inte.</p>
        </div>
      )
    }

    return (
      <PublicPlayerView
        competitionName={competition.name}
        playerDetails={playerDetails}
        backHref={backHref}
      />
    )
  } catch {
    return (
      <main className="app-shell">
        <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
          <section className="app-card">
            <Link
              href={backHref}
              className="w-fit text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-hover"
            >
              ← Tillbaka till sök
            </Link>
          </section>

          <section data-testid="public-player-load-error" className="app-banner-error">
            Det gick inte att läsa spelarens uppgifter just nu. Försök igen.
          </section>
        </div>
      </main>
    )
  }
}
