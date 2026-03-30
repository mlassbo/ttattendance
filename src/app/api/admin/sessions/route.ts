import { NextRequest, NextResponse } from 'next/server'
import { getCompetitionAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { getAttendanceField } from '../lib'

export async function GET(req: NextRequest) {
  const auth = await getCompetitionAuth(req.cookies)
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // Step 1 — sessions + their classes (2-level nesting, reliable).
  const { data: sessionData, error: sessError } = await supabase
    .from('sessions')
    .select('id, name, date, session_order, classes(id, name, start_time, attendance_deadline)')
    .eq('competition_id', auth.competitionId)
    .order('session_order')

  if (sessError) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions = (sessionData as any[]) ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const classIds = sessions.flatMap(s => (s.classes as any[]).map((c: any) => c.id))

  if (classIds.length === 0) {
    return NextResponse.json({ sessions: [] })
  }

  // Step 2 — registrations + attendance for all classes (2-level nesting).
  // Doing this as a separate query avoids the 4-level nesting
  // (sessions→classes→registrations→attendance) which Supabase JS does not
  // always handle reliably.
  const { data: regData, error: regError } = await supabase
    .from('registrations')
    .select('id, class_id, attendance(status)')
    .in('class_id', classIds)

  if (regError) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  // Index registrations by class_id for O(1) lookup.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const regsByClass = new Map<string, any[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const reg of (regData as any[]) ?? []) {
    const list = regsByClass.get(reg.class_id) ?? []
    list.push(reg)
    regsByClass.set(reg.class_id, list)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = sessions.map((session: any) => ({
    id: session.id,
    name: session.name,
    date: session.date,
    sessionOrder: session.session_order,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    classes: (session.classes as any[])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => a.start_time.localeCompare(b.start_time))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((cls: any) => {
        const regs = regsByClass.get(cls.id) ?? []
        const confirmed  = regs.filter(r => getAttendanceField(r, 'status') === 'confirmed').length
        const absent     = regs.filter(r => getAttendanceField(r, 'status') === 'absent').length
        const noResponse = regs.filter(r => !getAttendanceField(r, 'status')).length
        return {
          id: cls.id,
          name: cls.name,
          startTime: cls.start_time,
          attendanceDeadline: cls.attendance_deadline,
          counts: { confirmed, absent, noResponse, total: regs.length },
        }
      }),
  }))

  return NextResponse.json({ sessions: result })
}
