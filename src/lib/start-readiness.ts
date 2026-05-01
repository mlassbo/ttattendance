import {
  getClassWorkflowPhaseLabel,
  type ClassWorkflowAttendanceState,
  type ClassWorkflowPhaseKey,
} from './class-workflow'
import { computeSyncStaleness } from './sync-staleness'

export const START_READINESS_CONSTANTS = {
  EARLY_WINDOW_MIN: 30,
  OVERLAP_LIST_LIMIT: 8,
} as const

const TABLE_HOLDING_PHASES = new Set<ClassWorkflowPhaseKey>([
  'seeding_in_progress',
  'pool_draw_in_progress',
  'pool_play_in_progress',
  'pool_play_complete',
  'publishing_pool_results',
  'a_playoff_in_progress',
  'b_playoff_in_progress',
  'playoffs_in_progress',
])

const PLAYOFF_PHASE_KEYS = new Set<ClassWorkflowPhaseKey>([
  'a_playoff_in_progress',
  'b_playoff_in_progress',
  'playoffs_in_progress',
])

const PRE_PLAYOFF_BUSY_PHASES = new Set<ClassWorkflowPhaseKey>([
  'seeding_in_progress',
  'pool_draw_in_progress',
  'pool_play_in_progress',
  'pool_play_complete',
  'publishing_pool_results',
])

const VISIBILITY_PHASES = new Set<ClassWorkflowPhaseKey>([
  'attendance_complete',
  'seeding_in_progress',
  'pool_draw_in_progress',
])

export type StartReadinessSyncLevel = 'fresh' | 'soft' | 'hard' | 'awaiting_data'

export type StartReadinessBlockingPlayer = {
  playerName: string
  playerClub: string | null
  otherClassId: string
  otherClassName: string
  otherPhaseKey: ClassWorkflowPhaseKey
  otherPhaseLabel: string
}

export type ClassStartReadiness = {
  visible: boolean
  tablesRequired: number | null
  tablesInUse: number
  freeTables: number | null
  syncLevel: StartReadinessSyncLevel
  syncLastAt: string | null
  blockingPlayers: StartReadinessBlockingPlayer[]
  blockingPlayersTruncated: number
}

export type StartReadinessConfirmedRegistration = {
  playerId: string | null
  playerName: string
  playerClub: string | null
}

export type StartReadinessClassInput = {
  id: string
  name: string
  startTime: string | null
  phase: ClassWorkflowPhaseKey | null
  attendanceState: ClassWorkflowAttendanceState | null
  playersPerPool: number | null
  plannedTablesPerPool: number
  confirmedRegistrations: StartReadinessConfirmedRegistration[]
  pendingPlayoffPlayerNames: string[]
  pendingPlayoffMatchCount: number
  poolProgress: {
    pools: Array<{ playerCount: number; completedMatchCount: number }>
  } | null
}

export function computeStartReadinessVisibility(input: {
  phase: ClassWorkflowPhaseKey | null
  attendanceState: ClassWorkflowAttendanceState | null
  startTime: string | null
  now: Date
}): boolean {
  if (!input.phase || input.attendanceState !== 'attendance_complete') {
    return false
  }

  if (!VISIBILITY_PHASES.has(input.phase)) {
    return false
  }

  if (!input.startTime) {
    return false
  }

  const startMs = new Date(input.startTime).getTime()
  if (Number.isNaN(startMs)) {
    return false
  }

  const earliestVisibleMs = startMs - START_READINESS_CONSTANTS.EARLY_WINDOW_MIN * 60_000
  return input.now.getTime() >= earliestVisibleMs
}

export function computeTablesRequired(input: {
  confirmed: number
  playersPerPool: number | null
}): number | null {
  if (input.playersPerPool === null || input.playersPerPool < 1) {
    return null
  }

  if (!Number.isInteger(input.confirmed) || input.confirmed <= 0) {
    return 0
  }

  return Math.ceil(input.confirmed / input.playersPerPool)
}

export function computeTablesInUseForClass(cls: StartReadinessClassInput): number {
  if (!cls.phase || !TABLE_HOLDING_PHASES.has(cls.phase)) {
    return 0
  }

  if (cls.phase === 'pool_play_in_progress') {
    if (!cls.poolProgress || cls.poolProgress.pools.length === 0) {
      return 0
    }

    let tables = 0
    for (const pool of cls.poolProgress.pools) {
      const totalMatches = pool.playerCount >= 2
        ? (pool.playerCount * (pool.playerCount - 1)) / 2
        : 0
      if (totalMatches > 0 && pool.completedMatchCount < totalMatches) {
        tables += cls.plannedTablesPerPool
      }
    }
    return tables
  }

  if (PLAYOFF_PHASE_KEYS.has(cls.phase)) {
    return cls.pendingPlayoffMatchCount
  }

  return 0
}

export function computeTablesInUse(classes: StartReadinessClassInput[]): number {
  return classes.reduce((sum, cls) => sum + computeTablesInUseForClass(cls), 0)
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase('sv')
}

export function computePlayerOverlap(input: {
  upcomingClass: StartReadinessClassInput
  otherClasses: StartReadinessClassInput[]
}): { blockingPlayers: StartReadinessBlockingPlayer[]; truncated: number } {
  const upcoming = input.upcomingClass

  const upcomingByNormalizedName = new Map<string, StartReadinessConfirmedRegistration>()
  for (const reg of upcoming.confirmedRegistrations) {
    const normalized = normalizeName(reg.playerName)
    if (!normalized) continue
    if (!upcomingByNormalizedName.has(normalized)) {
      upcomingByNormalizedName.set(normalized, reg)
    }
  }

  const phasePriority: Record<ClassWorkflowPhaseKey, number> = {
    awaiting_attendance: 100,
    callout_needed: 100,
    attendance_complete: 100,
    seeding_in_progress: 1,
    pool_draw_in_progress: 2,
    pool_play_in_progress: 3,
    pool_play_complete: 4,
    publishing_pool_results: 5,
    a_playoff_in_progress: 6,
    b_playoff_in_progress: 6,
    playoffs_in_progress: 6,
    playoffs_complete: 100,
    prize_ceremony_in_progress: 100,
    finished: 100,
  }

  const bestByPlayer = new Map<string, StartReadinessBlockingPlayer>()

  for (const other of input.otherClasses) {
    if (other.id === upcoming.id || !other.phase) {
      continue
    }

    const activeNames: string[] = []

    if (PRE_PLAYOFF_BUSY_PHASES.has(other.phase)) {
      for (const reg of other.confirmedRegistrations) {
        activeNames.push(reg.playerName)
      }
    } else if (PLAYOFF_PHASE_KEYS.has(other.phase)) {
      for (const name of other.pendingPlayoffPlayerNames) {
        activeNames.push(name)
      }
    } else {
      continue
    }

    if (activeNames.length === 0) {
      continue
    }

    const seenInThisClass = new Set<string>()
    for (const name of activeNames) {
      const normalized = normalizeName(name)
      if (!normalized || seenInThisClass.has(normalized)) {
        continue
      }
      seenInThisClass.add(normalized)

      const upcomingReg = upcomingByNormalizedName.get(normalized)
      if (!upcomingReg) continue

      const blocking: StartReadinessBlockingPlayer = {
        playerName: upcomingReg.playerName,
        playerClub: upcomingReg.playerClub,
        otherClassId: other.id,
        otherClassName: other.name,
        otherPhaseKey: other.phase,
        otherPhaseLabel: getClassWorkflowPhaseLabel(other.phase),
      }

      const existing = bestByPlayer.get(normalized)
      if (!existing || phasePriority[other.phase] < phasePriority[existing.otherPhaseKey]) {
        bestByPlayer.set(normalized, blocking)
      }
    }
  }

  const sorted = Array.from(bestByPlayer.values()).sort((a, b) =>
    a.playerName.localeCompare(b.playerName, 'sv'),
  )

  const limit = START_READINESS_CONSTANTS.OVERLAP_LIST_LIMIT
  if (sorted.length <= limit) {
    return { blockingPlayers: sorted, truncated: 0 }
  }

  return {
    blockingPlayers: sorted.slice(0, limit),
    truncated: sorted.length - limit,
  }
}

function computeSyncLevel(input: {
  lastSyncAt: string | null
  now: Date
}): StartReadinessSyncLevel {
  if (!input.lastSyncAt) {
    return 'awaiting_data'
  }
  const staleness = computeSyncStaleness(input)
  return staleness.level
}

export function computeStartReadiness(input: {
  upcomingClass: StartReadinessClassInput
  otherClasses: StartReadinessClassInput[]
  venueTableCount: number | null
  lastSyncAt: string | null
  now: Date
}): ClassStartReadiness {
  const upcoming = input.upcomingClass
  const visible = computeStartReadinessVisibility({
    phase: upcoming.phase,
    attendanceState: upcoming.attendanceState,
    startTime: upcoming.startTime,
    now: input.now,
  })

  const tablesRequired = computeTablesRequired({
    confirmed: upcoming.confirmedRegistrations.length,
    playersPerPool: upcoming.playersPerPool,
  })

  const tablesInUse = computeTablesInUse(input.otherClasses)
  const freeTables = input.venueTableCount === null
    ? null
    : Math.max(0, input.venueTableCount - tablesInUse)

  const syncLevel = computeSyncLevel({ lastSyncAt: input.lastSyncAt, now: input.now })

  const overlap = computePlayerOverlap({
    upcomingClass: upcoming,
    otherClasses: input.otherClasses,
  })

  return {
    visible,
    tablesRequired,
    tablesInUse,
    freeTables,
    syncLevel,
    syncLastAt: input.lastSyncAt,
    blockingPlayers: overlap.blockingPlayers,
    blockingPlayersTruncated: overlap.truncated,
  }
}
