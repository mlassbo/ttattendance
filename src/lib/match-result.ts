export type ParsedMatchResult =
  | { kind: 'score'; setScoreA: number; setScoreB: number }
  | { kind: 'walkover' }

const INTEGER_TOKEN_PATTERN = /^[+-]?\d+$/

function isNegativeIntegerToken(token: string): boolean {
  return token.startsWith('-')
}

export function parseMatchResult(raw: string | null): ParsedMatchResult | null {
  if (!raw) {
    return null
  }

  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.toUpperCase() === 'WO') {
    return { kind: 'walkover' }
  }

  if (!/\d/.test(trimmed)) {
    return null
  }

  let setScoreA = 0
  let setScoreB = 0
  let tokenCount = 0

  for (const token of trimmed.split(',')) {
    const normalizedToken = token.trim()

    if (!INTEGER_TOKEN_PATTERN.test(normalizedToken)) {
      return null
    }

    tokenCount += 1
    if (isNegativeIntegerToken(normalizedToken)) {
      setScoreB += 1
    } else {
      setScoreA += 1
    }
  }

  if (tokenCount === 0) {
    return null
  }

  return { kind: 'score', setScoreA, setScoreB }
}
