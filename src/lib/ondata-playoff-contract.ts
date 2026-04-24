export const ONDATA_PLAYOFF_SNAPSHOT_SCHEMA_VERSION = 2
export const ONDATA_PLAYOFF_SOURCE_TYPE = 'ondata-stage5-playoff'

type JsonObject = Record<string, unknown>
type OnDataPlayoffBracket = 'A' | 'B'

export type OnDataPlayoffSnapshotPayload = {
  schemaVersion: number
  competitionSlug: string
  source: OnDataPlayoffSnapshotSource
  playoff: OnDataPlayoffSnapshotInfo
  class: OnDataPlayoffSnapshotClass
  parentClass: OnDataPlayoffSnapshotParentClass
  summary: OnDataPlayoffSnapshotSummary
  rounds: OnDataPlayoffSnapshotRound[]
}

export type OnDataPlayoffSnapshotSource = {
  sourceType: string
  competitionUrl: string
  sourceClassId: string
  stage5Path: string
  stage6Path: string | null
  processedAt: string
  fileHash: string
}

export type OnDataPlayoffSnapshotClass = {
  sourceClassId: string
  externalClassKey: string
  className: string
}

export type OnDataPlayoffSnapshotInfo = {
  bracket: OnDataPlayoffBracket
}

export type OnDataPlayoffSnapshotParentClass = {
  sourceClassId: string
  externalClassKey: string
  className: string
  classDate: string
  classTime: string
}

export type OnDataPlayoffSnapshotSummary = {
  rounds: number
  matches: number
  completedMatches: number
}

export type OnDataPlayoffSnapshotRound = {
  name: string
  matches: OnDataPlayoffSnapshotMatch[]
}

export type OnDataPlayoffSnapshotMatch = {
  matchKey: string
  playerA: string
  playerB: string
  winner: string | null
  result: string | null
}

export function parseOnDataPlayoffSnapshotPayload(value: unknown): OnDataPlayoffSnapshotPayload {
  const root = expectObject(value, 'body')

  const payload: OnDataPlayoffSnapshotPayload = {
    schemaVersion: expectNumber(root.schemaVersion, 'schemaVersion'),
    competitionSlug: expectString(root.competitionSlug, 'competitionSlug'),
    source: parseSource(root.source, 'source'),
    playoff: parsePlayoff(root.playoff, 'playoff'),
    class: parseClass(root.class, 'class'),
    parentClass: parseParentClass(root.parentClass, 'parentClass'),
    summary: parseSummary(root.summary, 'summary'),
    rounds: expectArray(root.rounds, 'rounds').map((entry, index) => parseRound(entry, `rounds[${index}]`)),
  }

  if (payload.schemaVersion !== ONDATA_PLAYOFF_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`schemaVersion måste vara ${ONDATA_PLAYOFF_SNAPSHOT_SCHEMA_VERSION}.`)
  }

  if (payload.source.sourceType !== ONDATA_PLAYOFF_SOURCE_TYPE) {
    throw new Error(`source.sourceType måste vara ${ONDATA_PLAYOFF_SOURCE_TYPE}.`)
  }

  const allMatches = payload.rounds.flatMap(round => round.matches)
  if (payload.summary.rounds !== payload.rounds.length) {
    throw new Error('summary.rounds måste matcha antalet rounds.')
  }

  if (payload.summary.matches !== allMatches.length) {
    throw new Error('summary.matches måste matcha antalet matches.')
  }

  const completedMatches = allMatches.filter(isCompletedMatch).length
  if (payload.summary.completedMatches !== completedMatches) {
    throw new Error('summary.completedMatches måste matcha antalet färdigspelade matcher.')
  }

  return payload
}

function parseSource(value: unknown, path: string): OnDataPlayoffSnapshotSource {
  const source = expectObject(value, path)
  return {
    sourceType: expectString(source.sourceType, `${path}.sourceType`),
    competitionUrl: expectString(source.competitionUrl, `${path}.competitionUrl`),
    sourceClassId: expectString(source.sourceClassId, `${path}.sourceClassId`),
    stage5Path: expectString(source.stage5Path, `${path}.stage5Path`),
    stage6Path: expectOptionalString(source.stage6Path, `${path}.stage6Path`),
    processedAt: expectIsoDate(source.processedAt, `${path}.processedAt`),
    fileHash: expectString(source.fileHash, `${path}.fileHash`),
  }
}

function parseClass(value: unknown, path: string): OnDataPlayoffSnapshotClass {
  const entry = expectObject(value, path)
  return {
    sourceClassId: expectString(entry.sourceClassId, `${path}.sourceClassId`),
    externalClassKey: expectString(entry.externalClassKey, `${path}.externalClassKey`),
    className: expectString(entry.className, `${path}.className`),
  }
}

function parsePlayoff(value: unknown, path: string): OnDataPlayoffSnapshotInfo {
  const playoff = expectObject(value, path)
  return {
    bracket: expectBracket(playoff.bracket, `${path}.bracket`),
  }
}

function parseParentClass(value: unknown, path: string): OnDataPlayoffSnapshotParentClass {
  const parentClass = expectObject(value, path)
  return {
    sourceClassId: expectString(parentClass.sourceClassId, `${path}.sourceClassId`),
    externalClassKey: expectString(parentClass.externalClassKey, `${path}.externalClassKey`),
    className: expectString(parentClass.className, `${path}.className`),
    classDate: expectString(parentClass.classDate, `${path}.classDate`),
    classTime: expectString(parentClass.classTime, `${path}.classTime`),
  }
}

function parseSummary(value: unknown, path: string): OnDataPlayoffSnapshotSummary {
  const summary = expectObject(value, path)
  return {
    rounds: expectNumber(summary.rounds, `${path}.rounds`),
    matches: expectNumber(summary.matches, `${path}.matches`),
    completedMatches: expectNumber(summary.completedMatches, `${path}.completedMatches`),
  }
}

function parseRound(value: unknown, path: string): OnDataPlayoffSnapshotRound {
  const round = expectObject(value, path)
  return {
    name: expectString(round.name, `${path}.name`),
    matches: expectArray(round.matches, `${path}.matches`).map((entry, index) => parseMatch(entry, `${path}.matches[${index}]`)),
  }
}

function parseMatch(value: unknown, path: string): OnDataPlayoffSnapshotMatch {
  const match = expectObject(value, path)
  return {
    matchKey: expectString(match.matchKey, `${path}.matchKey`),
    playerA: expectString(match.playerA, `${path}.playerA`),
    playerB: expectString(match.playerB, `${path}.playerB`),
    winner: expectOptionalString(match.winner, `${path}.winner`),
    result: expectOptionalString(match.result, `${path}.result`),
  }
}

function expectBracket(value: unknown, path: string): OnDataPlayoffBracket {
  const bracket = expectString(value, path)
  if (bracket !== 'A' && bracket !== 'B') {
    throw new Error(`${path} måste vara A eller B.`)
  }

  return bracket
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

function isCompletedMatch(match: OnDataPlayoffSnapshotMatch): boolean {
  return match.winner != null || match.result != null
}