'use client'

import {
  computeClassPoolProgress,
  computeSyncStaleness,
  formatStockholmHourMinute,
  type ClassPoolProgressResult,
  type PoolDelayResult,
  type PoolDelayState,
} from '@/lib/pool-delay'

type PoolProgressStripProps = {
  classId: string
  startTime: string | null
  plannedTablesPerPool: number
  poolProgress: {
    pools: Array<{
      poolNumber: number
      playerCount: number
      completedMatchCount: number
      tables: number[]
    }>
  } | null
  lastSyncAt: string | null
  now: Date
}

function formatDelayChipLabel(state: PoolDelayState, delayMin: number): { label: string; className: string } | null {
  if (state === 'done') {
    return { label: 'Klart', className: 'app-pill-success' }
  }
  if (state === 'red') {
    return { label: `+${delayMin} min`, className: 'app-pill-danger' }
  }
  if (state === 'yellow') {
    return { label: `+${delayMin} min`, className: 'app-pill-warning' }
  }
  if (state === 'starting') {
    return { label: 'Startar', className: 'app-pill-muted' }
  }
  if (state === 'awaiting_data') {
    return { label: 'Inväntar data', className: 'app-pill-muted' }
  }
  if (state === 'on_schedule') {
    return { label: 'På schema', className: 'app-pill-muted' }
  }
  return null
}

function getPoolBarFillClasses(state: PoolDelayState): string {
  if (state === 'done') return 'bg-green-500'
  if (state === 'red') return 'bg-red-500'
  if (state === 'yellow') return 'bg-amber-500'
  return 'bg-brand'
}

function getPoolDelayTextClasses(state: PoolDelayState): string {
  if (state === 'red') return 'text-red-700'
  if (state === 'yellow') return 'text-amber-800'
  return 'text-muted'
}

function formatPoolDelayText(pool: PoolDelayResult): string | null {
  if (pool.state === 'red' || pool.state === 'yellow') {
    return `+${pool.delayMin} min`
  }
  return null
}

export default function PoolProgressStrip({
  classId,
  startTime,
  plannedTablesPerPool,
  poolProgress,
  lastSyncAt,
  now,
}: PoolProgressStripProps) {
  const hasPools = !!poolProgress && poolProgress.pools.length > 0

  if (!hasPools) {
    return (
      <div
        data-testid={`pool-progress-strip-${classId}`}
        className="w-full max-w-xl rounded-2xl border border-line/70 bg-stone-50/80 px-4 py-3 text-sm text-muted"
      >
        <div className="flex items-center justify-between gap-3">
          <span>Poolstatus</span>
          <span
            data-testid={`pool-delay-chip-${classId}`}
            className="app-pill-muted"
          >
            Inväntar data
          </span>
        </div>
      </div>
    )
  }

  const aggregate: ClassPoolProgressResult = computeClassPoolProgress({
    startTime,
    plannedTablesPerPool,
    pools: poolProgress!.pools,
    lastSyncAt,
    now,
  })

  const staleness = computeSyncStaleness({ lastSyncAt, now })
  const chip = formatDelayChipLabel(aggregate.state, aggregate.delayMin)

  const progressRatio = aggregate.totalMatches > 0
    ? Math.min(1, aggregate.completedMatches / aggregate.totalMatches)
    : 0
  const progressPercent = Math.round(progressRatio * 100)

  return (
    <div
      data-testid={`pool-progress-strip-${classId}`}
      className="w-full max-w-xl space-y-3 rounded-2xl border border-line/70 bg-stone-50/80 px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {aggregate.completedMatches}/{aggregate.totalMatches} matcher
        </p>
        {chip && (
          <span
            data-testid={`pool-delay-chip-${classId}`}
            className={chip.className}
          >
            {chip.label}
          </span>
        )}
      </div>

      <div
        data-testid={`pool-progress-bar-${classId}`}
        className="h-2 overflow-hidden rounded-full bg-stone-200"
        aria-label="Andel spelade matcher"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${getPoolBarFillClasses(aggregate.state)}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <ul className="space-y-1.5">
        {aggregate.pools.map(pool => {
          const poolPercent = pool.totalMatches > 0
            ? Math.round(Math.min(1, pool.completedMatchCount / pool.totalMatches) * 100)
            : 0
          const delayText = formatPoolDelayText(pool)
          const tables = poolProgress?.pools.find(p => p.poolNumber === pool.poolNumber)?.tables ?? []

          return (
            <li
              key={pool.poolNumber}
              data-testid={`pool-dot-${classId}-${pool.poolNumber}`}
              className="grid grid-cols-[8rem_1fr_auto_auto] items-center gap-3 text-xs"
            >
              <span className="font-medium text-ink">
                Pool {pool.poolNumber}
                {tables.length > 0 && (
                  <span
                    data-testid={`pool-tables-${classId}-${pool.poolNumber}`}
                    className="ml-1 font-normal text-muted"
                  >
                    (Bord {tables.join(', ')})
                  </span>
                )}
              </span>
              <span
                className="h-2 overflow-hidden rounded-full bg-stone-200"
                aria-label={`Pool ${pool.poolNumber} framsteg`}
              >
                <span
                  className={`block h-full rounded-full transition-[width] duration-300 ${getPoolBarFillClasses(pool.state)}`}
                  style={{ width: `${poolPercent}%` }}
                />
              </span>
              <span className="tabular-nums text-muted">
                {pool.completedMatchCount}/{pool.totalMatches}
              </span>
              <span className={`min-w-[4rem] text-right font-medium ${getPoolDelayTextClasses(pool.state)}`}>
                {delayText ?? ''}
              </span>
            </li>
          )
        })}
      </ul>

      {staleness.level === 'soft' && staleness.lastSyncAt && (
        <p
          data-testid={`pool-sync-soft-${classId}`}
          className="text-xs text-muted"
        >
          Synkat från ondata {formatStockholmHourMinute(staleness.lastSyncAt)}
        </p>
      )}

      {staleness.level === 'hard' && staleness.lastSyncAt && (
        <p
          data-testid={`pool-sync-stale-${classId}`}
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          OnData-sync har inte gått sedan {formatStockholmHourMinute(staleness.lastSyncAt)} — poolstatus kan vara inaktuell.
        </p>
      )}
    </div>
  )
}
