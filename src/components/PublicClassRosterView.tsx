import type { PublicSearchClass } from '@/lib/public-competition'

type PublicClassRosterViewProps = {
  classDetails: PublicSearchClass
  showSummaryPills?: boolean
}

export default function PublicClassRosterView({
  classDetails,
  showSummaryPills = true,
}: PublicClassRosterViewProps) {
  return (
    <div className="space-y-4">
      {showSummaryPills ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="app-pill-muted">{classDetails.playerCount} spelare</span>
          {classDetails.reserveList.length > 0 ? (
            <span className="app-pill-muted">
              {classDetails.reserveList.length} på reservlistan
            </span>
          ) : null}
        </div>
      ) : null}

      <section
        data-testid={`public-search-class-roster-${classDetails.id}`}
        className="rounded-2xl border border-line/80 bg-stone-50/70 px-4 py-3"
      >
        {classDetails.players.length > 0 ? (
          <ul className="space-y-2">
            {classDetails.players.map(player => (
              <li
                key={player.id}
                data-testid={`public-search-class-player-${classDetails.id}-${player.id}`}
                className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium text-ink">{player.name}</span>
                {player.club ? <span className="text-sm text-muted">{player.club}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Inga spelare registrerade.</p>
        )}
      </section>

      {classDetails.reserveList.length > 0 ? (
        <section className="rounded-2xl border border-line/80 bg-surface px-4 py-3">
          <p className="text-sm font-semibold text-ink">Reservlista</p>
          <ol className="mt-3 space-y-2">
            {classDetails.reserveList.map(entry => (
              <li
                key={entry.registrationId}
                data-testid={`public-search-class-reserve-${classDetails.id}-${entry.registrationId}`}
                className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium text-ink">
                  {entry.position}. {entry.name}
                </span>
                {entry.club ? <span className="text-sm text-muted">{entry.club}</span> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  )
}
