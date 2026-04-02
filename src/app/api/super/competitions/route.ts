import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { decryptStoredPin, encryptStoredPin } from '@/lib/pin-encryption'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const secret = process.env.COOKIE_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Serverkonfigurationsfel' }, { status: 500 })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('competitions')
    .select('id, name, slug, start_date, end_date, created_at, player_pin_ciphertext, admin_pin_ciphertext')
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
      start_date: competition.start_date,
      end_date: competition.end_date,
      importedRegistrationCount: importedRegistrationCountByCompetitionId.get(competition.id) ?? 0,
      playerPin: decryptStoredPin(competition.player_pin_ciphertext as string | null, secret),
      adminPin: decryptStoredPin(competition.admin_pin_ciphertext as string | null, secret),
    })),
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, slug, startDate, endDate, playerPin, adminPin } = body

  if (!/^[a-z][a-z0-9-]{2,29}$/.test(slug)) {
    return NextResponse.json({ error: 'Ogiltigt slug-format' }, { status: 400 })
  }

  if (new Date(startDate) > new Date(endDate)) {
    return NextResponse.json(
      { error: 'Startdatum måste vara före slutdatum' },
      { status: 400 }
    )
  }

  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash(String(playerPin), 10),
    bcrypt.hash(String(adminPin), 10),
  ])

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
      start_date: startDate,
      end_date: endDate,
      player_pin_hash: playerPinHash,
      admin_pin_hash: adminPinHash,
      player_pin_ciphertext: encryptStoredPin(String(playerPin), secret),
      admin_pin_ciphertext: encryptStoredPin(String(adminPin), secret),
    })
    .select('id, name, slug')
    .single()

  if (error?.code === '23505') {
    return NextResponse.json({ error: 'Slug är redan använd' }, { status: 409 })
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
