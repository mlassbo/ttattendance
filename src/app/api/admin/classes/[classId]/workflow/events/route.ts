import { NextRequest, NextResponse } from 'next/server'
import { getScopedCompetitionAuth } from '@/lib/scoped-competition-auth'
import { isClassWorkflowEventKey } from '@/lib/class-workflow'
import { getAdminClassWorkflowPayload } from '@/lib/class-workflow-server'
import { createServerClient } from '@/lib/supabase'

export async function POST(
  req: NextRequest,
  { params }: { params: { classId: string } },
) {
  const auth = await getScopedCompetitionAuth(req)
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const eventKey = typeof body?.eventKey === 'string' ? body.eventKey : ''
  const note = typeof body?.note === 'string' ? body.note.trim() || null : null

  if (!isClassWorkflowEventKey(eventKey)) {
    return NextResponse.json({ error: 'Ogiltig händelse' }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    const payload = await getAdminClassWorkflowPayload(
      supabase,
      auth.competitionId,
      params.classId,
    )

    if (!payload) {
      return NextResponse.json({ error: 'Klassen hittades inte' }, { status: 404 })
    }

    if (eventKey === 'missing_players_callout' && !payload.workflow.canLogCallout) {
      return NextResponse.json(
        { error: 'Upprop kan bara markeras när deadline har passerat och spelare saknas' },
        { status: 409 },
      )
    }

    const { error } = await supabase.from('class_workflow_events').insert({
      class_id: params.classId,
      event_key: eventKey,
      note,
    })

    if (error) {
      return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
    }

    const updatedPayload = await getAdminClassWorkflowPayload(
      supabase,
      auth.competitionId,
      params.classId,
    )

    if (!updatedPayload) {
      return NextResponse.json({ error: 'Klassen hittades inte' }, { status: 404 })
    }

    return NextResponse.json(updatedPayload)
  } catch {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }
}