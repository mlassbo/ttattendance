'use client'

interface AutoRefreshStatusProps {
  intervalSeconds: number
  isRefreshing: boolean
  updatedAt: Date | null
  secondsUntilNextRefresh: number | null
}

export default function AutoRefreshStatus({
  intervalSeconds,
  isRefreshing,
  updatedAt,
  secondsUntilNextRefresh,
}: AutoRefreshStatusProps) {
  const nextRefreshLabel =
    secondsUntilNextRefresh === null
      ? 'Väntar på första uppdateringen'
      : `Nästa uppdatering om ${secondsUntilNextRefresh} s`

  return (
    <div className="shrink-0 text-right">
      <div
        data-testid="auto-refresh-status"
        className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm"
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${isRefreshing ? 'animate-pulse bg-sky-500' : 'bg-slate-400'}`}
        />
        {isRefreshing
          ? 'Uppdaterar nu'
          : `Automatisk uppdatering var ${intervalSeconds}:e sekund`}
      </div>
      <p data-testid="auto-refresh-next" className="mt-1 text-xs text-muted">
        {isRefreshing ? 'Hämtar senaste närvarodata...' : nextRefreshLabel}
      </p>
      {updatedAt && (
        <p data-testid="auto-refresh-updated-at" className="text-xs text-muted/80">
          Senast uppdaterad: {updatedAt.toLocaleTimeString('sv-SE')}
        </p>
      )}
    </div>
  )
}