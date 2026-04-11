import { NextRequest, NextResponse } from 'next/server'
import { getAuthorizedReserveClass } from '../reserve-auth'
import { createServerClient } from '@/lib/supabase'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { classId: string; registrationId: string } },
) {
  const { supabase, errorResponse } = await getAuthorizedReserveClass(req, params.classId)
  if (errorResponse) {
    return errorResponse
  }

  if (!supabase) {
    return NextResponse.json({ error: 'Klassen hittades inte' }, { status: 404 })
  }

  const { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .select('id, player_id, status')
    .eq('id', params.registrationId)
    .eq('class_id', params.classId)
    .maybeSingle()

  if (registrationError || !registration) {
    return NextResponse.json({ error: 'Anmälan hittades inte' }, { status: 404 })
  }

  if (registration.status === 'registered') {
    return NextResponse.json(
      { error: 'Det går inte att ta bort en full registrering här' },
      { status: 400 }
    )
  }

  const { error: deleteError } = await supabase
    .from('registrations')
    .delete()
    .eq('id', params.registrationId)

  if (deleteError) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  const { data: remainingRegistrations, error: remainingError } = await supabase
    .from('registrations')
    .select('id')
    .eq('player_id', registration.player_id)
    .limit(1)

  if (!remainingError && (remainingRegistrations?.length ?? 0) === 0) {
    await supabase
      .from('players')
      .delete()
      .eq('id', registration.player_id)
  }

  return NextResponse.json({ ok: true })
}