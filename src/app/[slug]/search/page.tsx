import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyCompetitionCookie } from '@/lib/auth'
import { getCompetitionDateRange } from '@/lib/competition-dates'
import { createServerClient } from '@/lib/supabase'
import SearchView from './SearchView'

export default async function SearchPage({
  params,
}: {
  params: { slug: string }
}) {
  const { slug } = params
  const cookieStore = cookies()
  const secret = process.env.COOKIE_SECRET
  const signed = cookieStore.get('role')?.value

  const auth = signed && secret ? await verifyCompetitionCookie(signed, secret) : null

  if (!auth || auth.slug !== slug || auth.role !== 'player') {
    redirect(`/${slug}/player`)
  }

  const supabase = createServerClient()
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name')
    .eq('slug', slug)
    .is('deleted_at', null)
    .single()

  if (!competition) {
    redirect(`/${slug}/player`)
  }

  const competitionDateRange = await getCompetitionDateRange(supabase, competition.id)

  return (
    <SearchView
      competitionName={competition.name}
      competitionFirstClassStart={competitionDateRange.firstClassStart}
    />
  )
}
