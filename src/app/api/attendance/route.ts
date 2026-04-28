import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import type { RegistrationStatus } from '@/lib/reserve-status'
import {
  getAttendanceNotOpenMessage,
  getClassAttendanceOpensAt,
} from '@/lib/attendance-window'

type RegistrationRow = {
  id: string
  status: RegistrationStatus
  classes: { start_time: string; attendance_deadline: string } | null
}
type RelationValue<T> = T | T[] | null | undefined
type RawRegistrationRow = {
  id: unknown
  status?: unknown
  classes?: RelationValue<{ start_time: unknown; attendance_deadline: unknown }>
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

  if (raw.status !== 'registered' && raw.status !== 'reserve') {
    return null
  }

  const cls = getSingleRelation(raw.classes)

  const classStartTime =
    cls && typeof cls === 'object' && typeof cls.start_time === 'string' ? cls.start_time : null
  const attendanceDeadline =
    cls && typeof cls === 'object' && typeof cls.attendance_deadline === 'string'
      ? cls.attendance_deadline
      : null

  return {
    id: raw.id,
    status: raw.status,
    classes:
      classStartTime && attendanceDeadline
        ? { start_time: classStartTime, attendance_deadline: attendanceDeadline }
        : null,
  }
}

async function loadReportableRegistration(
  registrationId: string,
  supabase: ReturnType<typeof createServerClient>
) {
  const { data: registration, error: regError } = await supabase
    .from('registrations')
    .select(`
      id,
      status,
      classes ( start_time, attendance_deadline )
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

  if (reg.status === 'reserve') {
    return {
      errorResponse: NextResponse.json(
        { error: 'Reservspelare kan inte anmäla närvaro i denna klass' },
        { status: 400 }
      ),
      registration: null,
    }
  }

  return { errorResponse: null, registration: reg }
}

function enforcePlayerAttendanceWindow(registration: RegistrationRow) {
  if (!registration.classes?.start_time || !registration.classes.attendance_deadline) {
    return NextResponse.json(
      {
        error: 'Tävlingsschemat är inte importerat än',
        code: 'competition_schedule_missing',
      },
      { status: 409 }
    )
  }

  const now = new Date()
  const attendanceOpensAt = getClassAttendanceOpensAt(registration.classes.start_time)
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

  const deadline = new Date(registration.classes.attendance_deadline)
  if (now.getTime() > deadline.getTime()) {
    return NextResponse.json(
      { error: 'Anmälningstiden har gått ut', code: 'deadline_passed' },
      { status: 409 }
    )
  }

  return null
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()

  const body = await req.json()
  const { registrationId, status, idempotencyKey } = body

  if (!registrationId || !status || !idempotencyKey) {
    return NextResponse.json({ error: 'Ogiltiga uppgifter' }, { status: 400 })
  }
  if (status !== 'confirmed' && status !== 'absent') {
    return NextResponse.json({ error: 'Ogiltigt status' }, { status: 400 })
  }

  const { errorResponse, registration } = await loadReportableRegistration(
    registrationId,
    supabase
  )
  if (errorResponse || !registration) {
    return errorResponse
  }

  const attendanceWindowError = enforcePlayerAttendanceWindow(registration)
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
        reported_by: 'player',
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
  const supabase = createServerClient()

  const body = await req.json()
  const { registrationId } = body

  if (!registrationId) {
    return NextResponse.json({ error: 'Ogiltiga uppgifter' }, { status: 400 })
  }

  const { errorResponse, registration } = await loadReportableRegistration(
    registrationId,
    supabase
  )
  if (errorResponse || !registration) {
    return errorResponse
  }

  const attendanceWindowError = enforcePlayerAttendanceWindow(registration)
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
