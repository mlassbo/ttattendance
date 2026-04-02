import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyCompetitionCookie } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import ClassesView from './ClassesView'

export default async function PlayerClassesPage({
  params,
}: {
  params: { slug: string; playerId: string }
}) {
  const { slug, playerId } = params
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
    .select('start_date')
    .eq('id', auth.competitionId)
    .is('deleted_at', null)
    .single()

  if (!competition) {
    redirect(`/${slug}/player`)
  }

  return (
    <ClassesView
      slug={slug}
      playerId={playerId}
      competitionStartDate={competition.start_date}
    />
  )
}
