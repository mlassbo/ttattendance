export const CLASS_WORKFLOW_STEP_KEYS = [
  'remove_absent_players',
  'seed_class',
  'publish_pools',
  'register_match_results',
  'publish_pool_results',
  'a_playoff',
  'b_playoff',
  'register_playoff_match_results',
  'prize_ceremony',
] as const

export type ClassWorkflowStepKey = (typeof CLASS_WORKFLOW_STEP_KEYS)[number]

export const CLASS_WORKFLOW_STEP_STATUS_VALUES = [
  'not_started',
  'active',
  'done',
  'skipped',
] as const

export type ClassWorkflowStepStatus = (typeof CLASS_WORKFLOW_STEP_STATUS_VALUES)[number]

export const CLASS_WORKFLOW_EVENT_KEYS = ['missing_players_callout'] as const

export type ClassWorkflowEventKey = (typeof CLASS_WORKFLOW_EVENT_KEYS)[number]

export type ClassWorkflowActionKey = ClassWorkflowEventKey | ClassWorkflowStepKey

export type ClassWorkflowAttendanceState =
  | 'awaiting_attendance'
  | 'callout_needed'
  | 'attendance_complete'

export type ClassWorkflowDerivedStepState =
  | 'blocked'
  | 'ready'
  | 'active'
  | 'done'
  | 'skipped'

export type ClassWorkflowPhaseKey =
  | ClassWorkflowAttendanceState
  | 'seeding_in_progress'
  | 'pool_draw_in_progress'
  | 'pool_play_in_progress'
  | 'pool_play_complete'
  | 'publishing_pool_results'
  | 'playoffs_in_progress'
  | 'playoffs_complete'
  | 'a_playoff_in_progress'
  | 'b_playoff_in_progress'
  | 'prize_ceremony_in_progress'
  | 'finished'

export type ClassWorkflowAttendanceCounts = {
  confirmed: number
  absent: number
  noResponse: number
  total: number
}

export type ClassWorkflowStepRecord = {
  key: ClassWorkflowStepKey
  status: ClassWorkflowStepStatus
  note: string | null
  updatedAt: string | null
}

export type ClassWorkflowStepDefinition = {
  key: ClassWorkflowStepKey
  order: number
  label: string
  helper: string
  canSkip: boolean
  dependsOn: ClassWorkflowStepKey[]
  requiresAttendanceComplete: boolean
}

export type ClassWorkflowStepSummary = ClassWorkflowStepDefinition & {
  status: ClassWorkflowStepStatus
  derivedState: ClassWorkflowDerivedStepState
  note: string | null
  updatedAt: string | null
  canStart: boolean
  canMarkDone: boolean
  canSkip: boolean
  canReopen: boolean
}

export type ClassWorkflowNextAction = {
  key: ClassWorkflowActionKey
  label: string
  helper: string
}

export type ClassWorkflowConfig = {
  hasAPlayoff: boolean
  hasBPlayoff: boolean
}

const PUBLISH_POOL_RESULTS_HELPER_WITH_PLAYOFF =
  'Skriv ut och sätt upp poolresultaten. Ropa ut att resultaten är uppsatta och att slutspelet lottas inom kort.'

const PUBLISH_POOL_RESULTS_HELPER_WITHOUT_PLAYOFF =
  'Skriv ut och sätt upp poolresultaten. Ropa ut att resultaten är uppsatta och att prisutdelning sker inom kort.'

function resolveStepHelper(
  definition: ClassWorkflowStepDefinition,
  config: ClassWorkflowConfig,
) {
  if (definition.key === 'publish_pool_results') {
    return config.hasAPlayoff || config.hasBPlayoff
      ? PUBLISH_POOL_RESULTS_HELPER_WITH_PLAYOFF
      : PUBLISH_POOL_RESULTS_HELPER_WITHOUT_PLAYOFF
  }

  return definition.helper
}

export type ClassWorkflowSummary = {
  attendance: ClassWorkflowAttendanceCounts & {
    state: ClassWorkflowAttendanceState
    lastCalloutAt: string | null
  }
  currentPhaseKey: ClassWorkflowPhaseKey
  currentPhaseLabel: string
  nextAction: ClassWorkflowNextAction | null
  followUpAction: ClassWorkflowNextAction | null
  canLogCallout: boolean
  steps: ClassWorkflowStepSummary[]
}

const CLASS_WORKFLOW_STEP_KEY_SET = new Set<string>(CLASS_WORKFLOW_STEP_KEYS)
const CLASS_WORKFLOW_STEP_STATUS_SET = new Set<string>(CLASS_WORKFLOW_STEP_STATUS_VALUES)
const CLASS_WORKFLOW_EVENT_KEY_SET = new Set<string>(CLASS_WORKFLOW_EVENT_KEYS)

const CLASS_WORKFLOW_STEP_DEFINITIONS: readonly ClassWorkflowStepDefinition[] = [
  {
    key: 'remove_absent_players',
    order: 1,
    label: 'Ta bort frånvarande i tävlingssystemet',
    helper: 'Ta bort spelare som har rapporterat frånvaro från klassen i tävlingssystemet innan seedning och lottning.',
    canSkip: false,
    dependsOn: [],
    requiresAttendanceComplete: true,
  },
  {
    key: 'seed_class',
    order: 2,
    label: 'Seeda klass',
    helper: 'Gör seedning i tävlingssystemet om klassen ska seedas.',
    canSkip: true,
    dependsOn: ['remove_absent_players'],
    requiresAttendanceComplete: true,
  },
  {
    key: 'publish_pools',
    order: 3,
    label: 'Lotta och publicera pooler',
    helper: 'Skapa lottning, skriv ut, märk med bord, sätt upp lappar och ropa ut att poolspelet startar.',
    canSkip: false,
    dependsOn: ['seed_class'],
    requiresAttendanceComplete: true,
  },
  {
    key: 'register_match_results',
    order: 4,
    label: 'Registrera matchresultat poolspel',
    helper: 'Registrera alla resultat från poolmatcher i tävlingssystemet.',
    canSkip: false,
    dependsOn: ['publish_pools'],
    requiresAttendanceComplete: false,
  },
  {
    key: 'publish_pool_results',
    order: 5,
    label: 'Publicera poolresultat',
    helper: 'Skriv ut och sätt upp poolresultaten. Ropa ut att resultaten är uppsatta och att slutspelet lottas inom kort.',
    canSkip: false,
    dependsOn: ['register_match_results'],
    requiresAttendanceComplete: false,
  },
  {
    key: 'a_playoff',
    order: 6,
    label: 'Lotta och publicera A-slutspel',
    helper: 'Lotta och publicera A-slutspel när poolresultaten har varit uppe några minuter. Ropa ut att A-slutspelet är uppsatt.',
    canSkip: true,
    dependsOn: ['publish_pool_results'],
    requiresAttendanceComplete: false,
  },
  {
    key: 'b_playoff',
    order: 7,
    label: 'Lotta och publicera B-slutspel',
    helper: 'Lotta och publicera B-slutspel om klassen ska ha B-slutspel. Ropa ut att B-slutspelet är uppsatt.',
    canSkip: true,
    dependsOn: ['publish_pool_results'],
    requiresAttendanceComplete: false,
  },
  {
    key: 'register_playoff_match_results',
    order: 8,
    label: 'Registrera matchresultat slutspel',
    helper: 'Registrera alla matchresultat i slutspelet.',
    canSkip: true,
    dependsOn: ['a_playoff', 'b_playoff'],
    requiresAttendanceComplete: false,
  },
  {
    key: 'prize_ceremony',
    order: 9,
    label: 'Prisutdelning',
    helper: 'Genomför prisutdelning.',
    canSkip: false,
    dependsOn: ['register_playoff_match_results'],
    requiresAttendanceComplete: false,
  },
] as const

const CLASS_WORKFLOW_STEP_DEFINITION_BY_KEY = new Map(
  CLASS_WORKFLOW_STEP_DEFINITIONS.map(definition => [definition.key, definition] as const),
)

const CLASS_WORKFLOW_PHASE_LABELS: Record<ClassWorkflowPhaseKey, string> = {
  awaiting_attendance: 'Inväntar närvaro',
  callout_needed: 'Ropa upp saknade spelare',
  attendance_complete: 'Alla har rapporterat närvaro',
  seeding_in_progress: 'Seedning pågår',
  pool_draw_in_progress: 'Pooler lottas',
  pool_play_in_progress: 'Poolspel pågår',
  pool_play_complete: 'Poolspel klart',
  publishing_pool_results: 'Poolresultat förbereds',
  playoffs_in_progress: 'Slutspel pågår',
  playoffs_complete: 'Slutspel klart',
  a_playoff_in_progress: 'Slutspel pågår',
  b_playoff_in_progress: 'Slutspel pågår',
  prize_ceremony_in_progress: 'Prisutdelning pågår',
  finished: 'Klassen är klar',
}

function getStepStatus(
  stepsByKey: Map<ClassWorkflowStepKey, ClassWorkflowStepRecord>,
  stepKey: ClassWorkflowStepKey,
) {
  return stepsByKey.get(stepKey)?.status ?? 'not_started'
}

function isResolvedStepStatus(status: ClassWorkflowStepStatus) {
  return status === 'done' || status === 'skipped'
}

function hasResolvedDependencies(
  definition: ClassWorkflowStepDefinition,
  stepsByKey: Map<ClassWorkflowStepKey, ClassWorkflowStepRecord>,
  visibleStepKeys: ReadonlySet<ClassWorkflowStepKey>,
) {
  return definition.dependsOn.every(stepKey =>
    !visibleStepKeys.has(stepKey) || isResolvedStepStatus(getStepStatus(stepsByKey, stepKey)),
  )
}

function canSkipClassWorkflowStep(
  definition: ClassWorkflowStepDefinition,
  stepsByKey: Map<ClassWorkflowStepKey, ClassWorkflowStepRecord>,
  visibleStepKeys: ReadonlySet<ClassWorkflowStepKey>,
) {
  if (!definition.canSkip) {
    return false
  }

  if (definition.key !== 'register_playoff_match_results') {
    return true
  }

  const aResolved = !visibleStepKeys.has('a_playoff')
    || getStepStatus(stepsByKey, 'a_playoff') === 'skipped'
  const bResolved = !visibleStepKeys.has('b_playoff')
    || getStepStatus(stepsByKey, 'b_playoff') === 'skipped'
  return aResolved && bResolved
}

export function getClassWorkflowStepDefinition(stepKey: ClassWorkflowStepKey) {
  const definition = CLASS_WORKFLOW_STEP_DEFINITION_BY_KEY.get(stepKey)

  if (!definition) {
    throw new Error(`Unknown workflow step: ${stepKey}`)
  }

  return definition
}

export function getClassWorkflowStepDefinitions() {
  return [...CLASS_WORKFLOW_STEP_DEFINITIONS]
}

export function isClassWorkflowStepKey(value: string): value is ClassWorkflowStepKey {
  return CLASS_WORKFLOW_STEP_KEY_SET.has(value)
}

export function isClassWorkflowStepStatus(value: string): value is ClassWorkflowStepStatus {
  return CLASS_WORKFLOW_STEP_STATUS_SET.has(value)
}

export function isClassWorkflowEventKey(value: string): value is ClassWorkflowEventKey {
  return CLASS_WORKFLOW_EVENT_KEY_SET.has(value)
}

export function getClassWorkflowPhaseLabel(phaseKey: ClassWorkflowPhaseKey) {
  return CLASS_WORKFLOW_PHASE_LABELS[phaseKey]
}

export function createDefaultClassWorkflowSteps(): ClassWorkflowStepRecord[] {
  return CLASS_WORKFLOW_STEP_KEYS.map(key => ({
    key,
    status: 'not_started',
    note: null,
    updatedAt: null,
  }))
}

export function normalizeClassWorkflowSteps(
  steps: ReadonlyArray<Partial<ClassWorkflowStepRecord> & { key: ClassWorkflowStepKey }> = [],
): ClassWorkflowStepRecord[] {
  const stepsByKey = new Map<ClassWorkflowStepKey, ClassWorkflowStepRecord>()

  for (const key of CLASS_WORKFLOW_STEP_KEYS) {
    stepsByKey.set(key, {
      key,
      status: 'not_started',
      note: null,
      updatedAt: null,
    })
  }

  for (const step of steps) {
    stepsByKey.set(step.key, {
      key: step.key,
      status: step.status ?? 'not_started',
      note: step.note ?? null,
      updatedAt: step.updatedAt ?? null,
    })
  }

  return CLASS_WORKFLOW_STEP_KEYS.map(key => stepsByKey.get(key) as ClassWorkflowStepRecord)
}

export function getClassWorkflowAttendanceState({
  attendanceDeadline,
  noResponse,
  now = new Date(),
}: {
  attendanceDeadline: string | Date
  noResponse: number
  now?: Date
}): ClassWorkflowAttendanceState {
  if (noResponse === 0) {
    return 'attendance_complete'
  }

  if (now.getTime() > new Date(attendanceDeadline).getTime()) {
    return 'callout_needed'
  }

  return 'awaiting_attendance'
}

export function getClassWorkflowDerivedStepState({
  stepKey,
  attendanceState,
  steps,
  visibleStepKeys = new Set<ClassWorkflowStepKey>(CLASS_WORKFLOW_STEP_KEYS),
}: {
  stepKey: ClassWorkflowStepKey
  attendanceState: ClassWorkflowAttendanceState
  steps: ReadonlyArray<ClassWorkflowStepRecord>
  visibleStepKeys?: ReadonlySet<ClassWorkflowStepKey>
  config?: ClassWorkflowConfig
}): ClassWorkflowDerivedStepState {
  const normalizedSteps = normalizeClassWorkflowSteps(steps)
  const stepsByKey = new Map(normalizedSteps.map(step => [step.key, step] as const))
  const currentStatus = getStepStatus(stepsByKey, stepKey)

  if (currentStatus === 'active') {
    return 'active'
  }

  if (currentStatus === 'done') {
    return 'done'
  }

  if (currentStatus === 'skipped') {
    return 'skipped'
  }

  const definition = getClassWorkflowStepDefinition(stepKey)

  if (definition.requiresAttendanceComplete && attendanceState !== 'attendance_complete') {
    return 'blocked'
  }

  return hasResolvedDependencies(definition, stepsByKey, visibleStepKeys) ? 'ready' : 'blocked'
}

function isWorkflowStepVisible(
  definition: ClassWorkflowStepDefinition,
  counts: ClassWorkflowAttendanceCounts,
  config: ClassWorkflowConfig,
) {
  if (definition.key === 'remove_absent_players') {
    return counts.absent > 0
  }

  if (definition.key === 'a_playoff') {
    return config.hasAPlayoff
  }

  if (definition.key === 'b_playoff') {
    return config.hasBPlayoff
  }

  if (definition.key === 'register_playoff_match_results') {
    return config.hasAPlayoff || config.hasBPlayoff
  }

  return true
}

export function getClassWorkflowResetStepKeys(stepKey: ClassWorkflowStepKey) {
  const toVisit = [stepKey]
  const visited = new Set<ClassWorkflowStepKey>()

  while (toVisit.length > 0) {
    const currentStepKey = toVisit.shift() as ClassWorkflowStepKey

    if (visited.has(currentStepKey)) {
      continue
    }

    visited.add(currentStepKey)

    for (const definition of CLASS_WORKFLOW_STEP_DEFINITIONS) {
      if (definition.dependsOn.includes(currentStepKey)) {
        toVisit.push(definition.key)
      }
    }
  }

  return CLASS_WORKFLOW_STEP_DEFINITIONS
    .filter(definition => visited.has(definition.key))
    .sort((left, right) => left.order - right.order)
    .map(definition => definition.key)
}

export function buildClassWorkflowResetPlan(stepKey: ClassWorkflowStepKey) {
  return getClassWorkflowResetStepKeys(stepKey).map(key => ({
    key,
    status: 'not_started' as const,
  }))
}

export function getConflictingActiveWorkflowStepKey(
  steps: ReadonlyArray<Partial<ClassWorkflowStepRecord> & { key: ClassWorkflowStepKey }>,
  targetStepKey: ClassWorkflowStepKey,
) {
  const activeStepKeys = normalizeClassWorkflowSteps(steps)
    .filter(step => step.status === 'active' && step.key !== targetStepKey)
    .map(step => step.key)

  if (activeStepKeys.length === 0) {
    return null
  }

  const isPlayoffStep = targetStepKey === 'a_playoff' || targetStepKey === 'b_playoff'
  if (isPlayoffStep && activeStepKeys.every(stepKey => stepKey === 'a_playoff' || stepKey === 'b_playoff')) {
    return null
  }

  return activeStepKeys[0]
}

export function buildClassWorkflowSummary({
  counts,
  attendanceDeadline,
  steps,
  config,
  lastCalloutAt = null,
  now = new Date(),
}: {
  counts: ClassWorkflowAttendanceCounts
  attendanceDeadline: string | Date
  steps: ReadonlyArray<Partial<ClassWorkflowStepRecord> & { key: ClassWorkflowStepKey }>
  config: ClassWorkflowConfig
  lastCalloutAt?: string | null
  now?: Date
}): ClassWorkflowSummary {
  const normalizedSteps = normalizeClassWorkflowSteps(steps)
  const stepsByKey = new Map(normalizedSteps.map(step => [step.key, step] as const))
  const attendanceState = getClassWorkflowAttendanceState({
    attendanceDeadline,
    noResponse: counts.noResponse,
    now,
  })
  const visibleStepDefinitions = CLASS_WORKFLOW_STEP_DEFINITIONS.filter(definition =>
    isWorkflowStepVisible(definition, counts, config),
  )
  const visibleStepKeys = new Set(visibleStepDefinitions.map(definition => definition.key))

  const stepSummaries = visibleStepDefinitions.map(definition => {
    const step = stepsByKey.get(definition.key) ?? {
      key: definition.key,
      status: 'not_started' as const,
      note: null,
      updatedAt: null,
    }
    const derivedState = getClassWorkflowDerivedStepState({
      stepKey: definition.key,
      attendanceState,
      steps: normalizedSteps,
      visibleStepKeys,
      config,
    })

    return {
      ...definition,
      helper: resolveStepHelper(definition, config),
      status: step.status,
      derivedState,
      note: step.note,
      updatedAt: step.updatedAt,
      canStart: derivedState === 'ready' && step.status === 'not_started',
      canMarkDone: derivedState === 'ready' || derivedState === 'active',
      canSkip: derivedState === 'ready' && canSkipClassWorkflowStep(definition, stepsByKey, visibleStepKeys),
      canReopen:
        step.status === 'active' || step.status === 'done' || step.status === 'skipped',
    }
  })

  const stepSummaryByKey = new Map(stepSummaries.map(step => [step.key, step] as const))
  const statusOf = (stepKey: ClassWorkflowStepKey) => stepSummaryByKey.get(stepKey)?.status

  let currentPhaseKey: ClassWorkflowPhaseKey
  const hasPlayoffInProgress = ['active', 'done'].includes(statusOf('a_playoff') ?? '')
    || ['active', 'done'].includes(statusOf('b_playoff') ?? '')

  if (attendanceState === 'callout_needed') {
    currentPhaseKey = 'callout_needed'
  } else if (attendanceState === 'awaiting_attendance') {
    currentPhaseKey = 'awaiting_attendance'
  } else if (statusOf('seed_class') === 'active') {
    currentPhaseKey = 'seeding_in_progress'
  } else if (statusOf('publish_pools') === 'active') {
    currentPhaseKey = 'pool_draw_in_progress'
  } else if (statusOf('publish_pool_results') === 'active') {
    currentPhaseKey = 'publishing_pool_results'
  } else if (statusOf('a_playoff') === 'active' && statusOf('b_playoff') === 'active') {
    currentPhaseKey = 'playoffs_in_progress'
  } else if (statusOf('a_playoff') === 'active') {
    currentPhaseKey = 'a_playoff_in_progress'
  } else if (statusOf('b_playoff') === 'active') {
    currentPhaseKey = 'b_playoff_in_progress'
  } else if (statusOf('register_playoff_match_results') === 'active') {
    currentPhaseKey = 'playoffs_in_progress'
  } else if (statusOf('prize_ceremony') === 'active') {
    currentPhaseKey = 'prize_ceremony_in_progress'
  } else if (statusOf('prize_ceremony') === 'done') {
    currentPhaseKey = 'finished'
  } else if (
    statusOf('register_playoff_match_results') === 'done'
    && statusOf('prize_ceremony') === 'not_started'
  ) {
    currentPhaseKey = 'playoffs_complete'
  } else if (hasPlayoffInProgress) {
    currentPhaseKey = 'playoffs_in_progress'
  } else if (
    statusOf('register_match_results') === 'done'
    && statusOf('publish_pool_results') === 'not_started'
  ) {
    currentPhaseKey = 'pool_play_complete'
  } else if (
    statusOf('publish_pools') === 'done'
    && statusOf('register_match_results') !== 'done'
    && statusOf('publish_pool_results') === 'not_started'
  ) {
    currentPhaseKey = 'pool_play_in_progress'
  } else {
    currentPhaseKey = 'attendance_complete'
  }

  let nextAction: ClassWorkflowNextAction | null = null
  let followUpAction: ClassWorkflowNextAction | null = null

  if (attendanceState === 'callout_needed') {
    nextAction = {
      key: 'missing_players_callout',
      label: 'Ropa upp saknade spelare',
      helper: getClassWorkflowActionHelper('missing_players_callout'),
    }
  } else if (attendanceState === 'attendance_complete') {
    const activeStep = stepSummaries.find(step => step.derivedState === 'active')
    const readyStep = stepSummaries.find(step => step.derivedState === 'ready')
    const actionStep = activeStep ?? readyStep

    if (actionStep) {
      nextAction = {
        key: actionStep.key,
        label: actionStep.label,
        helper: actionStep.helper,
      }

      const currentIndex = stepSummaries.findIndex(step => step.key === actionStep.key)
      const nextWorkflowStep = stepSummaries.slice(currentIndex + 1).find(step =>
        step.status !== 'done' && step.status !== 'skipped',
      )

      if (nextWorkflowStep) {
        followUpAction = {
          key: nextWorkflowStep.key,
          label: nextWorkflowStep.label,
          helper: nextWorkflowStep.helper,
        }
      }
    }
  }

  return {
    attendance: {
      ...counts,
      state: attendanceState,
      lastCalloutAt,
    },
    currentPhaseKey,
    currentPhaseLabel: getClassWorkflowPhaseLabel(currentPhaseKey),
    nextAction,
    followUpAction,
    canLogCallout: attendanceState === 'callout_needed',
    steps: stepSummaries,
  }
}

export function getClassWorkflowActionLabel(actionKey: ClassWorkflowActionKey) {
  if (actionKey === 'missing_players_callout') {
    return 'Ropa upp saknade spelare'
  }

  return getClassWorkflowStepDefinition(actionKey).label
}

export function getClassWorkflowActionHelper(actionKey: ClassWorkflowActionKey) {
  if (actionKey === 'missing_players_callout') {
    return 'Ropa upp spelarna som fortfarande inte har svarat.'
  }

  return getClassWorkflowStepDefinition(actionKey).helper
}

export function isOptionalClassWorkflowStep(stepKey: ClassWorkflowStepKey) {
  return getClassWorkflowStepDefinition(stepKey).canSkip
}
