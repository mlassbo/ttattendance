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

export async function GET(
  req: NextRequest,
  { params }: { params: { playerId: string } }
) {
  const auth = await getCompetitionAuth(req.cookies)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // Verify the player belongs to the competition in the cookie.
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id, name, club')
    .eq('id', params.playerId)
    .eq('competition_id', auth.competitionId)
    .single()

  if (playerError || !player) {
    return NextResponse.json({ error: 'Spelaren hittades inte' }, { status: 404 })
  }

  const { data: competitionSessions, error: competitionSessionsError } = await supabase
    .from('sessions')
    .select('id, date, session_order')
    .eq('competition_id', auth.competitionId)

  if (competitionSessionsError) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  const daySessionOrderById = buildDaySessionOrderMap(competitionSessions ?? [])

  // Fetch registrations with class, session, and current attendance.
  // attendance has unique(registration_id) so Supabase returns it as an array
  // with 0 or 1 elements (reverse FK relationship).
  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select(`
      id,
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
    .eq('player_id', params.playerId)
    .limit(500)

  if (regError) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  type SessionRow = { id: string; name: string; date: string; session_order: number }
  type ClassRow = { id: string; name: string; start_time: string; attendance_deadline: string; sessions: SessionRow | null }
  type AttRow = { status: string; reported_at: string }
  // PostgREST detects the unique(registration_id) constraint and returns
  // attendance as a single object or null, not an array.
  type RegRow = {
    id: string
    class_id: string
    status: RegistrationStatus
    reserve_joined_at: string | null
    classes: ClassRow | null
    attendance: AttRow | null
  }

  const registrationRows = (registrations ?? []) as unknown as RegRow[]
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

  // Sort by session_order, then class start_time.
  const sorted = registrationRows.sort((a, b) => {
    const aOrder = a.classes?.sessions?.session_order ?? 0
    const bOrder = b.classes?.sessions?.session_order ?? 0
    if (aOrder !== bOrder) return aOrder - bOrder
    const aTime = a.classes?.start_time ?? ''
    const bTime = b.classes?.start_time ?? ''
    return aTime < bTime ? -1 : aTime > bTime ? 1 : 0
  })

  return NextResponse.json({
    player,
    registrations: sorted.map(r => {
      const cls = r.classes
      const session = cls?.sessions
      const att = r.attendance
      return {
        registrationId: r.id,
        status: r.status,
        reservePosition: r.status === 'reserve' ? (reservePositions.get(r.id) ?? null) : null,
        class: {
          id: cls?.id,
          name: cls?.name,
          startTime: cls?.start_time,
          attendanceDeadline: cls?.attendance_deadline,
          session: {
            id: session?.id,
            name: session?.name,
            date: session?.date,
            sessionOrder: session?.session_order,
            daySessionOrder: session?.id
              ? (daySessionOrderById.get(session.id) ?? session.session_order)
              : undefined,
          },
        },
        attendance: att
          ? { status: att.status, reportedAt: att.reported_at }
          : null,
      }
    }),
  })
}
