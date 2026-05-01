'use client'

import { formatStockholmHourMinute } from '@/lib/sync-staleness'

type BlockingPlayer = {
  playerName: string
  playerClub: string | null
  otherClassId: string
  otherClassName: string
  otherPhaseKey: string
  otherPhaseLabel: string
}

export type StartReadinessPayload = {
  visible: boolean
  tablesRequired: number | null
  tablesInUse: number
  freeTables: number | null
  syncLevel: 'fresh' | 'soft' | 'hard' | 'awaiting_data'
  syncLastAt: string | null
  blockingPlayers: BlockingPlayer[]
  blockingPlayersTruncated: number
}

type StartReadinessStripProps = {
  classId: string
  readiness: StartReadinessPayload
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return formatStockholmHourMinute(date)
}

export default function StartReadinessStrip({ classId, readiness }: StartReadinessStripProps) {
  const { tablesRequired, freeTables, syncLevel, syncLastAt } = readiness

  const showFreeTablesLine = freeTables !== null
  const showVenueCapHint = freeTables === null
  const isHardStale = syncLevel === 'hard'
  const isSoftStale = syncLevel === 'soft'
  const isAwaitingData = syncLevel === 'awaiting_data'

  const freeTablesDisplay = isHardStale || isAwaitingData ? '?' : `${freeTables} st`
  const blockingCount = readiness.blockingPlayers.length + readiness.blockingPlayersTruncated

  return (
    <div
      data-testid={`start-readiness-strip-${classId}`}
      className="w-full max-w-xl space-y-2 rounded-2xl border border-line/70 bg-stone-50/80 px-4 py-3"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
        Redo att starta?
      </p>

      <div className="space-y-1 text-sm text-ink">
        {tablesRequired !== null ? (
          <p data-testid={`start-readiness-tables-required-${classId}`}>
            Kräver {tablesRequired} {tablesRequired === 1 ? 'bord' : 'bord'}
          </p>
        ) : (
          <p
            data-testid={`start-readiness-no-players-per-pool-${classId}`}
            className="text-muted"
          >
            (antal spelare per pool saknas)
          </p>
        )}

        {showFreeTablesLine && (
          <p data-testid={`start-readiness-tables-free-${classId}`}>
            Lediga bord just nu: ca {freeTablesDisplay}
          </p>
        )}

        {showVenueCapHint && (
          <p
            data-testid={`start-readiness-no-venue-cap-${classId}`}
            className="text-muted"
          >
            Sätt antal bord på tävlingen i superadmin för att se lediga bord.
          </p>
        )}
      </div>

      <div className="space-y-1 text-sm">
        {blockingCount === 0 ? (
          <p
            data-testid={`start-readiness-overlap-summary-${classId}`}
            className="text-green-700"
          >
            ✓ Inga spelare aktiva i andra klasser
          </p>
        ) : (
          <>
            <p
              data-testid={`start-readiness-overlap-summary-${classId}`}
              className="font-semibold text-amber-900"
            >
              ⚠ {blockingCount} {blockingCount === 1 ? 'spelare aktiv' : 'spelare aktiva'} i andra klasser:
            </p>
            <ul className="space-y-1">
              {readiness.blockingPlayers.map((player, index) => (
                <li
                  key={`${player.playerName}-${player.otherClassId}`}
                  data-testid={`start-readiness-overlap-player-${classId}-${index}`}
                  className="text-amber-900"
                >
                  · {player.playerName}
                  {player.playerClub ? ` (${player.playerClub})` : ''}
                  {' — '}
                  {player.otherClassName}, {player.otherPhaseLabel.toLowerCase()}
                </li>
              ))}
            </ul>
            {readiness.blockingPlayersTruncated > 0 && (
              <p
                data-testid={`start-readiness-overlap-truncated-${classId}`}
                className="text-xs text-muted"
              >
                +{readiness.blockingPlayersTruncated} fler
              </p>
            )}
          </>
        )}
      </div>

      {isSoftStale && syncLastAt && (
        <p
          data-testid={`start-readiness-sync-soft-${classId}`}
          className="text-xs text-muted"
        >
          Synkat från ondata {formatSyncTime(syncLastAt)}
        </p>
      )}

      {isHardStale && syncLastAt && (
        <p
          data-testid={`start-readiness-sync-hard-${classId}`}
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          OnData-sync har inte gått sedan {formatSyncTime(syncLastAt)} — antal lediga bord kan vara inaktuellt.
        </p>
      )}
    </div>
  )
}
