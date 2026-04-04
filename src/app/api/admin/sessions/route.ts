import { NextRequest, NextResponse } from 'next/server'
import { getScopedCompetitionAuth } from '@/lib/scoped-competition-auth'
import { getClassWorkflowSummaryMap } from '@/lib/class-workflow-server'
import { getClassWorkflowActionHelper } from '@/lib/class-workflow'
import { createServerClient } from '@/lib/supabase'
import { getAttendanceField } from '../lib'

export async function GET(req: NextRequest) {
  const auth = await getScopedCompetitionAuth(req)
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  try {
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

    const classSummaries = sessions.flatMap(session =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((session.classes as any[]) ?? []).map((cls: any) => ({
        id: cls.id as string,
        name: cls.name as string,
        startTime: cls.start_time as string,
        attendanceDeadline: cls.attendance_deadline as string,
      })),
    )

    const classIds = classSummaries.map(classRow => classRow.id)

    if (classIds.length === 0) {
      return NextResponse.json({ sessions: [] })
    }

    // Step 2 — registrations + attendance for all classes (2-level nesting).
    // Doing this as a separate query avoids the 4-level nesting
    // (sessions→classes→registrations→attendance) which Supabase JS does not
    // always handle reliably.
    const { data: regData, error: regError } = await supabase
      .from('registrations')
      .select('id, class_id, players(name, club), attendance(status)')
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

    const workflowByClassId = await getClassWorkflowSummaryMap(
      supabase,
      classSummaries.map(classRow => {
        const regs = regsByClass.get(classRow.id) ?? []
        const confirmed = regs.filter(r => getAttendanceField(r, 'status') === 'confirmed').length
        const absent = regs.filter(r => getAttendanceField(r, 'status') === 'absent').length
        const noResponse = regs.filter(r => !getAttendanceField(r, 'status')).length

        return {
          ...classRow,
          counts: {
            confirmed,
            absent,
            noResponse,
            total: regs.length,
          },
        }
      }),
      new Date(),
      { includeLastCalloutAt: false },
    )

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
          const confirmed = regs.filter(r => getAttendanceField(r, 'status') === 'confirmed').length
          const absent = regs.filter(r => getAttendanceField(r, 'status') === 'absent').length
          const noResponse = regs.filter(r => !getAttendanceField(r, 'status')).length
          const missingPlayers = regs
            .filter(r => !getAttendanceField(r, 'status'))
            .map(r => {
              const playerName = r.players?.name ?? ''
              const clubName = r.players?.club ?? ''
              return clubName ? `${playerName} (${clubName})` : playerName
            })
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right, 'sv'))
          const workflow = workflowByClassId.get(cls.id)

          return {
            id: cls.id,
            name: cls.name,
            startTime: cls.start_time,
            attendanceDeadline: cls.attendance_deadline,
            counts: { confirmed, absent, noResponse, total: regs.length },
            workflow: workflow
              ? {
                  currentPhaseKey: workflow.currentPhaseKey,
                  currentPhaseLabel: workflow.currentPhaseLabel,
                  nextActionKey: workflow.nextAction?.key ?? null,
                  nextActionLabel: workflow.nextAction?.label ?? null,
                  nextActionHelper: workflow.nextAction
                    ? getClassWorkflowActionHelper(workflow.nextAction.key)
                    : null,
                  followUpActionLabel: workflow.followUpAction?.label ?? null,
                  lastCalloutAt: workflow.attendance.lastCalloutAt,
                  missingPlayers,
                }
              : {
                  currentPhaseKey: null,
                  currentPhaseLabel: null,
                  nextActionKey: null,
                  nextActionLabel: null,
                  nextActionHelper: null,
                  followUpActionLabel: null,
                  lastCalloutAt: null,
                  missingPlayers,
                },
          }
        }),
    }))

    return NextResponse.json({ sessions: result })
  } catch {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }
}
