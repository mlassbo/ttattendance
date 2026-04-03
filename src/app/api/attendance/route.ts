import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCompetitionAuth } from '@/lib/auth'
import { getCompetitionDateRange } from '@/lib/competition-dates'
import {
  getAttendanceNotOpenMessage,
  getCompetitionAttendanceOpensAt,
} from '@/lib/attendance-window'

type CompetitionAuth = NonNullable<Awaited<ReturnType<typeof getCompetitionAuth>>>
type RegistrationRow = {
  id: string
  players: { competition_id: string } | null
  classes: { attendance_deadline: string } | null
}
type RelationValue<T> = T | T[] | null | undefined
type RawRegistrationRow = {
  id: unknown
  players?: RelationValue<{ competition_id: unknown }>
  classes?: RelationValue<{ attendance_deadline: unknown }>
}

function getSingleRelation<T>(value: RelationValue<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function normalizeRegistrationRow(registration: unknown): RegistrationRow | null {
  if (!registration || typeof registration !== 'object') {
    return null
  }

  const raw = registration as RawRegistrationRow
  if (typeof raw.id !== 'string') {
    return null
  }

  const player = getSingleRelation(raw.players)
  const cls = getSingleRelation(raw.classes)

  const competitionId =
    player && typeof player === 'object' && typeof player.competition_id === 'string'
      ? player.competition_id
      : null
  const attendanceDeadline =
    cls && typeof cls === 'object' && typeof cls.attendance_deadline === 'string'
      ? cls.attendance_deadline
      : null

  return {
    id: raw.id,
    players: competitionId ? { competition_id: competitionId } : null,
    classes: attendanceDeadline ? { attendance_deadline: attendanceDeadline } : null,
  }
}

async function getAuthorizedRegistration(
  auth: CompetitionAuth,
  registrationId: string,
  supabase: ReturnType<typeof createServerClient>
) {
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
    return {
      errorResponse: NextResponse.json({ error: 'Anmälan hittades inte' }, { status: 404 }),
      registration: null,
    }
  }

  const reg = normalizeRegistrationRow(registration)

  if (!reg) {
    return {
      errorResponse: NextResponse.json({ error: 'Anmälan hittades inte' }, { status: 404 }),
      registration: null,
    }
  }

  if (reg.players?.competition_id !== auth.competitionId) {
    return {
      errorResponse: NextResponse.json({ error: 'Anmälan hittades inte' }, { status: 404 }),
      registration: null,
    }
  }

  return { errorResponse: null, registration: reg }
}

async function enforcePlayerAttendanceWindow(
  auth: CompetitionAuth,
  registration: RegistrationRow,
  supabase: ReturnType<typeof createServerClient>
) {
  if (auth.role !== 'player') {
    return null
  }

  const { data: competition, error: competitionError } = await supabase
    .from('competitions')
    .select('id')
    .eq('id', auth.competitionId)
    .is('deleted_at', null)
    .single()

  if (competitionError || !competition) {
    return NextResponse.json({ error: 'Tävlingen hittades inte' }, { status: 404 })
  }

  const competitionDateRange = await getCompetitionDateRange(supabase, competition.id)
  if (!competitionDateRange.firstClassStart) {
    return NextResponse.json(
      {
        error: 'Tävlingsschemat är inte importerat än',
        code: 'competition_schedule_missing',
      },
      { status: 409 }
    )
  }

  const now = new Date()
  const attendanceOpensAt = getCompetitionAttendanceOpensAt(competitionDateRange.firstClassStart)
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

  const deadline = new Date(registration.classes?.attendance_deadline ?? 0)
  if (now.getTime() > deadline.getTime()) {
    return NextResponse.json(
      { error: 'Anmälningstiden har gått ut', code: 'deadline_passed' },
      { status: 409 }
    )
  }

  return null
}

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

  const { errorResponse, registration } = await getAuthorizedRegistration(
    auth,
    registrationId,
    supabase
  )
  if (errorResponse || !registration) {
    return errorResponse
  }

  const attendanceWindowError = await enforcePlayerAttendanceWindow(auth, registration, supabase)
  if (attendanceWindowError) {
    return attendanceWindowError
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

export async function DELETE(req: NextRequest) {
  const auth = await getCompetitionAuth(req.cookies)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { registrationId } = body

  if (!registrationId) {
    return NextResponse.json({ error: 'Ogiltiga uppgifter' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { errorResponse, registration } = await getAuthorizedRegistration(
    auth,
    registrationId,
    supabase
  )
  if (errorResponse || !registration) {
    return errorResponse
  }

  const attendanceWindowError = await enforcePlayerAttendanceWindow(auth, registration, supabase)
  if (attendanceWindowError) {
    return attendanceWindowError
  }

  const { error: deleteError } = await supabase
    .from('attendance')
    .delete()
    .eq('registration_id', registrationId)

  if (deleteError) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
