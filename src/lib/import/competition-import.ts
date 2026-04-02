import type { SupabaseClient } from '@supabase/supabase-js'

const SCHEDULE_LINE_RE = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+\(\d+\s+anm[aä]lda\)$/i
const STOCKHOLM_TIME_ZONE = 'Europe/Stockholm'
const ATTENDANCE_DEADLINE_MINUTES = 45
const SESSION_NUMBERS = [1, 2, 3] as const

type AttendanceStatus = 'confirmed' | 'absent'
type SessionNumber = (typeof SESSION_NUMBERS)[number]

type ParsedSourceLine = {
  raw: string
  collapsed: string
  lineNumber: number
}

type ExistingSession = {
  id: string
  competition_id: string
  name: string
  date: string
  session_order: number
}

type SessionSlot = {
  session: ExistingSession
  sessionNumber: number
}

type ExistingClass = {
  id: string
  session_id: string
  name: string
  start_time: string
  attendance_deadline: string
}

type ExistingPlayer = {
  id: string
  competition_id: string
  name: string
  club: string | null
}

type ExistingRegistrationRow = {
  id: string
  player_id: string
  class_id: string
  attendance: { status?: AttendanceStatus } | Array<{ status?: AttendanceStatus }> | null
}

type ExistingRegistration = {
  id: string
  playerId: string
  classId: string
  key: string
  playerName: string
  clubName: string
  className: string
  classDate: string
  classTime: string
  attendanceStatus: AttendanceStatus | null
}

type CompetitionState = {
  sessions: ExistingSession[]
  classes: ExistingClass[]
  players: ExistingPlayer[]
  registrations: ExistingRegistration[]
}

type ImportPlanAddRow = CompetitionImportDiffRow & {
  classKey: string
  playerKey: string
}

type ImportPlanRemoveRow = CompetitionImportDiffRow & {
  registrationId: string
  playerId: string
  classKey: string
  playerKey: string
}

type PreparedCompetitionImport = {
  parsed: CompetitionImportParseResult
  preview: CompetitionImportPreview
  state: CompetitionState
  toAdd: ImportPlanAddRow[]
  toRemove: ImportPlanRemoveRow[]
}

type SessionSlotPlan = {
  slot_key: string
  date: string
  session_number: SessionNumber
  existing_session_id: string | null
}

type ClassPlan = {
  class_key: string
  existing_class_id: string | null
  class_name: string
  start_time: string
  attendance_deadline: string
  session_slot_key: string
}

type PlayerPlan = {
  player_key: string
  existing_player_id: string | null
  player_name: string
  club_name: string
}

type CompetitionImportSessionAssignmentValidation = {
  byClassKey: Map<string, SessionNumber>
  errors: string[]
}

export type CompetitionImportDiffRow = {
  className: string
  classDate: string
  classTime: string
  playerName: string
  clubName: string
  attendanceStatus?: AttendanceStatus | null
}

export type CompetitionImportSessionOption = {
  sessionNumber: SessionNumber
  sessionId: string | null
  exists: boolean
}

export type CompetitionImportClassSessionPrompt = {
  classKey: string
  className: string
  classDate: string
  classTime: string
  existingClassId: string | null
  currentSessionNumber: number | null
  suggestedSessionNumber: SessionNumber
  defaultSessionNumber: number | null
  options: CompetitionImportSessionOption[]
}

export type CompetitionImportClassSessionAssignment = {
  classKey: string
  sessionNumber: number
}

export type CompetitionImportPreview = {
  competitionTitleFromSource: string | null
  summary: {
    classesParsed: number
    playersParsed: number
    registrationsParsed: number
    registrationsToAdd: number
    registrationsToRemove: number
    registrationsToRemoveWithAttendance: number
  }
  warnings: string[]
  errors: string[]
  classSessionPrompts: CompetitionImportClassSessionPrompt[]
  toAdd: CompetitionImportDiffRow[]
  toRemove: CompetitionImportDiffRow[]
}

export type CompetitionImportApplyResult = {
  summary: {
    registrationsAdded: number
    registrationsRemoved: number
    playersCreated: number
    playersDeleted: number
    sessionsCreated: number
    classesCreated: number
    classesUpdated: number
  }
}

export type ParsedCompetitionImportClass = {
  className: string
  classKey: string
  startAt: string
  classDate: string
  classTime: string
  declaredCount: number
  registrations: Array<{
    playerName: string
    clubName: string
    playerKey: string
  }>
}

export type CompetitionImportParseResult = {
  competitionTitleFromSource: string | null
  classes: ParsedCompetitionImportClass[]
  errors: string[]
  summary: {
    classesParsed: number
    playersParsed: number
    registrationsParsed: number
  }
}

export class CompetitionImportNotFoundError extends Error {
  constructor() {
    super('Competition not found')
    this.name = 'CompetitionImportNotFoundError'
  }
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeIdentityPart(value: string | null | undefined): string {
  return collapseWhitespace(String(value ?? '')).normalize('NFKC').toLocaleLowerCase('sv-SE')
}

function buildPlayerKey(playerName: string, clubName: string): string {
  return `${normalizeIdentityPart(playerName)}::${normalizeIdentityPart(clubName)}`
}

function buildClassKey(className: string, classDate: string, classTime: string): string {
  return `${normalizeIdentityPart(className)}::${classDate}::${classTime}`
}

function buildRegistrationKey(classKey: string, playerKey: string): string {
  return `${classKey}::${playerKey}`
}

function isFixedNoiseLine(line: string): boolean {
  const normalized = normalizeIdentityPart(line)
  return normalized === 'deltagarlista'
    || normalized === 'alla klasser'
    || normalized.startsWith('tävlingen genomförs med hjälp av programmet tt coordinator')
    || normalized.startsWith('denna programlicens får endast användas vid tävlingar arrangerade av')
}

function isLikelyCompetitionTitle(lines: ParsedSourceLine[], index: number): boolean {
  const line = lines[index]
  if (!line || isFixedNoiseLine(line.collapsed) || SCHEDULE_LINE_RE.test(line.collapsed)) {
    return false
  }

  if (line.raw.includes(',')) {
    return false
  }

  const nextRelevant = lines.slice(index + 1).find(candidate => candidate.raw)
  if (nextRelevant && SCHEDULE_LINE_RE.test(nextRelevant.collapsed)) {
    return false
  }

  for (let offset = -2; offset <= 2; offset += 1) {
    if (offset === 0) continue
    const candidate = lines[index + offset]
    if (candidate && isFixedNoiseLine(candidate.collapsed)) {
      return true
    }
  }

  return false
}

function parseSourceLines(sourceText: string): {
  competitionTitleFromSource: string | null
  lines: ParsedSourceLine[]
} {
  const rawLines = sourceText
    .split(/\r?\n/)
    .map((line, index) => ({
      raw: line.trim(),
      collapsed: collapseWhitespace(line),
      lineNumber: index + 1,
    }))
    .filter(line => line.raw.length > 0)

  let competitionTitleFromSource: string | null = null
  const lines = rawLines.filter((line, index) => {
    if (isFixedNoiseLine(line.collapsed)) {
      return false
    }

    if (isLikelyCompetitionTitle(rawLines, index)) {
      competitionTitleFromSource ??= line.raw
      return false
    }

    return true
  })

  return { competitionTitleFromSource, lines }
}

function parseScheduleLine(line: string): { classDate: string; classTime: string; declaredCount: number } | null {
  const match = collapseWhitespace(line).match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+\((\d+)\s+anm[aä]lda\)$/i)
  if (!match) return null

  return {
    classDate: match[1],
    classTime: match[2],
    declaredCount: Number(match[3]),
  }
}

function parseRegistrationLine(line: string): { playerName: string; clubName: string } | null {
  const firstComma = line.indexOf(',')
  if (firstComma <= 0) {
    return null
  }

  const playerName = line.slice(0, firstComma).trim()
  const clubName = line.slice(firstComma + 1).trim()
  if (!playerName || !clubName) {
    return null
  }

  return { playerName, clubName }
}

function datePartsInTimeZone(date: Date, timeZone: string): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(date)
  const map = new Map(parts.map(part => [part.type, part.value]))

  return {
    year: Number(map.get('year')),
    month: Number(map.get('month')),
    day: Number(map.get('day')),
    hour: Number(map.get('hour')),
    minute: Number(map.get('minute')),
    second: Number(map.get('second')),
  }
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = datePartsInTimeZone(date, timeZone)
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )

  return asUtc - date.getTime()
}

function stockholmLocalToUtcIso(classDate: string, classTime: string): string {
  const [year, month, day] = classDate.split('-').map(Number)
  const [hour, minute] = classTime.split(':').map(Number)
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))
  const offsetMs = timeZoneOffsetMs(utcGuess, STOCKHOLM_TIME_ZONE)
  return new Date(utcGuess.getTime() - offsetMs).toISOString()
}

function attendanceDeadlineFromStartAt(startAt: string): string {
  return new Date(
    new Date(startAt).getTime() - ATTENDANCE_DEADLINE_MINUTES * 60 * 1000,
  ).toISOString()
}

function isoToStockholmDate(iso: string): string {
  const parts = datePartsInTimeZone(new Date(iso), STOCKHOLM_TIME_ZONE)
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function isoToStockholmTime(iso: string): string {
  const parts = datePartsInTimeZone(new Date(iso), STOCKHOLM_TIME_ZONE)
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
}

function parsePassNameSessionNumber(name: string): SessionNumber | null {
  const match = collapseWhitespace(name).match(/^pass\s+([1-3])$/i)
  if (!match) return null

  const sessionNumber = Number(match[1])
  return SESSION_NUMBERS.includes(sessionNumber as SessionNumber)
    ? sessionNumber as SessionNumber
    : null
}

function buildSessionSlotKey(date: string, sessionNumber: number): string {
  return `${date}::${sessionNumber}`
}

function buildSessionSlots(sessions: ExistingSession[]): {
  slots: SessionSlot[]
  sessionBySlotKey: Map<string, ExistingSession>
  sessionNumberById: Map<string, number>
} {
  const sessionsByDate = new Map<string, ExistingSession[]>()
  for (const session of sessions) {
    const list = sessionsByDate.get(session.date) ?? []
    list.push(session)
    sessionsByDate.set(session.date, list)
  }

  const slots: SessionSlot[] = []

  for (const [date, dateSessions] of Array.from(sessionsByDate.entries())) {
    const sorted = [...dateSessions].sort((left, right) => {
      if (left.session_order !== right.session_order) {
        return left.session_order - right.session_order
      }

      return left.name.localeCompare(right.name, 'sv-SE')
    })

    const usedNumbers = new Set<number>()
    const slotsForDate = new Map<string, SessionSlot>()

    for (const session of sorted) {
      const explicitNumber = parsePassNameSessionNumber(session.name)
      if (!explicitNumber || usedNumbers.has(explicitNumber)) {
        continue
      }

      const slot = { session, sessionNumber: explicitNumber }
      slotsForDate.set(session.id, slot)
      usedNumbers.add(explicitNumber)
    }

    for (const session of sorted) {
      if (slotsForDate.has(session.id)) {
        continue
      }

      const nextNumber = SESSION_NUMBERS.find(candidate => !usedNumbers.has(candidate))
      const sessionNumber = nextNumber ?? (usedNumbers.size + 1)
      const slot = { session, sessionNumber }
      slotsForDate.set(session.id, slot)
      usedNumbers.add(sessionNumber)
    }

    for (const slot of Array.from(slotsForDate.values())) {
      slots.push({
        session: { ...slot.session, date },
        sessionNumber: slot.sessionNumber,
      })
    }
  }

  slots.sort((left, right) => {
    if (left.session.date !== right.session.date) {
      return left.session.date.localeCompare(right.session.date)
    }

    return left.sessionNumber - right.sessionNumber
  })

  return {
    slots,
    sessionBySlotKey: new Map(slots.map(slot => [buildSessionSlotKey(slot.session.date, slot.sessionNumber), slot.session])),
    sessionNumberById: new Map(slots.map(slot => [slot.session.id, slot.sessionNumber])),
  }
}

function suggestSessionNumber(classTime: string): SessionNumber {
  const [hour] = classTime.split(':').map(Number)
  if (hour < 11) return 1
  if (hour < 14) return 2
  return 3
}

function buildSessionOptions(
  classDate: string,
  sessionBySlotKey: Map<string, ExistingSession>,
): CompetitionImportSessionOption[] {
  return SESSION_NUMBERS.map(sessionNumber => {
    const session = sessionBySlotKey.get(buildSessionSlotKey(classDate, sessionNumber)) ?? null

    return {
      sessionNumber,
      sessionId: session?.id ?? null,
      exists: session !== null,
    }
  })
}

function attendanceStatusFromRelation(
  attendance: ExistingRegistrationRow['attendance'],
): AttendanceStatus | null {
  if (!attendance) return null
  if (Array.isArray(attendance)) return attendance[0]?.status ?? null
  return attendance.status ?? null
}

function buildWarnings(removalsWithAttendance: number, removalsTotal: number): string[] {
  if (removalsWithAttendance === 0) return []

  return [
    `${removalsTotal} anmälningar kommer att tas bort.`,
    `${removalsWithAttendance} av dessa har redan närvarostatus och den informationen kommer också att tas bort.`,
  ]
}

function previewFromPreparedImport(prepared: {
  parsed: CompetitionImportParseResult
  classSessionPrompts: CompetitionImportClassSessionPrompt[]
  toAdd: CompetitionImportDiffRow[]
  toRemove: CompetitionImportDiffRow[]
}): CompetitionImportPreview {
  const removalsWithAttendance = prepared.toRemove.filter(row => row.attendanceStatus).length

  return {
    competitionTitleFromSource: prepared.parsed.competitionTitleFromSource,
    summary: {
      classesParsed: prepared.parsed.summary.classesParsed,
      playersParsed: prepared.parsed.summary.playersParsed,
      registrationsParsed: prepared.parsed.summary.registrationsParsed,
      registrationsToAdd: prepared.toAdd.length,
      registrationsToRemove: prepared.toRemove.length,
      registrationsToRemoveWithAttendance: removalsWithAttendance,
    },
    warnings: buildWarnings(removalsWithAttendance, prepared.toRemove.length),
    errors: prepared.parsed.errors,
    classSessionPrompts: prepared.classSessionPrompts,
    toAdd: prepared.toAdd,
    toRemove: prepared.toRemove,
  }
}

function ensureSingle<T>(rows: T[] | null | undefined): T[] {
  return rows ?? []
}

async function loadCompetitionState(
  supabase: SupabaseClient,
  competitionId: string,
): Promise<CompetitionState> {
  const { data: competition, error: competitionError } = await supabase
    .from('competitions')
    .select('id')
    .eq('id', competitionId)
    .is('deleted_at', null)
    .single()

  if (competitionError || !competition) {
    throw new CompetitionImportNotFoundError()
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, competition_id, name, date, session_order')
    .eq('competition_id', competitionId)
    .order('date', { ascending: true })

  if (sessionsError) {
    throw new Error(`Failed to load sessions: ${sessionsError.message}`)
  }

  const sessionRows = ensureSingle(sessions) as ExistingSession[]
  const sessionIds = sessionRows.map(session => session.id)

  let classRows: ExistingClass[] = []
  if (sessionIds.length > 0) {
    const { data: classes, error: classesError } = await supabase
      .from('classes')
      .select('id, session_id, name, start_time, attendance_deadline')
      .in('session_id', sessionIds)

    if (classesError) {
      throw new Error(`Failed to load classes: ${classesError.message}`)
    }

    classRows = ensureSingle(classes) as ExistingClass[]
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, competition_id, name, club')
    .eq('competition_id', competitionId)

  if (playersError) {
    throw new Error(`Failed to load players: ${playersError.message}`)
  }

  const classIds = classRows.map(classRow => classRow.id)

  let registrationRows: ExistingRegistrationRow[] = []
  if (classIds.length > 0) {
    const { data: registrations, error: registrationsError } = await supabase
      .from('registrations')
      .select('id, player_id, class_id, attendance(status)')
      .in('class_id', classIds)

    if (registrationsError) {
      throw new Error(`Failed to load registrations: ${registrationsError.message}`)
    }

    registrationRows = ensureSingle(registrations) as ExistingRegistrationRow[]
  }

  const playerRows = ensureSingle(players) as ExistingPlayer[]
  const playerMap = new Map(playerRows.map(player => [player.id, player]))
  const classMap = new Map(classRows.map(classRow => [classRow.id, classRow]))
  const sessionMap = new Map(sessionRows.map(session => [session.id, session]))

  const registrations = registrationRows
    .map(row => {
      const player = playerMap.get(row.player_id)
      const classRow = classMap.get(row.class_id)
      const session = classRow ? sessionMap.get(classRow.session_id) : null
      if (!player || !classRow || !session) {
        return null
      }

      const classDate = isoToStockholmDate(classRow.start_time)
      const classTime = isoToStockholmTime(classRow.start_time)
      const classKey = buildClassKey(classRow.name, classDate, classTime)
      const playerKey = buildPlayerKey(player.name, player.club ?? '')

      return {
        id: row.id,
        playerId: row.player_id,
        classId: row.class_id,
        key: buildRegistrationKey(classKey, playerKey),
        playerName: player.name,
        clubName: player.club ?? '',
        className: classRow.name,
        classDate,
        classTime,
        attendanceStatus: attendanceStatusFromRelation(row.attendance),
      } satisfies ExistingRegistration
    })
    .filter((row): row is ExistingRegistration => row !== null)

  return {
    sessions: sessionRows,
    classes: classRows,
    players: playerRows,
    registrations,
  }
}

export function parseCompetitionImportSource(sourceText: string): CompetitionImportParseResult {
  const errors: string[] = []
  const { competitionTitleFromSource, lines } = parseSourceLines(sourceText)
  const classes: ParsedCompetitionImportClass[] = []
  let index = 0

  while (index < lines.length) {
    const classLine = lines[index]
    const scheduleLine = lines[index + 1]
    const parsedSchedule = scheduleLine ? parseScheduleLine(scheduleLine.collapsed) : null

    if (!parsedSchedule) {
      index += 1
      continue
    }

    const startAt = stockholmLocalToUtcIso(parsedSchedule.classDate, parsedSchedule.classTime)
    const classKey = buildClassKey(classLine.raw, parsedSchedule.classDate, parsedSchedule.classTime)
    const registrations: ParsedCompetitionImportClass['registrations'] = []
    const seenRegistrationKeys = new Set<string>()

    index += 2

    while (index < lines.length) {
      const nextLine = lines[index]
      const nextSchedule = lines[index + 1]
      if (nextSchedule && parseScheduleLine(nextSchedule.collapsed)) {
        break
      }

      const parsedRegistration = parseRegistrationLine(nextLine.raw)
      if (!parsedRegistration) {
        errors.push(`Rad ${nextLine.lineNumber}: kunde inte läsa anmälan "${nextLine.raw}".`)
        index += 1
        continue
      }

      const playerKey = buildPlayerKey(parsedRegistration.playerName, parsedRegistration.clubName)
      if (seenRegistrationKeys.has(playerKey)) {
        errors.push(
          `Dubbel importerad anmälan i klassen ${classLine.raw}: ${parsedRegistration.playerName}, ${parsedRegistration.clubName}.`,
        )
      }
      seenRegistrationKeys.add(playerKey)

      registrations.push({
        playerName: parsedRegistration.playerName,
        clubName: parsedRegistration.clubName,
        playerKey,
      })
      index += 1
    }

    if (parsedSchedule.declaredCount !== registrations.length) {
      errors.push(
        `Klassen ${classLine.raw} har deklarerat ${parsedSchedule.declaredCount} anmälningar men ${registrations.length} kunde läsas.`,
      )
    }

    classes.push({
      className: classLine.raw,
      classKey,
      startAt,
      classDate: parsedSchedule.classDate,
      classTime: parsedSchedule.classTime,
      declaredCount: parsedSchedule.declaredCount,
      registrations,
    })
  }

  if (classes.length === 0) {
    errors.push('Ingen klass kunde läsas från startlistan.')
  }

  const registrationCount = classes.reduce((total, classRow) => total + classRow.registrations.length, 0)
  if (registrationCount === 0) {
    errors.push('Ingen anmälan kunde läsas från startlistan.')
  }

  const uniquePlayers = new Set(
    classes.flatMap(classRow => classRow.registrations.map(registration => registration.playerKey)),
  )

  return {
    competitionTitleFromSource,
    classes,
    errors,
    summary: {
      classesParsed: classes.length,
      playersParsed: uniquePlayers.size,
      registrationsParsed: registrationCount,
    },
  }
}

async function prepareCompetitionImport(
  supabase: SupabaseClient,
  competitionId: string,
  sourceText: string,
): Promise<PreparedCompetitionImport> {
  const parsed = parseCompetitionImportSource(sourceText)
  const state = await loadCompetitionState(supabase, competitionId)

  if (parsed.errors.length > 0) {
    return {
      parsed,
      state,
      toAdd: [],
      toRemove: [],
      preview: previewFromPreparedImport({ parsed, classSessionPrompts: [], toAdd: [], toRemove: [] }),
    }
  }

  const { sessionBySlotKey, sessionNumberById } = buildSessionSlots(state.sessions)

  const existingClassMap = new Map(
    state.classes.map(classRow => {
      const classDate = isoToStockholmDate(classRow.start_time)
      const classTime = isoToStockholmTime(classRow.start_time)
      return [buildClassKey(classRow.name, classDate, classTime), classRow] as const
    }),
  )

  const classSessionPrompts = parsed.classes.map(classRow => {
    const existingClass = existingClassMap.get(classRow.classKey) ?? null
    const currentSessionNumber = existingClass ? (sessionNumberById.get(existingClass.session_id) ?? null) : null
    const suggestedSessionNumber = suggestSessionNumber(classRow.classTime)

    return {
      classKey: classRow.classKey,
      className: classRow.className,
      classDate: classRow.classDate,
      classTime: classRow.classTime,
      existingClassId: existingClass?.id ?? null,
      currentSessionNumber,
      suggestedSessionNumber,
      defaultSessionNumber: currentSessionNumber ?? suggestedSessionNumber,
      options: buildSessionOptions(classRow.classDate, sessionBySlotKey),
    } satisfies CompetitionImportClassSessionPrompt
  })

  const existingRegistrationMap = new Map(state.registrations.map(registration => [registration.key, registration] as const))

  const importedRegistrationKeys = new Set<string>()
  const toAdd: ImportPlanAddRow[] = []

  for (const classRow of parsed.classes) {
    for (const registration of classRow.registrations) {
      const registrationKey = buildRegistrationKey(classRow.classKey, registration.playerKey)
      importedRegistrationKeys.add(registrationKey)

      if (!existingRegistrationMap.has(registrationKey)) {
        toAdd.push({
          classKey: classRow.classKey,
          playerKey: registration.playerKey,
          className: classRow.className,
          classDate: classRow.classDate,
          classTime: classRow.classTime,
          playerName: registration.playerName,
          clubName: registration.clubName,
        })
      }
    }
  }

  const toRemove: ImportPlanRemoveRow[] = state.registrations
    .filter(registration => !importedRegistrationKeys.has(registration.key))
    .map(registration => ({
      registrationId: registration.id,
      playerId: registration.playerId,
      classKey: buildClassKey(registration.className, registration.classDate, registration.classTime),
      playerKey: buildPlayerKey(registration.playerName, registration.clubName),
      className: registration.className,
      classDate: registration.classDate,
      classTime: registration.classTime,
      playerName: registration.playerName,
      clubName: registration.clubName,
      attendanceStatus: registration.attendanceStatus,
    }))

  const preview = previewFromPreparedImport({ parsed, classSessionPrompts, toAdd, toRemove })

  return {
    parsed,
    preview,
    state,
    toAdd,
    toRemove,
  }
}

function parseSessionNumber(value: unknown): SessionNumber | null {
  const sessionNumber = Number(value)
  return SESSION_NUMBERS.includes(sessionNumber as SessionNumber)
    ? sessionNumber as SessionNumber
    : null
}

function buildApplyPlan(
  prepared: PreparedCompetitionImport,
  assignmentValidation: CompetitionImportSessionAssignmentValidation,
): {
  sessionSlots: SessionSlotPlan[]
  classes: ClassPlan[]
  players: PlayerPlan[]
  registrationAdds: Array<{ class_key: string; player_key: string }>
  registrationRemovals: Array<{ registration_id: string; player_id: string }>
} {
  const { slots: initialSessionSlots } = buildSessionSlots(
    prepared.state.sessions.map(session => ({ ...session })),
  )

  const sessionSlots: SessionSlotPlan[] = initialSessionSlots.map(slot => ({
    slot_key: buildSessionSlotKey(slot.session.date, slot.sessionNumber),
    date: slot.session.date,
    session_number: slot.sessionNumber as SessionNumber,
    existing_session_id: slot.session.id,
  }))
  const knownSessionSlotKeys = new Set(sessionSlots.map(slot => slot.slot_key))

  const classesByKey = new Map(
    prepared.state.classes.map(classRow => {
      const classDate = isoToStockholmDate(classRow.start_time)
      const classTime = isoToStockholmTime(classRow.start_time)
      return [buildClassKey(classRow.name, classDate, classTime), classRow] as const
    }),
  )

  const classPlans = prepared.parsed.classes.map(classRow => {
    const sessionNumber = assignmentValidation.byClassKey.get(classRow.classKey)
    if (!sessionNumber) {
      throw new Error(`Missing session assignment for ${classRow.classKey}`)
    }

    const sessionSlotKey = buildSessionSlotKey(classRow.classDate, sessionNumber)
    if (!knownSessionSlotKeys.has(sessionSlotKey)) {
      sessionSlots.push({
        slot_key: sessionSlotKey,
        date: classRow.classDate,
        session_number: sessionNumber,
        existing_session_id: null,
      })
      knownSessionSlotKeys.add(sessionSlotKey)
    }

    return {
      class_key: classRow.classKey,
      existing_class_id: classesByKey.get(classRow.classKey)?.id ?? null,
      class_name: classRow.className,
      start_time: classRow.startAt,
      attendance_deadline: attendanceDeadlineFromStartAt(classRow.startAt),
      session_slot_key: sessionSlotKey,
    }
  })

  const existingPlayersByKey = new Map(
    prepared.state.players.map(player => [buildPlayerKey(player.name, player.club ?? ''), player] as const),
  )
  const importedPlayers = new Map(
    prepared.parsed.classes.flatMap(classRow => classRow.registrations).map(registration => [
      registration.playerKey,
      {
        player_name: registration.playerName,
        club_name: registration.clubName,
      },
    ]),
  )

  return {
    sessionSlots,
    classes: classPlans,
    players: Array.from(importedPlayers.entries()).map(([playerKey, player]) => ({
      player_key: playerKey,
      existing_player_id: existingPlayersByKey.get(playerKey)?.id ?? null,
      player_name: player.player_name,
      club_name: player.club_name,
    })),
    registrationAdds: prepared.toAdd.map(row => ({
      class_key: row.classKey,
      player_key: row.playerKey,
    })),
    registrationRemovals: prepared.toRemove.map(row => ({
      registration_id: row.registrationId,
      player_id: row.playerId,
    })),
  }
}

function validateClassSessionAssignments(
  parsedClasses: ParsedCompetitionImportClass[],
  assignments: CompetitionImportClassSessionAssignment[],
): CompetitionImportSessionAssignmentValidation {
  const byClassKey = new Map<string, SessionNumber>()
  const errors: string[] = []
  const knownClassKeys = new Set(parsedClasses.map(classRow => classRow.classKey))

  for (const assignment of assignments) {
    if (!knownClassKeys.has(assignment.classKey)) {
      errors.push(`Okänd klass i passmappning: ${assignment.classKey}.`)
      continue
    }

    if (byClassKey.has(assignment.classKey)) {
      errors.push(`Klassen ${assignment.classKey} har flera valda pass.`)
      continue
    }

    const sessionNumber = parseSessionNumber(assignment.sessionNumber)
    if (!sessionNumber) {
      errors.push(`Ogiltigt pass för klassen ${assignment.classKey}.`)
      continue
    }

    byClassKey.set(assignment.classKey, sessionNumber)
  }

  for (const classRow of parsedClasses) {
    if (byClassKey.has(classRow.classKey)) {
      continue
    }

    errors.push(`Välj pass för klassen ${classRow.className} (${classRow.classDate} ${classRow.classTime}).`)
  }

  return { byClassKey, errors }
}

export async function buildCompetitionImportPreview(
  supabase: SupabaseClient,
  competitionId: string,
  sourceText: string,
): Promise<CompetitionImportPreview> {
  const prepared = await prepareCompetitionImport(supabase, competitionId, sourceText)
  return prepared.preview
}

export async function applyCompetitionImport(
  supabase: SupabaseClient,
  competitionId: string,
  sourceText: string,
  confirmRemovalWithAttendance: boolean,
  classSessionAssignments: CompetitionImportClassSessionAssignment[],
): Promise<{ preview?: CompetitionImportPreview; result?: CompetitionImportApplyResult }> {
  const prepared = await prepareCompetitionImport(supabase, competitionId, sourceText)
  if (prepared.preview.errors.length > 0) {
    return { preview: prepared.preview }
  }

  const assignmentValidation = validateClassSessionAssignments(prepared.parsed.classes, classSessionAssignments)
  if (assignmentValidation.errors.length > 0) {
    return {
      preview: {
        ...prepared.preview,
        errors: [...prepared.preview.errors, ...assignmentValidation.errors],
      },
    }
  }

  if (
    prepared.preview.summary.registrationsToRemoveWithAttendance > 0
    && !confirmRemovalWithAttendance
  ) {
    return { preview: prepared.preview }
  }

  const applyPlan = buildApplyPlan(prepared, assignmentValidation)
  const { data, error } = await supabase.rpc('apply_competition_import_plan', {
    p_competition_id: competitionId,
    p_session_slots: applyPlan.sessionSlots,
    p_classes: applyPlan.classes,
    p_players: applyPlan.players,
    p_registration_adds: applyPlan.registrationAdds,
    p_registration_removals: applyPlan.registrationRemovals,
  })

  if (error) {
    throw new Error(`Failed to apply import: ${error.message}`)
  }

  if (
    typeof data !== 'object'
    || data === null
    || !('summary' in data)
  ) {
    throw new Error('Invalid import apply response')
  }

  return {
    result: data as CompetitionImportApplyResult,
  }
}