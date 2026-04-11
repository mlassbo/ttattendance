import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getAuthorizedReserveClass } from './reserve-auth'

export async function POST(
  req: NextRequest,
  { params }: { params: { classId: string } },
) {
  const { auth, supabase, errorResponse } = await getAuthorizedReserveClass(req, params.classId)
  if (errorResponse) {
    return errorResponse
  }

  if (!auth || !supabase) {
    return NextResponse.json({ error: 'Klassen hittades inte' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const requestedPlayerId = typeof body?.playerId === 'string' ? body.playerId : null
  const requestedName = typeof body?.name === 'string' ? body.name.trim() : ''
  const requestedClub = typeof body?.club === 'string' ? body.club.trim() : ''

  let playerId = requestedPlayerId
  let playerName = requestedName
  let playerClub: string | null = requestedClub || null

  if (playerId) {
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, name, club')
      .eq('id', playerId)
      .eq('competition_id', auth.competitionId)
      .maybeSingle()

    if (playerError || !player) {
      return NextResponse.json({ error: 'Spelaren hittades inte' }, { status: 404 })
    }

    playerName = player.name
    playerClub = player.club
  } else {
    if (!requestedName || !requestedClub) {
      return NextResponse.json({ error: 'Namn och klubb krävs' }, { status: 400 })
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        competition_id: auth.competitionId,
        name: requestedName,
        club: requestedClub,
      })
      .select('id, name, club')
      .single()

    if (playerError || !player) {
      return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
    }

    playerId = player.id
    playerName = player.name
    playerClub = player.club
  }

  const { count: existingCount, error: countError } = await supabase
    .from('registrations')
    .select('*', { count: 'exact', head: true })
    .eq('class_id', params.classId)
    .eq('status', 'reserve')

  if (countError) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  const position = (existingCount ?? 0) + 1
  const joinedAt = new Date().toISOString()

  const { error: insertError, data: createdRegistration } = await supabase
    .from('registrations')
    .insert({
      player_id: playerId,
      class_id: params.classId,
      status: 'reserve',
      reserve_joined_at: joinedAt,
    })
    .select('id')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'Spelaren är redan på listan eller är fullt registrerad i denna klass.' },
        { status: 409 }
      )
    }

    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  return NextResponse.json({
    entry: {
      registrationId: createdRegistration.id,
      position,
      name: playerName,
      club: playerClub,
      joinedAt,
    },
  })
}