export type ParsedMatchResult =
  | { kind: 'score'; setScoreA: number; setScoreB: number }
  | { kind: 'walkover' }

const INTEGER_TOKEN_PATTERN = /^[+-]?\d+$/

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

    const parsedToken = Number(normalizedToken)
    if (Object.is(parsedToken, 0) || Object.is(parsedToken, -0)) {
      return null
    }

    tokenCount += 1
    if (parsedToken > 0) {
      setScoreA += 1
    } else {
      setScoreB += 1
    }
  }

  if (tokenCount === 0) {
    return null
  }

  return { kind: 'score', setScoreA, setScoreB }
}
