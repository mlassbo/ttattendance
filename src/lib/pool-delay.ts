import { SYNC_STALENESS_THRESHOLDS } from './sync-staleness'

export { computeSyncStaleness, formatStockholmHourMinute } from './sync-staleness'
export type { SyncStaleness } from './sync-staleness'

export const POOL_DELAY_CONSTANTS = {
  MATCH_DURATION_MIN: 20,
  GRACE_MIN: 20,
  YELLOW_THRESHOLD_MIN: 5,
  RED_THRESHOLD_MIN: 15,
  SYNC_SOFT_MIN: SYNC_STALENESS_THRESHOLDS.SOFT_MIN,
  SYNC_HARD_MIN: SYNC_STALENESS_THRESHOLDS.HARD_MIN,
} as const

export type PoolDelayState =
  | 'awaiting_data'
  | 'starting'
  | 'on_schedule'
  | 'yellow'
  | 'red'
  | 'done'

export type PoolDelayInput = {
  playerCount: number
  completedMatchCount: number
  plannedTablesPerPool?: number | null
}

export type PoolDelayResult = {
  poolNumber: number
  playerCount: number
  completedMatchCount: number
  totalMatches: number
  plannedTablesPerPool: number
  state: PoolDelayState
  delayMin: number
}

export type ClassPoolProgressInput = {
  startTime: string | null
  plannedTablesPerPool?: number | null
  pools: Array<PoolDelayInput & { poolNumber: number }>
  lastSyncAt: string | null
  now: Date
}

export type ClassPoolProgressResult = {
  state: PoolDelayState
  delayMin: number
  totalMatches: number
  completedMatches: number
  pools: PoolDelayResult[]
}

const STATE_PRIORITY: Record<PoolDelayState, number> = {
  done: 0,
  on_schedule: 1,
  starting: 2,
  awaiting_data: 3,
  yellow: 4,
  red: 5,
}

function computePoolTotals(playerCount: number) {
  if (playerCount < 2) {
    return { totalMatches: 0 }
  }

  const totalMatches = (playerCount * (playerCount - 1)) / 2
  return { totalMatches }
}

function normalizePlannedTablesPerPool(value: number | null | undefined): number {
  if (value == null || !Number.isInteger(value) || value < 1) {
    return 1
  }

  return value
}

export function computePoolDelay(input: {
  startTime: string | null
  pool: PoolDelayInput & { poolNumber: number }
  lastSyncAt: string | null
  now: Date
}): PoolDelayResult {
  const { pool, startTime, lastSyncAt, now } = input
  const { totalMatches } = computePoolTotals(pool.playerCount)
  const plannedTablesPerPool = normalizePlannedTablesPerPool(pool.plannedTablesPerPool)

  const base: Omit<PoolDelayResult, 'state' | 'delayMin'> = {
    poolNumber: pool.poolNumber,
    playerCount: pool.playerCount,
    completedMatchCount: pool.completedMatchCount,
    totalMatches,
    plannedTablesPerPool,
  }

  if (!lastSyncAt || !startTime || totalMatches === 0) {
    return { ...base, state: 'awaiting_data', delayMin: 0 }
  }

  if (pool.completedMatchCount >= totalMatches && totalMatches > 0) {
    return { ...base, state: 'done', delayMin: 0 }
  }

  const lastSyncDate = new Date(lastSyncAt)
  const startDate = new Date(startTime)
  if (Number.isNaN(lastSyncDate.getTime()) || Number.isNaN(startDate.getTime())) {
    return { ...base, state: 'awaiting_data', delayMin: 0 }
  }

  const clampTime = Math.min(now.getTime(), lastSyncDate.getTime())
  const elapsedMin = (clampTime - startDate.getTime()) / 60_000

  if (elapsedMin < POOL_DELAY_CONSTANTS.GRACE_MIN) {
    return { ...base, state: 'starting', delayMin: 0 }
  }

  const expectedCompletedMatches = Math.min(
    totalMatches,
    Math.floor(elapsedMin / POOL_DELAY_CONSTANTS.MATCH_DURATION_MIN) * plannedTablesPerPool,
  )
  const delayedMatchCount = Math.max(0, expectedCompletedMatches - pool.completedMatchCount)
  const progressDelayMin = Math.ceil(delayedMatchCount / plannedTablesPerPool) * POOL_DELAY_CONSTANTS.MATCH_DURATION_MIN
  const expectedFinishMin = Math.ceil(totalMatches / plannedTablesPerPool) * POOL_DELAY_CONSTANTS.MATCH_DURATION_MIN
  const overrunDelayMin = Math.max(0, Math.round(elapsedMin - expectedFinishMin))
  const delayMin = Math.max(progressDelayMin, overrunDelayMin)

  let state: PoolDelayState = 'on_schedule'
  if (delayMin >= POOL_DELAY_CONSTANTS.RED_THRESHOLD_MIN) {
    state = 'red'
  } else if (delayMin >= POOL_DELAY_CONSTANTS.YELLOW_THRESHOLD_MIN) {
    state = 'yellow'
  }

  return { ...base, state, delayMin }
}

export function computeClassPoolProgress(input: ClassPoolProgressInput): ClassPoolProgressResult {
  const poolResults = input.pools.map(pool =>
    computePoolDelay({
      startTime: input.startTime,
      pool: {
        ...pool,
        plannedTablesPerPool: input.plannedTablesPerPool,
      },
      lastSyncAt: input.lastSyncAt,
      now: input.now,
    }),
  )

  const totalMatches = poolResults.reduce((sum, pool) => sum + pool.totalMatches, 0)
  const completedMatches = poolResults.reduce((sum, pool) => sum + pool.completedMatchCount, 0)

  if (poolResults.length === 0) {
    return {
      state: 'awaiting_data',
      delayMin: 0,
      totalMatches,
      completedMatches,
      pools: poolResults,
    }
  }

  const allDone = poolResults.every(pool => pool.state === 'done')
  if (allDone) {
    return {
      state: 'done',
      delayMin: 0,
      totalMatches,
      completedMatches,
      pools: poolResults,
    }
  }

  const worstPool = poolResults.reduce((worst, pool) =>
    STATE_PRIORITY[pool.state] > STATE_PRIORITY[worst.state] ? pool : worst,
  )
  const maxDelay = poolResults.reduce((max, pool) => Math.max(max, pool.delayMin), 0)

  return {
    state: worstPool.state,
    delayMin: maxDelay,
    totalMatches,
    completedMatches,
    pools: poolResults,
  }
}

