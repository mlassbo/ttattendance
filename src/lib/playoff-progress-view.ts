import type { PlayoffRoundProgress } from './playoff-progress'

const SWEDISH_LABEL_BY_POSITION: Readonly<Record<number, string>> = {
  0: 'Final',
  1: 'Semifinal',
  2: 'Kvartsfinal',
  3: 'Åttondel',
  4: 'Sextondel',
  5: 'Trettiotvåondelsfinal',
}

export function labelRound(totalRounds: number, roundIndex: number, rawName: string): string {
  const positionFromEnd = totalRounds - 1 - roundIndex
  return SWEDISH_LABEL_BY_POSITION[positionFromEnd] ?? rawName
}

export function computeByesIntoNextRound(
  rounds: ReadonlyArray<PlayoffRoundProgress>,
  roundIndex: number,
): number {
  if (roundIndex < 0 || roundIndex >= rounds.length - 1) {
    return 0
  }

  const expectedInputs = rounds[roundIndex + 1].totalMatches * 2
  const roundMatches = rounds[roundIndex].totalMatches
  return Math.max(0, expectedInputs - roundMatches)
}

export function findActiveRoundIndex(
  rounds: ReadonlyArray<PlayoffRoundProgress>,
): number | null {
  for (let index = 0; index < rounds.length; index += 1) {
    const round = rounds[index]
    if (round.totalMatches > 0 && round.completedMatches < round.totalMatches) {
      return index
    }
  }

  return null
}
