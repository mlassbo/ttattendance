import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('competitions')
    .select('id, name, slug, start_date, end_date, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
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
