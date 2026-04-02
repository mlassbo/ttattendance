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
    <div className="text-right shrink-0">
      <div
        data-testid="auto-refresh-status"
        className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"
      >
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full ${isRefreshing ? 'animate-pulse bg-emerald-600' : 'bg-emerald-500'}`}
        />
        {isRefreshing
          ? 'Uppdaterar nu'
          : `Automatisk uppdatering aktiv var ${intervalSeconds}:e sekund`}
      </div>
      <p data-testid="auto-refresh-next" className="mt-1 text-xs text-gray-500">
        {isRefreshing ? 'Hämtar senaste närvarodata...' : nextRefreshLabel}
      </p>
      {updatedAt && (
        <p data-testid="auto-refresh-updated-at" className="text-xs text-gray-400">
          Senast uppdaterad: {updatedAt.toLocaleTimeString('sv-SE')}
        </p>
      )}
    </div>
  )
}