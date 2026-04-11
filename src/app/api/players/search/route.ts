import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCompetitionAuth } from '@/lib/auth'
import { buildReservePositionMap, type RegistrationStatus } from '@/lib/reserve-status'
import { buildDaySessionOrderMap } from '@/lib/session-order'

type ReservePositionRow = {
  id: string
  class_id: string
  status: RegistrationStatus
  reserve_joined_at: string | null
}

type SearchPlayerRow = {
  id: string
  name: string
  club: string | null
}

type SessionRow = {
  id: string
  name: string
  date: string
  session_order: number
}

type ClassRow = {
  id: string
  name: string
  start_time: string
  attendance_deadline: string
  sessions: SessionRow | null
}

type AttendanceRow = {
  status: 'confirmed' | 'absent'
  reported_at: string
}

type RegistrationRow = {
  id: string
  player_id: string
  class_id: string
  status: RegistrationStatus
  reserve_joined_at: string | null
  classes: ClassRow | null
  attendance: AttendanceRow | null
}

type SearchMode = 'player' | 'club'

// ── In-memory rate limiter ────────────────────────────────────────────────────
// Limits search requests per IP to protect the DB during peak event load.
// Module-level state persists across requests within the same server process.
// For this use-case (single-server, bounded number of competition devices) this
// is sufficient — a Redis-backed limiter is not needed.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 60 // 1 request/s sustained — generous for shared devices

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return false
  }
  if (entry.count >= RATE_MAX) return true
  entry.count++
  return false
}

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'För många förfrågningar' }, { status: 429 })
  }

  const auth = await getCompetitionAuth(req.cookies)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = req.nextUrl.searchParams.get('q') ?? ''
  const mode = req.nextUrl.searchParams.get('mode')

  if (mode !== 'player' && mode !== 'club') {
    return NextResponse.json({ error: 'Ogiltig söktyp' }, { status: 400 })
  }

  if (q.length < 2) {
    return NextResponse.json({ players: [] })
  }

  const supabase = createServerClient()

  // Uses search_players() so the planner can hit the idx_players_competition_lower_name
  // index (lower(name) LIKE lower($2) || '%'). A plain .ilike() call generates
  // "name ILIKE $1" which PostgreSQL cannot rewrite to use that index.
  const { data, error } = await supabase.rpc('search_players', {
    p_competition_id: auth.competitionId,
    p_query: q,
    p_mode: mode as SearchMode,
  })

  if (error) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  const players = (data ?? []) as SearchPlayerRow[]
  if (players.length === 0) {
    return NextResponse.json({ players: [] })
  }

  const { data: competitionSessions, error: competitionSessionsError } = await supabase
    .from('sessions')
    .select('id, date, session_order')
    .eq('competition_id', auth.competitionId)

  if (competitionSessionsError) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  const daySessionOrderById = buildDaySessionOrderMap(competitionSessions ?? [])

  const { data: registrations, error: registrationError } = await supabase
    .from('registrations')
    .select(`
      id,
      player_id,
      class_id,
      status,
      reserve_joined_at,
      classes (
        id,
        name,
        start_time,
        attendance_deadline,
        sessions (
          id,
          name,
          date,
          session_order
        )
      ),
      attendance (
        status,
        reported_at
      )
    `)
    .in('player_id', players.map(player => player.id))
    .limit(1000)

  if (registrationError) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  const registrationRows = (registrations ?? []) as unknown as RegistrationRow[]
  const classIds = Array.from(new Set(registrationRows.map(registration => registration.class_id)))
  const { data: reserveRegistrations, error: reserveError } = classIds.length === 0
    ? { data: [], error: null }
    : await supabase
      .from('registrations')
      .select('id, class_id, status, reserve_joined_at')
      .in('class_id', classIds)
      .eq('status', 'reserve')

  if (reserveError) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  const reservePositions = buildReservePositionMap(
    ((reserveRegistrations ?? []) as ReservePositionRow[]).map(registration => ({
      registrationId: registration.id,
      classId: registration.class_id,
      status: registration.status,
      reserveJoinedAt: registration.reserve_joined_at,
    }))
  )

  const registrationsByPlayer = new Map<string, RegistrationRow[]>()
  for (const registration of registrationRows) {
    const grouped = registrationsByPlayer.get(registration.player_id) ?? []
    grouped.push(registration)
    registrationsByPlayer.set(registration.player_id, grouped)
  }

  for (const grouped of Array.from(registrationsByPlayer.values())) {
    grouped.sort((left, right) => {
      const leftSessionOrder = left.classes?.sessions?.session_order ?? 0
      const rightSessionOrder = right.classes?.sessions?.session_order ?? 0

      if (leftSessionOrder !== rightSessionOrder) {
        return leftSessionOrder - rightSessionOrder
      }

      const leftStart = left.classes?.start_time ?? ''
      const rightStart = right.classes?.start_time ?? ''
      return leftStart.localeCompare(rightStart)
    })
  }

  return NextResponse.json({
    players: players.map(player => ({
      ...player,
      registrations: (registrationsByPlayer.get(player.id) ?? []).map(registration => ({
        registrationId: registration.id,
        status: registration.status,
        reservePosition: registration.status === 'reserve'
          ? (reservePositions.get(registration.id) ?? null)
          : null,
        class: {
          id: registration.classes?.id,
          name: registration.classes?.name,
          startTime: registration.classes?.start_time,
          attendanceDeadline: registration.classes?.attendance_deadline,
          session: registration.classes?.sessions
            ? {
                id: registration.classes.sessions.id,
                name: registration.classes.sessions.name,
                date: registration.classes.sessions.date,
                sessionOrder: registration.classes.sessions.session_order,
                daySessionOrder:
                  daySessionOrderById.get(registration.classes.sessions.id) ??
                  registration.classes.sessions.session_order,
              }
            : null,
        },
        attendance: registration.attendance
          ? {
              status: registration.attendance.status,
              reportedAt: registration.attendance.reported_at,
            }
          : null,
      })),
    })),
  })
}
