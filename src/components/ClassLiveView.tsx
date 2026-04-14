import type { ClassLivePool } from '@/lib/public-competition'

type ClassLiveViewProps = {
  pools: ClassLivePool[]
}

export default function ClassLiveView({ pools }: ClassLiveViewProps) {
  return (
    <div
      data-testid="class-live-view"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {pools.map(pool => (
        <section
          key={pool.poolNumber}
          data-testid={`class-live-pool-${pool.poolNumber}`}
          className="rounded-2xl border border-line/80 bg-stone-50/70 px-4 py-4"
        >
          <h2 className="text-base font-semibold text-ink">Pool {pool.poolNumber}</h2>

          <ul className="mt-3 space-y-2">
            {pool.players.map((player, index) => (
              <li key={`${pool.poolNumber}-${index}-${player.name}`} className="text-sm text-ink">
                <span className="font-medium">{player.name}</span>
                {player.club ? <span className="text-muted"> · {player.club}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
