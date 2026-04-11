import { NextRequest, NextResponse } from 'next/server'
import { getScopedCompetitionAuth } from '@/lib/scoped-competition-auth'
import { createServerClient } from '@/lib/supabase'

type SearchClubRow = {
  club: string | null
}

function normalizeClubName(value: string) {
  return value.trim().toLocaleLowerCase('sv')
}

function collectUniqueClubs(rows: SearchClubRow[]) {
  const clubsByNormalizedName = new Map<string, string>()

  for (const row of rows) {
    const club = row.club?.trim()
    if (!club) {
      continue
    }

    const normalizedClub = normalizeClubName(club)
    if (!clubsByNormalizedName.has(normalizedClub)) {
      clubsByNormalizedName.set(normalizedClub, club)
    }
  }

  return Array.from(clubsByNormalizedName.values())
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
    return NextResponse.json({ clubs: [] })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase.rpc('search_players', {
    p_competition_id: auth.competitionId,
    p_query: query,
    p_mode: 'club',
  })

  if (error) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  let clubs = collectUniqueClubs((data ?? []) as SearchClubRow[])

  if (clubs.length === 0) {
    const { data: fallbackClubs, error: fallbackError } = await supabase
      .from('players')
      .select('club')
      .eq('competition_id', auth.competitionId)
      .not('club', 'is', null)
      .ilike('club', `%${query}%`)
      .limit(20)

    if (fallbackError) {
      return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
    }

    clubs = collectUniqueClubs((fallbackClubs ?? []) as SearchClubRow[])
  }

  return NextResponse.json({
    clubs: clubs
      .sort((left, right) => left.localeCompare(right, 'sv'))
      .slice(0, 8),
  })
}