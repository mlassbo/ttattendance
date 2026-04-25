type JsonObject = Record<string, unknown>

export const ONDATA_ROSTER_SNAPSHOT_SCHEMA_VERSION = 1
export const ONDATA_ROSTER_SOURCE_TYPE = 'ondata-stage1'

export type OnDataRosterSnapshotPayload = {
  schemaVersion: number
  competitionSlug: string
  source: OnDataRosterSnapshotSource
  summary: OnDataRosterSnapshotSummary
  classes: OnDataRosterSnapshotClass[]
}

export type OnDataRosterSnapshotSource = {
  sourceType: string
  fileName: string
  filePath: string
  fileModifiedAt: string
  processedAt: string
  fileHash: string
}

export type OnDataRosterSnapshotSummary = {
  classes: number
  players: number
  registrations: number
}

export type OnDataRosterSnapshotClass = {
  externalClassKey: string
  sourceClassId: string | null
  className: string
  classDate: string | null
  classTime: string | null
  startAt: string | null
  registrations: OnDataRosterSnapshotRegistration[]
}

export type OnDataRosterSnapshotRegistration = {
  playerName: string
  clubName: string
}

export function parseOnDataRosterSnapshotPayload(value: unknown): OnDataRosterSnapshotPayload {
  const root = expectObject(value, 'body')

  const payload: OnDataRosterSnapshotPayload = {
    schemaVersion: expectNumber(root.schemaVersion, 'schemaVersion'),
    competitionSlug: expectString(root.competitionSlug, 'competitionSlug'),
    source: parseSource(root.source, 'source'),
    summary: parseSummary(root.summary, 'summary'),
    classes: expectArray(root.classes, 'classes').map((entry, index) => parseClass(entry, `classes[${index}]`)),
  }

  if (payload.schemaVersion !== ONDATA_ROSTER_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`schemaVersion måste vara ${ONDATA_ROSTER_SNAPSHOT_SCHEMA_VERSION}.`)
  }

  if (payload.source.sourceType !== ONDATA_ROSTER_SOURCE_TYPE) {
    throw new Error(`source.sourceType måste vara ${ONDATA_ROSTER_SOURCE_TYPE}.`)
  }

  const actualClassCount = payload.classes.length
  const actualRegistrationCount = payload.classes.reduce((total, classRow) => total + classRow.registrations.length, 0)
  const actualPlayerCount = new Set(
    payload.classes.flatMap(classRow => classRow.registrations.map(registration => `${registration.playerName}::${registration.clubName}`)),
  ).size

  if (payload.summary.classes !== actualClassCount) {
    throw new Error('summary.classes stämmer inte med antal klasser i payloaden.')
  }

  if (payload.summary.registrations !== actualRegistrationCount) {
    throw new Error('summary.registrations stämmer inte med antal anmälningar i payloaden.')
  }

  if (payload.summary.players !== actualPlayerCount) {
    throw new Error('summary.players stämmer inte med antal unika spelare i payloaden.')
  }

  return payload
}

function parseSource(value: unknown, path: string): OnDataRosterSnapshotSource {
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

function parseSummary(value: unknown, path: string): OnDataRosterSnapshotSummary {
  const summary = expectObject(value, path)
  return {
    classes: expectNumber(summary.classes, `${path}.classes`),
    players: expectNumber(summary.players, `${path}.players`),
    registrations: expectNumber(summary.registrations, `${path}.registrations`),
  }
}

function parseClass(value: unknown, path: string): OnDataRosterSnapshotClass {
  const entry = expectObject(value, path)
  const startAt = expectOptionalIsoDate(entry.startAt, `${path}.startAt`)
  const classDate = expectOptionalDateOnly(entry.classDate, `${path}.classDate`)

  if (!startAt && !classDate) {
    throw new Error(`${path}.classDate måste finnas när startAt saknas.`)
  }

  return {
    externalClassKey: expectString(entry.externalClassKey, `${path}.externalClassKey`),
    sourceClassId: expectOptionalString(entry.sourceClassId, `${path}.sourceClassId`),
    className: expectString(entry.className, `${path}.className`),
    classDate,
    classTime: expectOptionalString(entry.classTime, `${path}.classTime`),
    startAt,
    registrations: expectArray(entry.registrations, `${path}.registrations`).map((registration, index) =>
      parseRegistration(registration, `${path}.registrations[${index}]`),
    ),
  }
}

function parseRegistration(value: unknown, path: string): OnDataRosterSnapshotRegistration {
  const registration = expectObject(value, path)
  return {
    playerName: expectString(registration.playerName, `${path}.playerName`),
    clubName: expectString(registration.clubName, `${path}.clubName`),
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

function expectOptionalIsoDate(value: unknown, path: string): string | null {
  if (value == null) {
    return null
  }

  return expectIsoDate(value, path)
}

function expectOptionalDateOnly(value: unknown, path: string): string | null {
  const stringValue = expectOptionalString(value, path)
  if (stringValue === null) {
    return null
  }

  const parsed = new Date(`${stringValue}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stringValue)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== stringValue) {
    throw new Error(`${path} måste vara ett giltigt datum i formatet yyyy-mm-dd.`)
  }

  return stringValue
}
