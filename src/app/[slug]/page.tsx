import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import { verifyCompetitionCookie } from '@/lib/auth'
import PinForm from './PinForm'

export default async function CompetitionPage({
  params,
}: {
  params: { slug: string }
}) {
  const { slug } = params

  // If the player already has a valid cookie for this competition, skip the PIN screen.
  const cookieStore = cookies()
  const secret = process.env.COOKIE_SECRET
  const signed = cookieStore.get('role')?.value
  if (signed && secret) {
    const auth = await verifyCompetitionCookie(signed, secret)
    if (auth?.slug === slug && auth.role === 'player') {
      redirect(`/${slug}/search`)
    }
  }

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

  return <PinForm slug={slug} competitionName={competition.name} />
}
