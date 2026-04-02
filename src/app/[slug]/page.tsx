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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Tävlingen hittades inte.</p>
      </div>
    )
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-100 px-4 py-10 text-slate-950 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.1),_transparent_32%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(241,245,249,0.98))]" />

      <div className="relative mx-auto max-w-3xl">
        <LandingEntryCard
          title={competition.name}
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
