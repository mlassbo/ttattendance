import type {
  ClassLivePlayoffBracket,
  ClassLivePlayoffData,
  ClassLivePlayoffMatch,
  ClassLivePlayoffRound,
} from '@/lib/public-competition'

type ClassPlayoffViewProps = {
  playoff: ClassLivePlayoffData
}

export default function ClassPlayoffView({ playoff }: ClassPlayoffViewProps) {
  const brackets = [playoff.a, playoff.b].filter(
    (bracket): bracket is ClassLivePlayoffBracket => bracket !== null,
  )
  const showBracketHeadings = brackets.length > 1

  return (
    <div data-testid="class-playoff-view" className="space-y-8">
      {brackets.map(bracket => (
        <PlayoffBracketSection
          key={bracket.bracket}
          bracket={bracket}
          showHeading={showBracketHeadings}
        />
      ))}
    </div>
  )
}

function PlayoffBracketSection({
  bracket,
  showHeading,
}: {
  bracket: ClassLivePlayoffBracket
  showHeading: boolean
}) {
  const heading = bracket.bracket === 'A' ? 'A-slutspel' : 'B-slutspel'

  return (
    <section
      data-testid={`class-playoff-bracket-${bracket.bracket}`}
      className="space-y-5"
    >
      {showHeading ? (
        <h2 className="text-base font-semibold text-ink">{heading}</h2>
      ) : null}
      <div className="space-y-5">
        {bracket.rounds.map((round, roundIndex) => (
          <PlayoffRoundSection
            key={`${bracket.bracket}-${roundIndex}-${round.name}`}
            bracketCode={bracket.bracket}
            roundIndex={roundIndex}
            round={round}
          />
        ))}
      </div>
    </section>
  )
}

function PlayoffRoundSection({
  bracketCode,
  roundIndex,
  round,
}: {
  bracketCode: 'A' | 'B'
  roundIndex: number
  round: ClassLivePlayoffRound
}) {
  return (
    <section
      data-testid={`class-playoff-round-${bracketCode}-${roundIndex}`}
      className="space-y-2"
    >
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {round.name}
      </h3>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {round.matches.map((match, matchIndex) => (
          <PlayoffMatchRow
            key={`${bracketCode}-${roundIndex}-${matchIndex}-${match.playerAName}-${match.playerBName}`}
            bracketCode={bracketCode}
            roundIndex={roundIndex}
            matchIndex={matchIndex}
            match={match}
          />
        ))}
      </ul>
    </section>
  )
}

function PlayoffMatchRow({
  bracketCode,
  roundIndex,
  matchIndex,
  match,
}: {
  bracketCode: 'A' | 'B'
  roundIndex: number
  matchIndex: number
  match: ClassLivePlayoffMatch
}) {
  const playerAIsWinner = match.winnerName != null && match.winnerName === match.playerAName
  const playerBIsWinner = match.winnerName != null && match.winnerName === match.playerBName

  return (
    <li
      data-testid={`class-playoff-match-${bracketCode}-${roundIndex}-${matchIndex}`}
      className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
    >
      <div className="min-w-0 space-y-1">
        <PlayoffPlayerLine name={match.playerAName} isWinner={playerAIsWinner} />
        <PlayoffPlayerLine name={match.playerBName} isWinner={playerBIsWinner} />
      </div>
      <PlayoffMatchStatus match={match} />
    </li>
  )
}

function PlayoffPlayerLine({ name, isWinner }: { name: string; isWinner: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <WinnerMarker visible={isWinner} />
      <p className={isWinner ? 'font-semibold text-ink' : 'text-muted'}>{name}</p>
    </div>
  )
}

function WinnerMarker({ visible }: { visible: boolean }) {
  if (!visible) {
    return <span aria-hidden="true" className="h-4 w-4 shrink-0" />
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-emerald-600"
    >
      <path d="M5 10l4 4 7-8" />
    </svg>
  )
}

function PlayoffMatchStatus({ match }: { match: ClassLivePlayoffMatch }) {
  if (!match.isPlayed) {
    return (
      <span className="shrink-0 text-xs font-medium text-muted">
        Ej spelad än
      </span>
    )
  }

  if (match.isWalkover) {
    return (
      <span className="shrink-0 rounded-full bg-slate-700 px-2.5 py-1 text-xs font-semibold text-white">
        WO
      </span>
    )
  }

  if (match.setScoreA != null && match.setScoreB != null) {
    return (
      <span className="shrink-0 rounded-full bg-slate-700 px-2.5 py-1 text-xs font-semibold tabular-nums text-white">
        {match.setScoreA}&ndash;{match.setScoreB}
      </span>
    )
  }

  const trimmedRaw = match.rawResult?.trim() ?? ''
  if (trimmedRaw.length > 0) {
    return (
      <span className="shrink-0 rounded-full bg-slate-700 px-2.5 py-1 text-xs font-semibold text-white">
        {trimmedRaw}
      </span>
    )
  }

  return (
    <span className="shrink-0 text-xs font-medium text-muted">
      Ej spelad än
    </span>
  )
}
