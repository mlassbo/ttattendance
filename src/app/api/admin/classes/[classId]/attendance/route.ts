import { NextRequest, NextResponse } from 'next/server'
import { getScopedCompetitionAuth } from '@/lib/scoped-competition-auth'
import { getAuthorizedAdminClass } from '@/lib/class-workflow-server'
import { buildReserveListEntries, type RegistrationStatus } from '@/lib/reserve-status'
import { createServerClient } from '@/lib/supabase'
import { getAttendanceField } from '../../../lib'

async function getAuthorizedClass(req: NextRequest, classId: string) {
  const auth = await getScopedCompetitionAuth(req)
  if (!auth || auth.role !== 'admin') {
    return {
      auth: null,
      supabase: null,
      cls: null,
      errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const supabase = createServerClient()
  const cls = await getAuthorizedAdminClass(supabase, auth.competitionId, classId)

  if (!cls) {
    return {
      auth,
      supabase,
      cls: null,
      errorResponse: NextResponse.json({ error: 'Klassen hittades inte' }, { status: 404 }),
    }
  }

  return {
    auth,
    supabase,
    cls,
    errorResponse: null,
  }
}

async function getAuthorizedRegistration(
  supabase: ReturnType<typeof createServerClient>,
  classId: string,
  registrationId: string
) {
  const { data: registration, error } = await supabase
    .from('registrations')
    .select('id, status')
    .eq('id', registrationId)
    .eq('class_id', classId)
    .maybeSingle()

  if (error || !registration) {
    return {
      errorResponse: NextResponse.json({ error: 'Anmälan hittades inte' }, { status: 404 }),
      registration: null,
    }
  }

  return {
    errorResponse: null,
    registration: registration as { id: string; status: RegistrationStatus },
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { classId: string } }
) {
  const { supabase, cls, errorResponse } = await getAuthorizedClass(req, params.classId)
  if (errorResponse) {
    return errorResponse
  }
  if (!supabase || !cls) {
    return NextResponse.json({ error: 'Klassen hittades inte' }, { status: 404 })
  }

  // Fetch all registrations for this class with player info and attendance.
  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select(`
      id,
      class_id,
      status,
      reserve_joined_at,
      players ( id, name, club ),
      attendance ( status, reported_at, reported_by )
    `)
    .eq('class_id', params.classId)

  if (regError) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((registrations ?? []) as any[])
    .map(r => ({
      registrationId: r.id,
      classId: r.class_id as string,
      registrationStatus: (r.status ?? 'registered') as RegistrationStatus,
      reserveJoinedAt: r.reserve_joined_at ?? null,
      playerId: r.players?.id ?? null,
      name: r.players?.name ?? '',
      club: r.players?.club ?? null,
      status: getAttendanceField(r, 'status'),
      reportedAt: getAttendanceField(r, 'reported_at'),
      reportedBy: getAttendanceField(r, 'reported_by'),
    }))
  const players = rows
    .filter(row => row.registrationStatus === 'registered')
    .map(r => ({
      registrationId: r.registrationId,
      playerId: r.playerId,
      name: r.name,
      club: r.club,
      status: r.status,
      reportedAt: r.reportedAt,
      reportedBy: r.reportedBy,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  const reserveList = buildReserveListEntries(
    rows.map(row => ({
      registrationId: row.registrationId,
      classId: row.classId,
      status: row.registrationStatus,
      reserveJoinedAt: row.reserveJoinedAt,
      name: row.name,
      club: row.club,
    }))
  )

  return NextResponse.json({
    class: {
      id: cls.id,
      name: cls.name,
      startTime: cls.startTime,
      attendanceDeadline: cls.attendanceDeadline,
    },
    players,
    reserveList,
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { classId: string } }
) {
  const { supabase, errorResponse } = await getAuthorizedClass(req, params.classId)
  if (errorResponse) {
    return errorResponse
  }
  if (!supabase) {
    return NextResponse.json({ error: 'Klassen hittades inte' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const registrationId = body?.registrationId
  const status = body?.status
  const idempotencyKey = body?.idempotencyKey

  if (
    typeof registrationId !== 'string' ||
    (status !== 'confirmed' && status !== 'absent') ||
    typeof idempotencyKey !== 'string'
  ) {
    return NextResponse.json({ error: 'Ogiltiga uppgifter' }, { status: 400 })
  }

  const { errorResponse: registrationError, registration } = await getAuthorizedRegistration(
    supabase,
    params.classId,
    registrationId
  )
  if (registrationError) {
    return registrationError
  }

  if (registration?.status === 'reserve') {
    return NextResponse.json(
      { error: 'Reservspelare kan inte närvarorapporteras' },
      { status: 400 }
    )
  }

  const { error: upsertError } = await supabase
    .from('attendance')
    .upsert(
      {
        registration_id: registrationId,
        status,
        reported_at: new Date().toISOString(),
        reported_by: 'admin',
        idempotency_key: idempotencyKey,
      },
      { onConflict: 'registration_id' }
    )

  if (upsertError) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { classId: string } }
) {
  const { supabase, errorResponse } = await getAuthorizedClass(req, params.classId)
  if (errorResponse) {
    return errorResponse
  }
  if (!supabase) {
    return NextResponse.json({ error: 'Klassen hittades inte' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const registrationId = body?.registrationId

  if (typeof registrationId !== 'string') {
    return NextResponse.json({ error: 'Ogiltiga uppgifter' }, { status: 400 })
  }

  const { errorResponse: registrationError, registration } = await getAuthorizedRegistration(
    supabase,
    params.classId,
    registrationId
  )
  if (registrationError) {
    return registrationError
  }

  if (registration?.status === 'reserve') {
    return NextResponse.json(
      { error: 'Reservspelare kan inte närvarorapporteras' },
      { status: 400 }
    )
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
