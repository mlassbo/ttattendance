export function getEstimatedPoolCount(
  confirmedPlayers: number,
  playersPerPool: number | null,
): number | null {
  if (!Number.isInteger(confirmedPlayers) || confirmedPlayers < 0) {
    return null
  }

  if (!Number.isInteger(playersPerPool) || playersPerPool === null || playersPerPool < 1) {
    return null
  }

  if (confirmedPlayers === 0) {
    return 0
  }

  return Math.ceil(confirmedPlayers / playersPerPool)
}

export function getSeededPlayerCount(poolCount: number): number {
  if (!Number.isInteger(poolCount) || poolCount < 2) {
    return 0
  }

  return 2 ** Math.floor(Math.log2(poolCount))
}
