import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { verifyCookie } from '@/lib/cookie-signing'
import { createServerClient } from '@/lib/supabase'
import CompetitionIntegrationView from './CompetitionIntegrationView'

export default async function CompetitionIntegrationPage({
  params,
}: {
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
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6">
        <Link
          href="/super/competitions"
          className="text-sm text-slate-600 underline-offset-2 hover:underline"
        >
          Tillbaka till tävlingar
        </Link>
        <div className="rounded border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold">Tävlingen hittades inte</h1>
        </div>
      </main>
    )
  }

  return (
    <CompetitionIntegrationView
      competitionId={competition.id}
      competitionName={competition.name}
      competitionSlug={competition.slug}
    />
  )
}
