'use client'

import type { BracketProgress, PlayoffBracketCode, PlayoffProgress } from '@/lib/playoff-progress'
import {
  findActiveRoundIndex,
  labelRound,
} from '@/lib/playoff-progress-view'
import { computeSyncStaleness, formatStockholmHourMinute } from '@/lib/sync-staleness'

type PlayoffProgressStripProps = {
  classId: string
  progress: PlayoffProgress | null
  now: Date
}

const BRACKET_LABEL: Record<PlayoffBracketCode, string> = {
  A: 'A-slutspel',
  B: 'B-slutspel',
}

function BracketBlock({
  classId,
  bracket,
}: {
  classId: string
  bracket: BracketProgress
}) {
  const bracketKey = bracket.bracket.toLowerCase() as 'a' | 'b'
  const activeRoundIndex = findActiveRoundIndex(bracket.rounds)
  const allComplete =
    bracket.totalMatches > 0 && bracket.completedMatches >= bracket.totalMatches

  return (
    <div
      data-testid={`playoff-bracket-block-${classId}-${bracketKey}`}
      className="space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{BRACKET_LABEL[bracket.bracket]}</p>
        <p className="text-sm text-muted">
          {allComplete ? '✓ ' : ''}
          {bracket.completedMatches} / {bracket.totalMatches} matcher
        </p>
      </div>

      <ul className="space-y-1.5">
        {bracket.rounds.map((round, index) => {
          const isActive = index === activeRoundIndex
          const isComplete = round.totalMatches > 0 && round.completedMatches >= round.totalMatches
          const isFuture = !isActive && !isComplete && activeRoundIndex !== null && index > activeRoundIndex
          const label = labelRound(bracket.rounds.length, index, round.name)
          const barRatio =
            round.totalMatches > 0 ? Math.min(1, round.completedMatches / round.totalMatches) : 0
          const barPercent = Math.round(barRatio * 100)

          return (
            <li
              key={`${index}-${round.name}`}
              data-testid={`playoff-round-${classId}-${bracketKey}-${index}`}
              className={`grid grid-cols-[9rem_1fr_auto_auto] items-center gap-3 text-xs ${
                isFuture ? 'opacity-50' : ''
              }`}
            >
              <span className="font-medium text-ink truncate">
                {label}
              </span>
              <span
                className="h-2 overflow-hidden rounded-full bg-stone-200"
                aria-label={`${label} framsteg`}
              >
                <span
                  className={`block h-full rounded-full transition-[width] duration-300 ${
                    isComplete ? 'bg-green-500' : 'bg-brand'
                  }`}
                  style={{ width: `${barPercent}%` }}
                />
              </span>
              <span className="tabular-nums text-muted">
                {round.completedMatches}/{round.totalMatches}
              </span>
              <span className="min-w-[3.5rem] text-right">
                {isComplete && !isActive && (
                  <span className="text-green-700">✓</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function PlayoffProgressStrip({
  classId,
  progress,
  now,
}: PlayoffProgressStripProps) {
  const hasAnyBracket = !!progress && (progress.a != null || progress.b != null)

  if (!hasAnyBracket) {
    return (
      <div
        data-testid={`playoff-progress-strip-${classId}`}
        className="w-full max-w-xl rounded-2xl border border-line/70 bg-stone-50/80 px-4 py-3 text-sm text-muted"
      >
        Inväntar slutspelsdata
      </div>
    )
  }

  const staleness = computeSyncStaleness({
    lastSyncAt: progress!.lastSourceProcessedAt,
    now,
  })

  return (
    <div
      data-testid={`playoff-progress-strip-${classId}`}
      className="w-full max-w-xl space-y-4 rounded-2xl border border-line/70 bg-stone-50/80 px-4 py-3"
    >
      {progress!.a && <BracketBlock classId={classId} bracket={progress!.a} />}
      {progress!.b && <BracketBlock classId={classId} bracket={progress!.b} />}

      {staleness.level === 'soft' && staleness.lastSyncAt && (
        <p
          data-testid={`playoff-sync-soft-${classId}`}
          className="text-xs text-muted"
        >
          Data från {formatStockholmHourMinute(staleness.lastSyncAt)}
        </p>
      )}

      {staleness.level === 'hard' && staleness.lastSyncAt && (
        <p
          data-testid={`playoff-sync-stale-${classId}`}
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          OnData-sync har inte gått sedan {formatStockholmHourMinute(staleness.lastSyncAt)} — slutspelsstatus kan vara inaktuell.
        </p>
      )}
    </div>
  )
}
