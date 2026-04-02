import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCompetitionAuth } from '@/lib/auth'
import {
  getAttendanceNotOpenMessage,
  getCompetitionAttendanceOpensAt,
} from '@/lib/attendance-window'

export async function POST(req: NextRequest) {
  const auth = await getCompetitionAuth(req.cookies)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { registrationId, status, idempotencyKey } = body

  if (!registrationId || !status || !idempotencyKey) {
    return NextResponse.json({ error: 'Ogiltiga uppgifter' }, { status: 400 })
  }
  if (status !== 'confirmed' && status !== 'absent') {
    return NextResponse.json({ error: 'Ogiltigt status' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Verify the registration belongs to the competition in the cookie,
  // and fetch the class deadline in one query.
  const { data: registration, error: regError } = await supabase
    .from('registrations')
    .select(`
      id,
      players ( competition_id ),
      classes ( attendance_deadline )
    `)
    .eq('id', registrationId)
    .single()

  if (regError || !registration) {
    return NextResponse.json({ error: 'Anmälan hittades inte' }, { status: 404 })
  }

  type RegistrationRow = typeof registration & {
    players: { competition_id: string } | null
    classes: { attendance_deadline: string } | null
  }
  const reg = registration as RegistrationRow

  if (reg.players?.competition_id !== auth.competitionId) {
    return NextResponse.json({ error: 'Anmälan hittades inte' }, { status: 404 })
  }

  // Enforce deadline for player role; admin bypasses.
  if (auth.role === 'player') {
    const { data: competition, error: competitionError } = await supabase
      .from('competitions')
      .select('start_date')
      .eq('id', auth.competitionId)
      .is('deleted_at', null)
      .single()

    if (competitionError || !competition) {
      return NextResponse.json({ error: 'Tävlingen hittades inte' }, { status: 404 })
    }

    const now = new Date()
    const attendanceOpensAt = getCompetitionAttendanceOpensAt(competition.start_date)
    if (now.getTime() < attendanceOpensAt.getTime()) {
      return NextResponse.json(
        {
          error: getAttendanceNotOpenMessage(attendanceOpensAt),
          code: 'attendance_not_open',
          opensAt: attendanceOpensAt.toISOString(),
        },
        { status: 409 }
      )
    }

    const deadline = new Date(reg.classes?.attendance_deadline ?? 0)
    if (now.getTime() > deadline.getTime()) {
      return NextResponse.json(
        { error: 'Anmälningstiden har gått ut', code: 'deadline_passed' },
        { status: 409 }
      )
    }
  }

  // Upsert: last write wins on registration_id.
  // The unique(idempotency_key) constraint guards against exact duplicate requests.
  const { error: upsertError } = await supabase
    .from('attendance')
    .upsert(
      {
        registration_id: registrationId,
        status,
        reported_at: new Date().toISOString(),
        reported_by: auth.role,
        idempotency_key: idempotencyKey,
      },
      { onConflict: 'registration_id' }
    )

  if (upsertError) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
