import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(
  _request: Request,
  { params }: { params: { competitionId: string } },
) {
  const supabase = createServerClient()

  const { data: competition } = await supabase
    .from('competitions')
    .select('id')
    .eq('id', params.competitionId)
    .is('deleted_at', null)
    .single()

  if (!competition) {
    return NextResponse.json({ error: 'Tävlingen hittades inte' }, { status: 404 })
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, name, date, session_order')
    .eq('competition_id', params.competitionId)
    .order('date', { ascending: true })
    .order('session_order', { ascending: true })

  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 500 })
  }

  if (!sessions || sessions.length === 0) {
    return NextResponse.json([])
  }

  const sessionIds = sessions.map(s => s.id)

  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .select('id, session_id, name, start_time, attendance_deadline')
    .in('session_id', sessionIds)
    .order('start_time', { ascending: true })

  if (classesError) {
    return NextResponse.json({ error: classesError.message }, { status: 500 })
  }

  const result = sessions.map(session => ({
    id: session.id,
    name: session.name,
    date: session.date,
    sessionOrder: session.session_order,
    classes: (classes ?? [])
      .filter(c => c.session_id === session.id)
      .map(c => ({
        id: c.id,
        name: c.name,
        startTime: c.start_time,
        attendanceDeadline: c.attendance_deadline,
      })),
  }))

  return NextResponse.json(result)
}
