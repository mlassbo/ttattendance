import { NextRequest, NextResponse } from 'next/server'
import { getCompetitionAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { getAttendanceField } from '../../../lib'

export async function GET(
  req: NextRequest,
  { params }: { params: { classId: string } }
) {
  const auth = await getCompetitionAuth(req.cookies)
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // Single JOIN query: fetch class and verify competition ownership via the session.
  const { data: cls, error: clsError } = await supabase
    .from('classes')
    .select('id, name, start_time, attendance_deadline, sessions!inner(competition_id)')
    .eq('id', params.classId)
    .single()

  if (clsError || !cls) {
    return NextResponse.json({ error: 'Klassen hittades inte' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sess = cls.sessions as any
  const ownerCompId: string | undefined = Array.isArray(sess) ? sess[0]?.competition_id : sess?.competition_id
  if (ownerCompId !== auth.competitionId) {
    return NextResponse.json({ error: 'Klassen hittades inte' }, { status: 404 })
  }

  // Fetch all registrations for this class with player info and attendance.
  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select(`
      id,
      players ( id, name, club ),
      attendance ( status, reported_at, reported_by )
    `)
    .eq('class_id', params.classId)

  if (regError) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const players = ((registrations ?? []) as any[])
    .map(r => ({
      registrationId: r.id,
      playerId: r.players?.id ?? null,
      name: r.players?.name ?? '',
      club: r.players?.club ?? null,
      status: getAttendanceField(r, 'status'),
      reportedAt: getAttendanceField(r, 'reported_at'),
      reportedBy: getAttendanceField(r, 'reported_by'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))

  return NextResponse.json({
    class: {
      id: cls.id,
      name: cls.name,
      startTime: cls.start_time,
      attendanceDeadline: cls.attendance_deadline,
    },
    players,
  })
}
