export const POOL_DELAY_CONSTANTS = {
  ROUND_DURATION_MIN: 20,
  GRACE_MIN: 20,
  YELLOW_THRESHOLD_MIN: 5,
  RED_THRESHOLD_MIN: 15,
  SYNC_SOFT_MIN: 5,
  SYNC_HARD_MIN: 15,
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
}

export type PoolDelayResult = {
  poolNumber: number
  playerCount: number
  completedMatchCount: number
  totalMatches: number
  matchesPerRound: number
  state: PoolDelayState
  delayMin: number
}

export type ClassPoolProgressInput = {
  startTime: string | null
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

export type SyncStaleness = {
  level: 'fresh' | 'soft' | 'hard'
  ageMin: number
  lastSyncAt: Date | null
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
    return { totalMatches: 0, matchesPerRound: 0 }
  }
  const totalMatches = (playerCount * (playerCount - 1)) / 2
  const matchesPerRound = Math.floor(playerCount / 2)
  return { totalMatches, matchesPerRound }
}

export function computePoolDelay(input: {
  startTime: string | null
  pool: PoolDelayInput & { poolNumber: number }
  lastSyncAt: string | null
  now: Date
}): PoolDelayResult {
  const { pool, startTime, lastSyncAt, now } = input
  const { totalMatches, matchesPerRound } = computePoolTotals(pool.playerCount)

  const base: Omit<PoolDelayResult, 'state' | 'delayMin'> = {
    poolNumber: pool.poolNumber,
    playerCount: pool.playerCount,
    completedMatchCount: pool.completedMatchCount,
    totalMatches,
    matchesPerRound,
  }

  if (!lastSyncAt || !startTime || matchesPerRound === 0) {
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

  const expectedRounds = Math.floor(elapsedMin / POOL_DELAY_CONSTANTS.ROUND_DURATION_MIN)
  const completedRounds = Math.ceil(pool.completedMatchCount / matchesPerRound)
  const roundsBehind = Math.max(0, expectedRounds - completedRounds)
  const delayMin = roundsBehind * POOL_DELAY_CONSTANTS.ROUND_DURATION_MIN

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
      pool,
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

export function computeSyncStaleness(input: {
  lastSyncAt: string | null
  now: Date
}): SyncStaleness {
  if (!input.lastSyncAt) {
    return { level: 'fresh', ageMin: 0, lastSyncAt: null }
  }

  const syncDate = new Date(input.lastSyncAt)
  if (Number.isNaN(syncDate.getTime())) {
    return { level: 'fresh', ageMin: 0, lastSyncAt: null }
  }

  const ageMin = Math.max(0, (input.now.getTime() - syncDate.getTime()) / 60_000)

  if (ageMin < POOL_DELAY_CONSTANTS.SYNC_SOFT_MIN) {
    return { level: 'fresh', ageMin, lastSyncAt: syncDate }
  }

  if (ageMin < POOL_DELAY_CONSTANTS.SYNC_HARD_MIN) {
    return { level: 'soft', ageMin, lastSyncAt: syncDate }
  }

  return { level: 'hard', ageMin, lastSyncAt: syncDate }
}

export function formatStockholmHourMinute(value: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value)
}
