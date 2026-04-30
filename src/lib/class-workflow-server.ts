import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildClassWorkflowSummary,
  type ClassWorkflowAttendanceCounts,
  type ClassWorkflowStepKey,
  type ClassWorkflowStepRecord,
  type ClassWorkflowSummary,
} from './class-workflow'

type AdminClassRow = {
  id: string
  name: string
  start_time: string
  attendance_deadline: string
  has_a_playoff: boolean
  has_b_playoff: boolean
  sessions: { competition_id: string } | Array<{ competition_id: string }> | null
}

type AdminClassDescriptor = {
  id: string
  name: string
  startTime: string
  attendanceDeadline: string
  hasAPlayoff: boolean
  hasBPlayoff: boolean
}

type ClassWorkflowStepRow = {
  class_id: string
  step_key: ClassWorkflowStepKey
  status: ClassWorkflowStepRecord['status']
  note: string | null
  updated_at: string
}

type ClassWorkflowEventRow = {
  class_id: string
  created_at: string
}

type RegistrationAttendanceRow = {
  class_id: string
  attendance: { status?: string | null } | Array<{ status?: string | null }> | null
}

type ClassWorkflowClassInput = AdminClassDescriptor & {
  counts: ClassWorkflowAttendanceCounts
}

type GetClassWorkflowSummaryOptions = {
  includeLastCalloutAt?: boolean
}

function getOwnerCompetitionId(classRow: AdminClassRow) {
  const session = classRow.sessions
  if (Array.isArray(session)) {
    return session[0]?.competition_id ?? null
  }

  return session?.competition_id ?? null
}

function getAttendanceStatus(
  attendance: RegistrationAttendanceRow['attendance'],
) {
  if (!attendance) {
    return null
  }

  if (Array.isArray(attendance)) {
    return attendance[0]?.status ?? null
  }

  return attendance.status ?? null
}

function toAdminClassDescriptor(classRow: AdminClassRow): AdminClassDescriptor {
  return {
    id: classRow.id,
    name: classRow.name,
    startTime: classRow.start_time,
    attendanceDeadline: classRow.attendance_deadline,
    hasAPlayoff: classRow.has_a_playoff,
    hasBPlayoff: classRow.has_b_playoff,
  }
}

export async function getAuthorizedAdminClass(
  supabase: SupabaseClient,
  competitionId: string,
  classId: string,
) {
  const { data, error } = await supabase
    .from('classes')
    .select('id, name, start_time, attendance_deadline, has_a_playoff, has_b_playoff, sessions!inner(competition_id)')
    .eq('id', classId)
    .single()

  const classRow = (data ?? null) as AdminClassRow | null
  if (error || !classRow) {
    return null
  }

  if (getOwnerCompetitionId(classRow) !== competitionId) {
    return null
  }

  return toAdminClassDescriptor(classRow)
}

export async function getClassAttendanceCountsByIds(
  supabase: SupabaseClient,
  classIds: string[],
) {
  const countsByClassId = new Map<string, ClassWorkflowAttendanceCounts>()

  for (const classId of classIds) {
    countsByClassId.set(classId, {
      confirmed: 0,
      absent: 0,
      noResponse: 0,
      total: 0,
    })
  }

  if (classIds.length === 0) {
    return countsByClassId
  }

  const { data, error } = await supabase
    .from('registrations')
    .select('class_id, attendance(status)')
    .in('class_id', classIds)
    .eq('status', 'registered')

  if (error) {
    throw new Error(error.message)
  }

  for (const row of ((data ?? []) as RegistrationAttendanceRow[])) {
    const counts = countsByClassId.get(row.class_id)
    if (!counts) {
      continue
    }

    const status = getAttendanceStatus(row.attendance)
    counts.total += 1

    if (status === 'confirmed') {
      counts.confirmed += 1
    } else if (status === 'absent') {
      counts.absent += 1
    } else {
      counts.noResponse += 1
    }
  }

  return countsByClassId
}

export async function getClassWorkflowSummaryMap(
  supabase: SupabaseClient,
  classes: ReadonlyArray<ClassWorkflowClassInput>,
  now: Date = new Date(),
  options: GetClassWorkflowSummaryOptions = {},
) {
  const summaryByClassId = new Map<string, ClassWorkflowSummary>()
  const classIds = classes.map(classRow => classRow.id)

  if (classIds.length === 0) {
    return summaryByClassId
  }

  const { includeLastCalloutAt = true } = options

  const [{ data: stepData, error: stepError }, lastCalloutAtByClassId] = await Promise.all([
    supabase
      .from('class_workflow_steps')
      .select('class_id, step_key, status, note, updated_at')
      .in('class_id', classIds),
    getLatestCalloutAtByClassId(supabase, classIds, includeLastCalloutAt),
  ])

  if (stepError) {
    throw new Error(stepError.message)
  }

  const stepsByClassId = new Map<string, ClassWorkflowStepRecord[]>()
  for (const row of ((stepData ?? []) as ClassWorkflowStepRow[])) {
    const list = stepsByClassId.get(row.class_id) ?? []
    list.push({
      key: row.step_key,
      status: row.status,
      note: row.note,
      updatedAt: row.updated_at,
    })
    stepsByClassId.set(row.class_id, list)
  }

  for (const classRow of classes) {
    summaryByClassId.set(
      classRow.id,
      buildClassWorkflowSummary({
        counts: classRow.counts,
        attendanceDeadline: classRow.attendanceDeadline,
        steps: stepsByClassId.get(classRow.id) ?? [],
        config: { hasAPlayoff: classRow.hasAPlayoff, hasBPlayoff: classRow.hasBPlayoff },
        lastCalloutAt: lastCalloutAtByClassId.get(classRow.id) ?? null,
        now,
      }),
    )
  }

  return summaryByClassId
}

export async function getAdminClassWorkflowPayload(
  supabase: SupabaseClient,
  competitionId: string,
  classId: string,
  now: Date = new Date(),
) {
  const classRow = await getAuthorizedAdminClass(supabase, competitionId, classId)
  if (!classRow) {
    return null
  }

  const countsByClassId = await getClassAttendanceCountsByIds(supabase, [classId])
  const summaryByClassId = await getClassWorkflowSummaryMap(
    supabase,
    [
      {
        ...classRow,
        counts: countsByClassId.get(classId) ?? {
          confirmed: 0,
          absent: 0,
          noResponse: 0,
          total: 0,
        },
      },
    ],
    now,
  )

  const summary = summaryByClassId.get(classId)
  if (!summary) {
    return null
  }

  return {
    class: classRow,
    attendance: summary.attendance,
    workflow: {
      currentPhaseKey: summary.currentPhaseKey,
      currentPhaseLabel: summary.currentPhaseLabel,
      nextAction: summary.nextAction,
      canLogCallout: summary.canLogCallout,
      steps: summary.steps,
    },
  }
}

async function getLatestCalloutAtByClassId(
  supabase: SupabaseClient,
  classIds: string[],
  includeLastCalloutAt: boolean,
) {
  const lastCalloutAtByClassId = new Map<string, string>()

  if (!includeLastCalloutAt || classIds.length === 0) {
    return lastCalloutAtByClassId
  }

  let rows: ClassWorkflowEventRow[] = []

  if (classIds.length === 1) {
    const { data, error } = await supabase
      .from('class_workflow_events')
      .select('class_id, created_at')
      .eq('event_key', 'missing_players_callout')
      .eq('class_id', classIds[0])
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      throw new Error(error.message)
    }

    rows = (data ?? []) as ClassWorkflowEventRow[]
  } else {
    const { data, error } = await supabase
      .from('class_workflow_events')
      .select('class_id, created_at')
      .eq('event_key', 'missing_players_callout')
      .in('class_id', classIds)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    rows = (data ?? []) as ClassWorkflowEventRow[]
  }

  for (const row of rows) {
    if (!lastCalloutAtByClassId.has(row.class_id)) {
      lastCalloutAtByClassId.set(row.class_id, row.created_at)
    }
  }

  return lastCalloutAtByClassId
}