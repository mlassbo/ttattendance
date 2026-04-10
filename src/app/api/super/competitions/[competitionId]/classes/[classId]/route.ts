import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function PATCH(
  request: Request,
  { params }: { params: { competitionId: string; classId: string } },
) {
  const supabase = createServerClient()

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Ogiltig begäran' }, { status: 400 })
  }

  const { attendanceDeadline, sessionId } = body as {
    attendanceDeadline?: string
    sessionId?: string
  }

  if (!attendanceDeadline && !sessionId) {
    return NextResponse.json(
      { error: 'Minst ett fält måste skickas (attendanceDeadline eller sessionId)' },
      { status: 400 },
    )
  }

  // Load the class and verify it belongs to this competition
  const { data: classRow, error: classError } = await supabase
    .from('classes')
    .select('id, session_id, name, start_time, attendance_deadline, sessions!inner(competition_id)')
    .eq('id', params.classId)
    .single()

  if (classError || !classRow) {
    return NextResponse.json({ error: 'Klassen hittades inte' }, { status: 404 })
  }

  const session = classRow.sessions as unknown as { competition_id: string }
  if (session.competition_id !== params.competitionId) {
    return NextResponse.json({ error: 'Klassen tillhör inte denna tävling' }, { status: 404 })
  }

  const updates: Record<string, string> = {}

  if (attendanceDeadline) {
    const deadline = new Date(attendanceDeadline)
    if (isNaN(deadline.getTime())) {
      return NextResponse.json({ error: 'Ogiltigt datumformat för anmälningsstopp' }, { status: 400 })
    }

    const startTime = new Date(classRow.start_time)
    if (deadline >= startTime) {
      return NextResponse.json(
        { error: 'Anmälningsstopp måste vara före klassens starttid' },
        { status: 400 },
      )
    }

    updates.attendance_deadline = deadline.toISOString()
  }

  if (sessionId) {
    // Verify the session belongs to the same competition
    const { data: targetSession, error: sessionError } = await supabase
      .from('sessions')
      .select('id, competition_id')
      .eq('id', sessionId)
      .single()

    if (sessionError || !targetSession) {
      return NextResponse.json({ error: 'Passet hittades inte' }, { status: 400 })
    }

    if (targetSession.competition_id !== params.competitionId) {
      return NextResponse.json({ error: 'Passet tillhör inte denna tävling' }, { status: 400 })
    }

    updates.session_id = sessionId
  }

  const { data: updated, error: updateError } = await supabase
    .from('classes')
    .update(updates)
    .eq('id', params.classId)
    .select('id, session_id, name, start_time, attendance_deadline')
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    id: updated.id,
    sessionId: updated.session_id,
    name: updated.name,
    startTime: updated.start_time,
    attendanceDeadline: updated.attendance_deadline,
  })
}
