import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServerClient } from '@/lib/supabase'
import { signCompetitionCookie } from '@/lib/auth'

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const body = await req.json()
  const { pin } = body

  if (!pin || typeof pin !== 'string') {
    return NextResponse.json({ error: 'PIN saknas' }, { status: 400 })
  }

  const secret = process.env.COOKIE_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Serverkonfigurationsfel' }, { status: 500 })
  }

  const supabase = createServerClient()
  const { data: competition, error } = await supabase
    .from('competitions')
    .select('id, player_pin_hash')
    .eq('slug', params.slug)
    .is('deleted_at', null)
    .single()

  if (error || !competition) {
    return NextResponse.json({ error: 'Tävlingen hittades inte' }, { status: 404 })
  }

  const valid = await bcrypt.compare(pin, competition.player_pin_hash)
  if (!valid) {
    return NextResponse.json({ error: 'Fel PIN-kod' }, { status: 401 })
  }

  const cookieValue = await signCompetitionCookie(
    { role: 'player', competitionId: competition.id, slug: params.slug },
    secret
  )

  const res = NextResponse.json({ ok: true })
  res.cookies.set('role', cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 hours
    path: '/',
  })
  return res
}
