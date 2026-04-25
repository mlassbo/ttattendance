import type { PlayoffRoundProgress } from './playoff-progress'

const SWEDISH_LABEL_BY_POSITION: Readonly<Record<number, string>> = {
  0: 'Final',
  1: 'Semifinal',
  2: 'Kvartsfinal',
  3: 'Åttondel',
  4: 'Sextondel',
  5: 'Trettiotvåondelsfinal',
}

const ROUND_NAME_PATTERNS: ReadonlyArray<{ pattern: RegExp; positionFromEnd: number }> = [
  { pattern: /^final(?:en)?$/i, positionFromEnd: 0 },
  { pattern: /^semi\s*final(?:er|s)?$/i, positionFromEnd: 1 },
  { pattern: /^semifinal(?:er)?$/i, positionFromEnd: 1 },
  { pattern: /^quarter\s*final(?:s)?$/i, positionFromEnd: 2 },
  { pattern: /^kvartsfinal(?:er)?$/i, positionFromEnd: 2 },
  { pattern: /^åttondel(?:sfinal)?(?:er)?$/i, positionFromEnd: 3 },
  { pattern: /^sextondel(?:sfinal)?(?:er)?$/i, positionFromEnd: 4 },
  { pattern: /^trettiotvåondel(?:sfinal)?(?:er)?$/i, positionFromEnd: 5 },
]

function getPositionFromExplicitRoundName(rawName: string): number | null {
  const trimmedName = rawName.trim()
  if (trimmedName.length === 0) return null

  const roundOfMatch = trimmedName.match(/^round\s+of\s+(\d+)$/i)
  if (roundOfMatch) {
    const playerCount = Number.parseInt(roundOfMatch[1] ?? '', 10)
    if (Number.isFinite(playerCount) && playerCount >= 2) {
      const positionFromEnd = Math.log2(playerCount) - 1
      if (Number.isInteger(positionFromEnd)) {
        return positionFromEnd
      }
    }
  }

  for (const entry of ROUND_NAME_PATTERNS) {
    if (entry.pattern.test(trimmedName)) {
      return entry.positionFromEnd
    }
  }

  return null
}

export function labelRound(totalRounds: number, roundIndex: number, rawName: string): string {
  const explicitPosition = getPositionFromExplicitRoundName(rawName)
  if (explicitPosition !== null) {
    return SWEDISH_LABEL_BY_POSITION[explicitPosition] ?? rawName
  }

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
