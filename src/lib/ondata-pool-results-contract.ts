export const ONDATA_POOL_RESULTS_SCHEMA_VERSION = 1
export const ONDATA_POOL_RESULTS_SOURCE_TYPE = 'ondata-stage4'

type JsonObject = Record<string, unknown>

export type OnDataPoolResultsPayload = {
  schemaVersion: number
  competitionSlug: string
  source: OnDataPoolResultsSource
  class: OnDataPoolResultsClass
}

export type OnDataPoolResultsSource = {
  sourceType: string
  fileName: string
  filePath: string
  fileModifiedAt: string
  processedAt: string
  fileHash: string
}

export type OnDataPoolResultsClass = {
  externalClassKey: string
  sourceClassId: string
  className: string
  classDate: string
  classTime: string
  pools: OnDataPoolResultsPool[]
}

export type OnDataPoolResultsPool = {
  poolNumber: number
  standings: OnDataPoolResultsStanding[]
}

export type OnDataPoolResultsStanding = {
  placement: number
  playerName: string
  clubName: string | null
  matchesWon: number
  matchesLost: number
  setsWon: number
  setsLost: number
  pointsFor: number
  pointsAgainst: number
}

export function parseOnDataPoolResultsPayload(value: unknown): OnDataPoolResultsPayload {
  const root = expectObject(value, 'body')

  const payload: OnDataPoolResultsPayload = {
    schemaVersion: expectNumber(root.schemaVersion, 'schemaVersion'),
    competitionSlug: expectString(root.competitionSlug, 'competitionSlug'),
    source: parseSource(root.source, 'source'),
    class: parseClass(root.class, 'class'),
  }

  if (payload.schemaVersion !== ONDATA_POOL_RESULTS_SCHEMA_VERSION) {
    throw new Error(`schemaVersion måste vara ${ONDATA_POOL_RESULTS_SCHEMA_VERSION}.`)
  }

  if (payload.source.sourceType !== ONDATA_POOL_RESULTS_SOURCE_TYPE) {
    throw new Error(`source.sourceType måste vara ${ONDATA_POOL_RESULTS_SOURCE_TYPE}.`)
  }

  return payload
}

function parseSource(value: unknown, path: string): OnDataPoolResultsSource {
  const source = expectObject(value, path)
  return {
    sourceType: expectString(source.sourceType, `${path}.sourceType`),
    fileName: expectString(source.fileName, `${path}.fileName`),
    filePath: expectString(source.filePath, `${path}.filePath`),
    fileModifiedAt: expectIsoDate(source.fileModifiedAt, `${path}.fileModifiedAt`),
    processedAt: expectIsoDate(source.processedAt, `${path}.processedAt`),
    fileHash: expectString(source.fileHash, `${path}.fileHash`),
  }
}

function parseClass(value: unknown, path: string): OnDataPoolResultsClass {
  const entry = expectObject(value, path)
  return {
    externalClassKey: expectString(entry.externalClassKey, `${path}.externalClassKey`),
    sourceClassId: expectString(entry.sourceClassId, `${path}.sourceClassId`),
    className: expectString(entry.className, `${path}.className`),
    classDate: expectString(entry.classDate, `${path}.classDate`),
    classTime: expectString(entry.classTime, `${path}.classTime`),
    pools: expectArray(entry.pools, `${path}.pools`).map((poolEntry, index) => parsePool(poolEntry, `${path}.pools[${index}]`)),
  }
}

function parsePool(value: unknown, path: string): OnDataPoolResultsPool {
  const pool = expectObject(value, path)
  return {
    poolNumber: expectNumber(pool.poolNumber, `${path}.poolNumber`),
    standings: expectArray(pool.standings, `${path}.standings`).map((entry, index) => parseStanding(entry, `${path}.standings[${index}]`)),
  }
}

function parseStanding(value: unknown, path: string): OnDataPoolResultsStanding {
  const standing = expectObject(value, path)
  return {
    placement: expectNumber(standing.placement, `${path}.placement`),
    playerName: expectString(standing.playerName, `${path}.playerName`),
    clubName: expectOptionalString(standing.clubName, `${path}.clubName`),
    matchesWon: expectNumber(standing.matchesWon, `${path}.matchesWon`),
    matchesLost: expectNumber(standing.matchesLost, `${path}.matchesLost`),
    setsWon: expectNumber(standing.setsWon, `${path}.setsWon`),
    setsLost: expectNumber(standing.setsLost, `${path}.setsLost`),
    pointsFor: expectNumber(standing.pointsFor, `${path}.pointsFor`),
    pointsAgainst: expectNumber(standing.pointsAgainst, `${path}.pointsAgainst`),
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

function expectIsoDate(value: unknown, path: string): string {
  const stringValue = expectString(value, path)
  if (Number.isNaN(Date.parse(stringValue))) {
    throw new Error(`${path} måste vara ett giltigt datum.`)
  }

  return stringValue
}