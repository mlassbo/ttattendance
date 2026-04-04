import { NextRequest, NextResponse } from 'next/server'
import { getScopedCompetitionAuth } from '@/lib/scoped-competition-auth'
import {
  buildClassWorkflowResetPlan,
  getConflictingActiveWorkflowStepKey,
  getClassWorkflowActionLabel,
  isClassWorkflowStepKey,
  isClassWorkflowStepStatus,
} from '@/lib/class-workflow'
import { getAdminClassWorkflowPayload } from '@/lib/class-workflow-server'
import { createServerClient } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { classId: string; stepKey: string } },
) {
  const auth = await getScopedCompetitionAuth(req)
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isClassWorkflowStepKey(params.stepKey)) {
    return NextResponse.json({ error: 'Steget hittades inte' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const nextStatus = typeof body?.status === 'string' ? body.status : ''
  const noteWasProvided = typeof body?.note === 'string'
  const nextNote = noteWasProvided ? body.note.trim() || null : null

  if (!isClassWorkflowStepStatus(nextStatus)) {
    return NextResponse.json({ error: 'Ogiltig status' }, { status: 400 })
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

    const step = payload.workflow.steps.find(candidate => candidate.key === params.stepKey)
    if (!step) {
      return NextResponse.json({ error: 'Steget hittades inte' }, { status: 404 })
    }

    if (nextStatus === 'not_started') {
      const resetAt = new Date().toISOString()
      const resetRows = buildClassWorkflowResetPlan(params.stepKey).map(resetStep => ({
        class_id: params.classId,
        step_key: resetStep.key,
        status: resetStep.status,
        note: null,
        updated_at: resetAt,
      }))

      const { error } = await supabase
        .from('class_workflow_steps')
        .upsert(resetRows, { onConflict: 'class_id,step_key' })

      if (error) {
        return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
      }
    } else {
      if (nextStatus === 'active') {
        if (step.derivedState !== 'ready' && step.status !== 'active') {
          return NextResponse.json({ error: 'Steget är blockerat' }, { status: 409 })
        }

        const conflictingStepKey = getConflictingActiveWorkflowStepKey(payload.workflow.steps, params.stepKey)
        if (conflictingStepKey) {
          return NextResponse.json(
            {
              error: `${getClassWorkflowActionLabel(conflictingStepKey)} pågår redan`,
            },
            { status: 409 },
          )
        }
      }

      if (nextStatus === 'done' && step.derivedState !== 'ready' && step.derivedState !== 'active' && step.status !== 'done') {
        return NextResponse.json({ error: 'Steget kan inte markeras klart ännu' }, { status: 409 })
      }

      if (nextStatus === 'skipped') {
        if (!step.canSkip) {
          return NextResponse.json({ error: 'Steget kan inte hoppas över' }, { status: 409 })
        }

        if (step.derivedState !== 'ready' && step.status !== 'skipped') {
          return NextResponse.json({ error: 'Steget kan inte hoppas över ännu' }, { status: 409 })
        }
      }

      if (
        (step.status === 'skipped' && nextStatus === 'done')
        || (step.status === 'done' && nextStatus === 'skipped')
      ) {
        return NextResponse.json(
          { error: 'Nollställ steget först om du vill byta status' },
          { status: 409 },
        )
      }

      const { error } = await supabase
        .from('class_workflow_steps')
        .upsert(
          {
            class_id: params.classId,
            step_key: params.stepKey,
            status: nextStatus,
            note: noteWasProvided ? nextNote : step.note,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'class_id,step_key' },
        )

      if (error) {
        return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
      }
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