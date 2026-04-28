import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { decryptStoredPin, encryptStoredPin } from '@/lib/pin-encryption'
import { revalidateCompetitionPaths } from '@/lib/revalidate-competition-paths'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const secret = process.env.COOKIE_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Serverkonfigurationsfel' }, { status: 500 })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('competitions')
    .select('id, name, slug, created_at, admin_pin_ciphertext, show_on_landing_page')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const competitions = data ?? []
  if (competitions.length === 0) {
    return NextResponse.json([])
  }

  const { data: countRows, error: countsError } = await supabase.rpc('competition_registration_counts', {
    p_competition_ids: competitions.map(competition => competition.id),
  })

  if (countsError) {
    return NextResponse.json({ error: countsError.message }, { status: 500 })
  }

  const importedRegistrationCountByCompetitionId = new Map(
    ((countRows ?? []) as Array<{ competition_id: string; imported_registration_count: number | string | null }>).map(row => [
      row.competition_id as string,
      Number(row.imported_registration_count ?? 0),
    ]),
  )

  return NextResponse.json(
    competitions.map(competition => ({
      id: competition.id,
      name: competition.name,
      slug: competition.slug,
      showOnLandingPage: competition.show_on_landing_page,
      importedRegistrationCount: importedRegistrationCountByCompetitionId.get(competition.id) ?? 0,
      adminPin: decryptStoredPin(competition.admin_pin_ciphertext as string | null, secret),
    })),
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  const adminPin = typeof body.adminPin === 'string' ? body.adminPin.trim() : ''

  if (!name || !adminPin) {
    return NextResponse.json({ error: 'Alla fält måste fyllas i' }, { status: 400 })
  }

  if (!/^[a-z][a-z0-9-]{2,29}$/.test(slug)) {
    return NextResponse.json({ error: 'Ogiltigt slug-format' }, { status: 400 })
  }

  const adminPinHash = await bcrypt.hash(adminPin, 10)

  const secret = process.env.COOKIE_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Serverkonfigurationsfel' }, { status: 500 })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('competitions')
    .insert({
      name,
      slug,
      admin_pin_hash: adminPinHash,
      admin_pin_ciphertext: encryptStoredPin(adminPin, secret),
    })
    .select('id, name, slug')
    .single()

  if (error?.code === '23505') {
    return NextResponse.json({ error: 'Slug är redan använd' }, { status: 409 })
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidateCompetitionPaths(slug)

  return NextResponse.json(data, { status: 201 })
}
