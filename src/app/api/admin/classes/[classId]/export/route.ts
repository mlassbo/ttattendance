import { NextRequest, NextResponse } from 'next/server'
import { getScopedCompetitionAuth } from '@/lib/scoped-competition-auth'
import { createServerClient } from '@/lib/supabase'
import { getAttendanceField } from '../../../lib'

export async function GET(
  req: NextRequest,
  { params }: { params: { classId: string } }
) {
  const auth = await getScopedCompetitionAuth(req)
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // Single JOIN query: fetch class and verify competition ownership via the session.
  const { data: cls, error: clsError } = await supabase
    .from('classes')
    .select('id, name, sessions!inner(competition_id)')
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

  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select(`
      id,
      players ( name, club ),
      attendance ( status, reported_at, reported_by )
    `)
    .eq('class_id', params.classId)

  if (regError) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((registrations ?? []) as any[])
    .map(r => ({
      name: r.players?.name ?? '',
      club: r.players?.club ?? '',
      status: getAttendanceField(r, 'status'),
      reportedAt: getAttendanceField(r, 'reported_at'),
      reportedBy: getAttendanceField(r, 'reported_by'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))

  const statusLabel = (s: string | null) => {
    if (s === 'confirmed') return 'Bekräftad'
    if (s === 'absent') return 'Frånvaro'
    return 'Ej rapporterat'
  }

  const reportedByLabel = (r: string | null) => {
    if (r === 'player') return 'Spelare'
    if (r === 'admin') return 'Admin'
    return ''
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  }

  const csvRows = [
    ['Namn', 'Klubb', 'Status', 'Rapporterad', 'Rapporterad av'].join(','),
    ...rows.map(r =>
      [
        `"${r.name.replace(/"/g, '""')}"`,
        `"${r.club.replace(/"/g, '""')}"`,
        statusLabel(r.status),
        formatTime(r.reportedAt),
        reportedByLabel(r.reportedBy),
      ].join(',')
    ),
  ].join('\r\n')

  const filename = `${cls.name.replace(/[^a-zA-Z0-9]/g, '_')}.csv`
  return new NextResponse(csvRows, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
