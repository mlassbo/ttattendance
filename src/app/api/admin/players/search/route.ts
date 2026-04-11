import { NextRequest, NextResponse } from 'next/server'
import { getScopedCompetitionAuth } from '@/lib/scoped-competition-auth'
import { createServerClient } from '@/lib/supabase'

type SearchPlayerRow = {
  id: string
  name: string
  club: string | null
}

type RelationValue<T> = T | T[] | null | undefined

function getSingleRelation<T>(value: RelationValue<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

export async function GET(req: NextRequest) {
  const auth = await getScopedCompetitionAuth(req)
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const query = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const requestedCompetitionId = req.nextUrl.searchParams.get('competitionId')?.trim()

  if (requestedCompetitionId && requestedCompetitionId !== auth.competitionId) {
    return NextResponse.json({ error: 'Ogiltig tävling' }, { status: 400 })
  }

  if (query.length < 2) {
    return NextResponse.json({ players: [] })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase.rpc('search_players', {
    p_competition_id: auth.competitionId,
    p_query: query,
    p_mode: 'player',
  })

  if (error) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  let players = ((data ?? []) as SearchPlayerRow[])
    .sort((left, right) => left.name.localeCompare(right.name, 'sv'))
    .slice(0, 10)

  if (players.length === 0) {
    const { data: fallbackPlayers, error: fallbackError } = await supabase
      .from('players')
      .select('id, name, club')
      .eq('competition_id', auth.competitionId)
      .ilike('name', `%${query}%`)
      .limit(10)

    if (fallbackError) {
      return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
    }

    players = ((fallbackPlayers ?? []) as SearchPlayerRow[])
      .sort((left, right) => left.name.localeCompare(right.name, 'sv'))
      .slice(0, 10)
  }

  if (players.length === 0) {
    return NextResponse.json({ players: [] })
  }

  const { data: registrations, error: registrationError } = await supabase
    .from('registrations')
    .select('player_id, classes(name)')
    .in('player_id', players.map(player => player.id))

  if (registrationError) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  const classNamesByPlayerId = new Map<string, string[]>()
  for (const registration of (registrations ?? []) as Array<{
    player_id: string
    classes: RelationValue<{ name: string }>
  }>) {
    const cls = getSingleRelation(registration.classes)
    if (!cls?.name) {
      continue
    }

    const classNames = classNamesByPlayerId.get(registration.player_id) ?? []
    classNames.push(cls.name)
    classNamesByPlayerId.set(registration.player_id, classNames)
  }

  return NextResponse.json({
    players: players.map(player => ({
      id: player.id,
      name: player.name,
      club: player.club,
      classNames: Array.from(new Set(classNamesByPlayerId.get(player.id) ?? []))
        .sort((left, right) => left.localeCompare(right, 'sv')),
    })),
  })
}