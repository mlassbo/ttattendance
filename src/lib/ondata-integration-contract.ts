export const ONDATA_SNAPSHOT_SCHEMA_VERSION = 1

type JsonObject = Record<string, unknown>

export type OnDataSnapshotPayload = {
  schemaVersion: number
  competitionSlug: string
  source: OnDataSnapshotSource
  summary: OnDataSnapshotSummary
  classes: OnDataSnapshotClass[]
}

export type OnDataSnapshotSource = {
  fileName: string
  filePath: string
  fileModifiedAt: string
  copiedToTempAt: string
  processedAt: string
  fileHash: string
}

export type OnDataSnapshotSummary = {
  classes: number
  pools: number
  completedMatches: number
}

export type OnDataSnapshotClass = {
  externalClassKey: string
  className: string
  classDate: string
  classTime: string
  pools: OnDataSnapshotPool[]
}

export type OnDataSnapshotPool = {
  poolNumber: number
  completedMatchCount: number
  players: OnDataSnapshotPlayer[]
  matches: OnDataSnapshotMatch[]
}

export type OnDataSnapshotPlayer = {
  name: string
  club: string | null
}

export type OnDataSnapshotMatch = {
  matchNumber: number | null
  playerA: OnDataSnapshotPlayer | null
  playerB: OnDataSnapshotPlayer | null
  result: string | null
}

export function parseOnDataSnapshotPayload(value: unknown): OnDataSnapshotPayload {
  const root = expectObject(value, 'body')

  const payload: OnDataSnapshotPayload = {
    schemaVersion: expectNumber(root.schemaVersion, 'schemaVersion'),
    competitionSlug: expectString(root.competitionSlug, 'competitionSlug'),
    source: parseSource(root.source, 'source'),
    summary: parseSummary(root.summary, 'summary'),
    classes: expectArray(root.classes, 'classes').map((entry, index) => parseClass(entry, `classes[${index}]`)),
  }

  if (payload.schemaVersion !== ONDATA_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`schemaVersion måste vara ${ONDATA_SNAPSHOT_SCHEMA_VERSION}.`)
  }

  return payload
}

function parseSource(value: unknown, path: string): OnDataSnapshotSource {
  const source = expectObject(value, path)
  return {
    fileName: expectString(source.fileName, `${path}.fileName`),
    filePath: expectString(source.filePath, `${path}.filePath`),
    fileModifiedAt: expectIsoDate(source.fileModifiedAt, `${path}.fileModifiedAt`),
    copiedToTempAt: expectIsoDate(source.copiedToTempAt, `${path}.copiedToTempAt`),
    processedAt: expectIsoDate(source.processedAt, `${path}.processedAt`),
    fileHash: expectString(source.fileHash, `${path}.fileHash`),
  }
}

function parseSummary(value: unknown, path: string): OnDataSnapshotSummary {
  const summary = expectObject(value, path)
  return {
    classes: expectNumber(summary.classes, `${path}.classes`),
    pools: expectNumber(summary.pools, `${path}.pools`),
    completedMatches: expectNumber(summary.completedMatches, `${path}.completedMatches`),
  }
}

function parseClass(value: unknown, path: string): OnDataSnapshotClass {
  const entry = expectObject(value, path)
  return {
    externalClassKey: expectString(entry.externalClassKey, `${path}.externalClassKey`),
    className: expectString(entry.className, `${path}.className`),
    classDate: expectString(entry.classDate, `${path}.classDate`),
    classTime: expectString(entry.classTime, `${path}.classTime`),
    pools: expectArray(entry.pools, `${path}.pools`).map((pool, index) => parsePool(pool, `${path}.pools[${index}]`)),
  }
}

function parsePool(value: unknown, path: string): OnDataSnapshotPool {
  const pool = expectObject(value, path)
  return {
    poolNumber: expectNumber(pool.poolNumber, `${path}.poolNumber`),
    completedMatchCount: expectNumber(pool.completedMatchCount, `${path}.completedMatchCount`),
    players: expectArray(pool.players, `${path}.players`).map((player, index) => parsePlayer(player, `${path}.players[${index}]`)),
    matches: expectArray(pool.matches, `${path}.matches`).map((match, index) => parseMatch(match, `${path}.matches[${index}]`)),
  }
}

function parsePlayer(value: unknown, path: string): OnDataSnapshotPlayer {
  const player = expectObject(value, path)
  return {
    name: expectString(player.name, `${path}.name`),
    club: expectOptionalString(player.club, `${path}.club`),
  }
}

function parseMatch(value: unknown, path: string): OnDataSnapshotMatch {
  const match = expectObject(value, path)
  return {
    matchNumber: expectOptionalNumber(match.matchNumber, `${path}.matchNumber`),
    playerA: match.playerA == null ? null : parsePlayer(match.playerA, `${path}.playerA`),
    playerB: match.playerB == null ? null : parsePlayer(match.playerB, `${path}.playerB`),
    result: expectOptionalString(match.result, `${path}.result`),
  }
}

function expectObject(value: unknown, path: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} måste vara ett objekt.`)
  }

  return value as JsonObject
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} måste vara en lista.`)
  }

  return value
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path} måste vara en icke-tom sträng.`)
  }

  return value.trim()
}

function expectOptionalString(value: unknown, path: string): string | null {
  if (value == null) {
    return null
  }

  if (typeof value !== 'string') {
    throw new Error(`${path} måste vara en sträng eller null.`)
  }

  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} måste vara ett tal.`)
  }

  return value
}

function expectOptionalNumber(value: unknown, path: string): number | null {
  if (value == null) {
    return null
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} måste vara ett tal eller null.`)
  }

  return value
}

function expectIsoDate(value: unknown, path: string): string {
  const stringValue = expectString(value, path)
  if (Number.isNaN(Date.parse(stringValue))) {
    throw new Error(`${path} måste vara ett giltigt datum.`)
  }

  return stringValue
}
