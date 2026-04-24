export const SYNC_STALENESS_THRESHOLDS = {
  SOFT_MIN: 5,
  HARD_MIN: 15,
} as const

export type SyncStaleness = {
  level: 'fresh' | 'soft' | 'hard'
  ageMin: number
  lastSyncAt: Date | null
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

  if (ageMin < SYNC_STALENESS_THRESHOLDS.SOFT_MIN) {
    return { level: 'fresh', ageMin, lastSyncAt: syncDate }
  }

  if (ageMin < SYNC_STALENESS_THRESHOLDS.HARD_MIN) {
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
