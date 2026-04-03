import LandingEntryCard from '@/components/LandingEntryCard'
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
    <main className="app-shell flex items-center justify-center">
      <div className="relative w-full max-w-2xl">
        <LandingEntryCard
          title={competition.name}
          description="Välj om du ska rapportera som spelare eller arbeta i sekretariatet."
          testId="competition-role-card"
          actions={[
            {
              href: `/${slug}/player`,
              label: 'Logga in som spelare',
              testId: 'competition-role-link-player',
            },
            {
              href: `/${slug}/admin`,
              label: 'Logga in som sekretariat',
              testId: 'competition-role-link-admin',
            },
          ]}
        />
      </div>
    </main>
  )
}
