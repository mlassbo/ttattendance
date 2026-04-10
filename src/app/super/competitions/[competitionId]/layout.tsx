import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { verifyCookie } from '@/lib/cookie-signing'
import { createServerClient } from '@/lib/supabase'
import CompetitionSettingsTabs from './CompetitionSettingsTabs'

export default async function CompetitionSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { competitionId: string }
}) {
  const cookieStore = cookies()
  const secret = process.env.COOKIE_SECRET
  const signed = cookieStore.get('role')?.value
  const role = signed && secret ? await verifyCookie(signed, secret) : null

  if (role !== 'superadmin') {
    redirect('/super')
  }

  const supabase = createServerClient()
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, slug')
    .eq('id', params.competitionId)
    .is('deleted_at', null)
    .single()

  if (!competition) {
    return (
      <main className="app-shell">
        <div className="mx-auto max-w-5xl space-y-4">
          <section className="app-card space-y-3">
            <Link
              href="/super/competitions"
              className="inline-flex items-center gap-2 text-sm text-muted underline-offset-2 hover:underline"
            >
              <span aria-hidden="true">&larr;</span>
              Tillbaka till tävlingar
            </Link>
            <h1 className="text-xl font-semibold">Tävlingen hittades inte</h1>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="app-card space-y-3">
          <Link
            href="/super/competitions"
            data-testid="back-to-competitions"
            className="inline-flex items-center gap-2 text-sm text-muted underline-offset-2 hover:underline"
          >
            <span aria-hidden="true">&larr;</span>
            Tillbaka till tävlingar
          </Link>
          <div className="space-y-2">
            <h1 data-testid="competition-settings-title" className="text-3xl font-semibold tracking-tight text-ink">{competition.name}</h1>
            <p className="text-sm text-muted">{competition.slug}</p>
          </div>
          <CompetitionSettingsTabs competitionId={competition.id} />
        </section>
        {children}
      </div>
    </main>
  )
}
