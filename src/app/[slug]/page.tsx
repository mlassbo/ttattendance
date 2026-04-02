import LandingEntryCard from '@/components/LandingEntryCard'
import { createServerClient } from '@/lib/supabase'

export default async function CompetitionPage({
  params,
}: {
  params: { slug: string }
}) {
  const { slug } = params

  const supabase = createServerClient()
  const { data: competition } = await supabase
    .from('competitions')
    .select('name')
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

  return (
    <main className="app-shell">
      <div className="relative mx-auto max-w-3xl space-y-6">
        <div className="mx-auto max-w-2xl space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Tävling</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {competition.name}
          </h1>
          <p className="text-base leading-7 text-muted">
            Välj den roll som passar dig just nu. Båda vyerna är anpassade för snabb användning på mobilen.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <LandingEntryCard
            eyebrow="Spelare"
            title="Rapportera närvaro"
            description="Sök efter ditt namn eller din klubb och markera snabbt om du kommer eller inte."
            href={`/${slug}/player`}
            hrefTestId="competition-role-link-player"
            testId="competition-role-card-player"
          />

          <LandingEntryCard
            eyebrow="Sekretariat"
            title="Följ upp svaren"
            description="Se läget i varje pass, fånga upp sena svar och hjälp spelare på plats."
            href={`/${slug}/admin`}
            hrefTestId="competition-role-link-admin"
            testId="competition-role-card-admin"
          />
        </div>
      </div>
    </main>
  )
}
