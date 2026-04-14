import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  ONDATA_SNAPSHOT_SCHEMA_VERSION,
  type OnDataSnapshotClass,
  type OnDataSnapshotPayload,
  type OnDataSnapshotPool,
} from '../src/lib/ondata-integration-contract'
import {
  hashOnDataSnapshotPayload,
  persistOnDataSnapshot,
} from '../src/lib/ondata-integration-server'

dotenv.config({ path: '.env.local' })

const isOptionalMode = process.argv.includes('--optional')
const MANUAL_FIXTURE_PATH = path.resolve(process.cwd(), 'scripts/fixtures/manual-competition.json')

type ManualClassSeedState = 'not_open' | 'awaiting_attendance' | 'full_attendance' | 'draw_available'
type ManualAttendancePattern = 'mixed' | 'confirmed_only'

type ManualCompetitionFixture = {
  version: 1
  competition: {
    slug: string
    name: string
    playerPin: string
    adminPin: string
  }
  deadlineMinutesBeforeStart: number
  sessions: ManualFixtureSession[]
  classes: ManualFixtureClass[]
}

type ManualFixtureSession = {
  key: string
  name: string
  dayOffsetDays: number
  sessionOrder: 1 | 2
}

type ManualFixtureClass = {
  key: string
  name: string
  sessionKey: string
  startTime: string
  seedState: ManualClassSeedState
  maxPlayers: number
  registeredPlayers: number
  reservePlayers?: number
  attendancePattern?: ManualAttendancePattern
}

type ResolvedFixtureSession = ManualFixtureSession & {
  date: string
}

type CreatedSessionRow = {
  id: string
  date: string
  session_order: number
}

type CreatedClassRow = {
  id: string
  name: string
  session_id: string
  start_time: string
}

type InsertedPlayerRow = {
  id: string
  name: string
}

type InsertedRegistrationRow = {
  id: string
  class_id: string
  status: 'registered' | 'reserve'
}

type PlayerSlot = {
  name: string
  club: string | null
}

const FIRST_NAMES = [
  'Alva', 'Elsa', 'Maja', 'Saga', 'Wilma', 'Ella', 'Alice', 'Olivia', 'Nora', 'Signe',
  'Hugo', 'William', 'Liam', 'Noah', 'Lucas', 'Adam', 'Oscar', 'Elias', 'Leo', 'Viggo',
  'Tilde', 'Tyra', 'Lova', 'Felicia', 'Clara', 'Axel', 'Isak', 'Anton', 'Arvid', 'Nils',
]

const LAST_NAMES = [
  'Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson',
  'Persson', 'Svensson', 'Gustafsson', 'Pettersson', 'Jansson', 'Berg', 'Lindqvist',
  'Axelsson', 'Lindberg', 'Holm', 'Bjork', 'Dahl', 'Wallin',
]

const CLUBS = [
  'Askims BTK', 'BTK Dalen', 'Grastorps BTK', 'Halta IK', 'Kvillebyns SK', 'Lekstorps IF',
  'Munkedals BTK', 'Stenungsunds BTF', 'Svanesunds GIF', 'Torslanda IK', 'Uddevalla BTK', 'Vara SK',
]

function getRequiredEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY') {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} saknas i .env.local`)
  }

  return value
}

function createSupabaseAdminClient() {
  return createClient(
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  )
}

function chunkItems<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }

  return chunks
}

function formatStockholmDate(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

function stockholmLocalToUtcIso(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0))
  const offsetValue = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'shortOffset',
    hourCycle: 'h23',
  })
    .formatToParts(utcGuess)
    .find(part => part.type === 'timeZoneName')?.value

  if (!offsetValue) {
    throw new Error('Kunde inte lasa svensk tidszonsoffset')
  }

  const match = offsetValue.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/)
  if (!match) {
    throw new Error(`Okant offset-format for svensk tid: ${offsetValue}`)
  }

  const [, sign, hours, minutes = '00'] = match
  const totalMinutes = Number(hours) * 60 + Number(minutes)
  const offsetMinutes = sign === '+' ? totalMinutes : -totalMinutes
  return new Date(utcGuess.getTime() - offsetMinutes * 60_000).toISOString()
}

function resolveFixtureDate(dayOffsetDays: number) {
  return formatStockholmDate(new Date(Date.now() + dayOffsetDays * 24 * 60 * 60 * 1000))
}

function loadManualFixture(): ManualCompetitionFixture {
  if (!existsSync(MANUAL_FIXTURE_PATH)) {
    throw new Error(`Fixture saknas: ${MANUAL_FIXTURE_PATH}`)
  }

  const parsed = JSON.parse(readFileSync(MANUAL_FIXTURE_PATH, 'utf8')) as Partial<ManualCompetitionFixture>

  if (parsed.version !== 1) {
    throw new Error('Fixture-filen maste ha version 1.')
  }

  if (!parsed.competition?.slug || !parsed.competition.name || !parsed.competition.playerPin || !parsed.competition.adminPin) {
    throw new Error('Fixture-filen saknar competition-konfiguration.')
  }

  if (!Array.isArray(parsed.sessions) || parsed.sessions.length === 0) {
    throw new Error('Fixture-filen maste innehalla minst en session.')
  }

  if (!Array.isArray(parsed.classes) || parsed.classes.length === 0) {
    throw new Error('Fixture-filen maste innehalla minst en klass.')
  }

  if (!Number.isInteger(parsed.deadlineMinutesBeforeStart) || Number(parsed.deadlineMinutesBeforeStart) <= 0) {
    throw new Error('deadlineMinutesBeforeStart maste vara ett positivt heltal.')
  }

  const sessionKeys = new Set<string>()
  for (const session of parsed.sessions) {
    if (!session.key || !session.name || !Number.isInteger(session.dayOffsetDays) || ![1, 2].includes(session.sessionOrder)) {
      throw new Error('Alla sessioner maste ha key, name, dayOffsetDays och sessionOrder 1 eller 2.')
    }

    if (sessionKeys.has(session.key)) {
      throw new Error(`Dubbel session key i fixture: ${session.key}`)
    }

    sessionKeys.add(session.key)
  }

  const classKeys = new Set<string>()
  const classNames = new Set<string>()
  for (const classEntry of parsed.classes) {
    if (
      !classEntry.key
      || !classEntry.name
      || !classEntry.sessionKey
      || !classEntry.startTime
      || !Number.isInteger(classEntry.maxPlayers)
      || classEntry.maxPlayers <= 0
      || !Number.isInteger(classEntry.registeredPlayers)
      || classEntry.registeredPlayers <= 0
    ) {
      throw new Error('Alla klasser maste ha key, name, sessionKey, startTime, maxPlayers och registeredPlayers > 0.')
    }

    if (!sessionKeys.has(classEntry.sessionKey)) {
      throw new Error(`Klassen ${classEntry.name} refererar till okand session: ${classEntry.sessionKey}`)
    }

    if (classKeys.has(classEntry.key)) {
      throw new Error(`Dubbel class key i fixture: ${classEntry.key}`)
    }

    if (classNames.has(classEntry.name)) {
      throw new Error(`Klassnamn maste vara unika i fixture: ${classEntry.name}`)
    }

    if (!['not_open', 'awaiting_attendance', 'full_attendance', 'draw_available'].includes(classEntry.seedState)) {
      throw new Error(`Ogiltigt seedState for ${classEntry.name}: ${classEntry.seedState}`)
    }

    if (classEntry.registeredPlayers > classEntry.maxPlayers) {
      throw new Error(`registeredPlayers far inte overstiga maxPlayers for ${classEntry.name}`)
    }

    if (classEntry.reservePlayers != null && (!Number.isInteger(classEntry.reservePlayers) || classEntry.reservePlayers < 0)) {
      throw new Error(`reservePlayers maste vara 0 eller hogre for ${classEntry.name}`)
    }

    if ((classEntry.reservePlayers ?? 0) > 0 && classEntry.registeredPlayers < classEntry.maxPlayers) {
      throw new Error(`Klassen ${classEntry.name} kan inte ha reserver utan att vara fulltecknad.`)
    }

    if (classEntry.attendancePattern && !['mixed', 'confirmed_only'].includes(classEntry.attendancePattern)) {
      throw new Error(`Ogiltigt attendancePattern for ${classEntry.name}: ${classEntry.attendancePattern}`)
    }

    classKeys.add(classEntry.key)
    classNames.add(classEntry.name)
  }

  return parsed as ManualCompetitionFixture
}

async function ensureCompetition(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  competition: ManualCompetitionFixture['competition'],
) {
  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash(competition.playerPin, 10),
    bcrypt.hash(competition.adminPin, 10),
  ])

  const { data: existing, error: existingError } = await supabase
    .from('competitions')
    .select('id')
    .eq('slug', competition.slug)
    .maybeSingle()

  if (existingError) {
    throw new Error(`Kunde inte lasa manuell testtavling: ${existingError.message}`)
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('competitions')
      .update({
        name: competition.name,
        player_pin_hash: playerPinHash,
        admin_pin_hash: adminPinHash,
        deleted_at: null,
      })
      .eq('id', existing.id)

    if (updateError) {
      throw new Error(`Kunde inte uppdatera manuell testtavling: ${updateError.message}`)
    }

    return existing.id
  }

  const { data: created, error: createError } = await supabase
    .from('competitions')
    .insert({
      name: competition.name,
      slug: competition.slug,
      player_pin_hash: playerPinHash,
      admin_pin_hash: adminPinHash,
    })
    .select('id')
    .single()

  if (createError || !created) {
    throw new Error(`Kunde inte skapa manuell testtavling: ${createError?.message ?? 'okant fel'}`)
  }

  return created.id
}

async function resetCompetitionData(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  competitionId: string,
) {
  const { error: deleteSessionsError } = await supabase
    .from('sessions')
    .delete()
    .eq('competition_id', competitionId)

  if (deleteSessionsError) {
    throw new Error(`Kunde inte rensa gamla sessioner: ${deleteSessionsError.message}`)
  }

  const { error: deletePlayersError } = await supabase
    .from('players')
    .delete()
    .eq('competition_id', competitionId)

  if (deletePlayersError) {
    throw new Error(`Kunde inte rensa gamla spelare: ${deletePlayersError.message}`)
  }
}

function buildResolvedSessions(fixture: ManualCompetitionFixture) {
  return fixture.sessions.map(session => ({
    ...session,
    date: resolveFixtureDate(session.dayOffsetDays),
  }))
}

async function insertSessions(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  competitionId: string,
  sessions: ResolvedFixtureSession[],
) {
  const { data, error } = await supabase
    .from('sessions')
    .insert(
      sessions.map(session => ({
        competition_id: competitionId,
        name: session.name,
        date: session.date,
        session_order: session.sessionOrder,
      })),
    )
    .select('id, date, session_order')

  if (error) {
    throw new Error(`Kunde inte skapa sessioner: ${error.message}`)
  }

  const rows = (data ?? []) as CreatedSessionRow[]
  const createdByDateAndOrder = new Map(rows.map(row => [`${row.date}::${row.session_order}`, row.id]))
  const sessionIdByKey = new Map<string, string>()

  for (const session of sessions) {
    const sessionId = createdByDateAndOrder.get(`${session.date}::${session.sessionOrder}`)
    if (!sessionId) {
      throw new Error(`Kunde inte hitta nyskapad session for ${session.key}`)
    }

    sessionIdByKey.set(session.key, sessionId)
  }

  return sessionIdByKey
}

async function insertClasses(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  fixture: ManualCompetitionFixture,
  resolvedSessions: ResolvedFixtureSession[],
  sessionIdByKey: Map<string, string>,
) {
  const resolvedSessionByKey = new Map(resolvedSessions.map(session => [session.key, session]))
  const { data, error } = await supabase
    .from('classes')
    .insert(
      fixture.classes.map(classEntry => {
        const session = resolvedSessionByKey.get(classEntry.sessionKey)
        if (!session) {
          throw new Error(`Saknar upplost session for ${classEntry.name}`)
        }

        const startTime = stockholmLocalToUtcIso(session.date, classEntry.startTime)
        const attendanceDeadline = new Date(
          new Date(startTime).getTime() - fixture.deadlineMinutesBeforeStart * 60_000,
        ).toISOString()

        return {
          session_id: sessionIdByKey.get(classEntry.sessionKey),
          name: classEntry.name,
          start_time: startTime,
          attendance_deadline: attendanceDeadline,
          max_players: classEntry.maxPlayers,
        }
      }),
    )
    .select('id, name, session_id, start_time')

  if (error) {
    throw new Error(`Kunde inte skapa klasser: ${error.message}`)
  }

  const rows = (data ?? []) as CreatedClassRow[]
  const classIdByName = new Map(rows.map(row => [row.name, row.id]))
  const classIdByKey = new Map<string, string>()

  for (const classEntry of fixture.classes) {
    const classId = classIdByName.get(classEntry.name)
    if (!classId) {
      throw new Error(`Kunde inte hitta nyskapad klass for ${classEntry.name}`)
    }

    classIdByKey.set(classEntry.key, classId)
  }

  return classIdByKey
}

function buildGeneratedPlayer(index: number) {
  const firstName = FIRST_NAMES[index % FIRST_NAMES.length]
  const lastName = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length]
  const cycle = Math.floor(index / (FIRST_NAMES.length * LAST_NAMES.length))
  const name = cycle === 0 ? `${firstName} ${lastName}` : `${firstName} ${lastName} ${cycle + 1}`
  const club = CLUBS[(index * 7) % CLUBS.length]

  return { name, club }
}

async function insertPlayersAndRegistrations(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  competitionId: string,
  fixture: ManualCompetitionFixture,
  classIdByKey: Map<string, string>,
) {
  const generatedPlayers: Array<{
    classKey: string
    playerName: string
    clubName: string
    registrationStatus: 'registered' | 'reserve'
    reserveJoinedAt: string | null
  }> = []

  let playerIndex = 0
  for (const classEntry of fixture.classes) {
    for (let registrationIndex = 0; registrationIndex < classEntry.registeredPlayers; registrationIndex += 1) {
      const player = buildGeneratedPlayer(playerIndex)
      playerIndex += 1
      generatedPlayers.push({
        classKey: classEntry.key,
        playerName: player.name,
        clubName: player.club,
        registrationStatus: 'registered',
        reserveJoinedAt: null,
      })
    }

    for (let reserveIndex = 0; reserveIndex < (classEntry.reservePlayers ?? 0); reserveIndex += 1) {
      const player = buildGeneratedPlayer(playerIndex)
      playerIndex += 1
      generatedPlayers.push({
        classKey: classEntry.key,
        playerName: player.name,
        clubName: player.club,
        registrationStatus: 'reserve',
        reserveJoinedAt: new Date(Date.now() - (reserveIndex + 1) * 60_000).toISOString(),
      })
    }
  }

  const insertedPlayers: InsertedPlayerRow[] = []
  for (const chunk of chunkItems(generatedPlayers, 150)) {
    const { data, error } = await supabase
      .from('players')
      .insert(
        chunk.map(player => ({
          competition_id: competitionId,
          name: player.playerName,
          club: player.clubName,
        })),
      )
      .select('id, name')

    if (error) {
      throw new Error(`Kunde inte skapa spelare: ${error.message}`)
    }

    insertedPlayers.push(...((data ?? []) as InsertedPlayerRow[]))
  }

  const playerIdByName = new Map(insertedPlayers.map(player => [player.name, player.id]))
  const registrationPayload = generatedPlayers.map(player => {
    const playerId = playerIdByName.get(player.playerName)
    const classId = classIdByKey.get(player.classKey)

    if (!playerId || !classId) {
      throw new Error(`Saknar spelare eller klass for registrering ${player.playerName}`)
    }

    return {
      player_id: playerId,
      class_id: classId,
      status: player.registrationStatus,
      reserve_joined_at: player.reserveJoinedAt,
    }
  })

  const insertedRegistrations: InsertedRegistrationRow[] = []
  for (const chunk of chunkItems(registrationPayload, 150)) {
    const { data, error } = await supabase
      .from('registrations')
      .insert(chunk)
      .select('id, class_id, status')

    if (error) {
      throw new Error(`Kunde inte skapa registreringar: ${error.message}`)
    }

    insertedRegistrations.push(...((data ?? []) as InsertedRegistrationRow[]))
  }

  return insertedRegistrations
}

async function seedAttendance(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  fixture: ManualCompetitionFixture,
  classIdByKey: Map<string, string>,
  registrations: InsertedRegistrationRow[],
) {
  const registrationsByClassId = new Map<string, InsertedRegistrationRow[]>()
  for (const registration of registrations) {
    const classRegistrations = registrationsByClassId.get(registration.class_id) ?? []
    classRegistrations.push(registration)
    registrationsByClassId.set(registration.class_id, classRegistrations)
  }

  const attendanceRows: Array<{
    registration_id: string
    status: 'confirmed' | 'absent'
    reported_by: 'admin'
    notes: string
    idempotency_key: string
  }> = []

  for (const classEntry of fixture.classes) {
    if (classEntry.seedState !== 'full_attendance' && classEntry.seedState !== 'draw_available') {
      continue
    }

    const classId = classIdByKey.get(classEntry.key)
    if (!classId) {
      throw new Error(`Saknar klass-id for ${classEntry.name}`)
    }

    const classRegistrations = registrationsByClassId.get(classId) ?? []
    const attendancePattern = classEntry.attendancePattern
      ?? (classEntry.seedState === 'draw_available' ? 'confirmed_only' : 'mixed')

    for (let index = 0; index < classRegistrations.length; index += 1) {
      const registration = classRegistrations[index]
      const status = attendancePattern === 'confirmed_only'
        ? 'confirmed'
        : index % 5 === 4
          ? 'absent'
          : 'confirmed'

      attendanceRows.push({
        registration_id: registration.id,
        status,
        reported_by: 'admin',
        notes: 'Manuell fixture-seed',
        idempotency_key: `manual-fixture:${classEntry.key}:${registration.id}`,
      })
    }
  }

  for (const chunk of chunkItems(attendanceRows, 150)) {
    const { error } = await supabase.from('attendance').insert(chunk)
    if (error) {
      throw new Error(`Kunde inte skapa narvarorader: ${error.message}`)
    }
  }
}

function countStates(fixture: ManualCompetitionFixture) {
  return fixture.classes.reduce(
    (counts, classEntry) => {
      counts[classEntry.seedState] += 1
      return counts
    },
    {
      not_open: 0,
      awaiting_attendance: 0,
      full_attendance: 0,
      draw_available: 0,
    } satisfies Record<ManualClassSeedState, number>,
  )
}

function getDrawClassIds(fixture: ManualCompetitionFixture, classIdByKey: Map<string, string>) {
  return fixture.classes
    .filter(classEntry => classEntry.seedState === 'draw_available')
    .map(classEntry => classIdByKey.get(classEntry.key))
    .filter((value): value is string => Boolean(value))
}

function formatStockholmDateTime(iso: string): { date: string; time: string } {
  const date = new Date(iso)
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  }
}

function slugifyClassName(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'class'
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function partitionIntoPools(players: PlayerSlot[]): PlayerSlot[][] {
  if (players.length === 0) return []
  const poolCount = Math.max(1, Math.ceil(players.length / 4))
  const pools: PlayerSlot[][] = Array.from({ length: poolCount }, () => [])
  players.forEach((player, index) => {
    pools[index % poolCount].push(player)
  })
  return pools
}

function roundRobinPairs(size: number): Array<{ a: number; b: number }> {
  const pairs: Array<{ a: number; b: number }> = []
  for (let a = 0; a < size; a++) {
    for (let b = a + 1; b < size; b++) {
      pairs.push({ a, b })
    }
  }
  return pairs
}

function pickResult(a: PlayerSlot, b: PlayerSlot): string {
  const scores = ['3-0', '3-1', '3-2', '2-3', '1-3', '0-3']
  return scores[hashString(`${a.name}|${b.name}`) % scores.length]
}

function determineProgress(classIndex: number): 'complete' | 'partial' | 'drawn' {
  if (classIndex < 1) return 'complete'
  if (classIndex < 2) return 'partial'
  return 'drawn'
}

async function buildDrawPayload(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  competitionId: string,
  competitionSlug: string,
  includedClassIds: ReadonlySet<string> | null = null,
): Promise<OnDataSnapshotPayload | null> {
  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, date, session_order')
    .eq('competition_id', competitionId)
    .order('date', { ascending: true })
    .order('session_order', { ascending: true })

  if (sessionsError) throw new Error(sessionsError.message)
  if (!sessions || sessions.length === 0) return null

  const sessionSortKeyById = new Map(sessions.map(session => [session.id, `${session.date}::${session.session_order}`]))
  const sessionIds = sessions.map(session => session.id)

  const { data: classRows, error: classesError } = await supabase
    .from('classes')
    .select('id, name, start_time, session_id')
    .in('session_id', sessionIds)

  if (classesError) throw new Error(classesError.message)
  if (!classRows || classRows.length === 0) return null

  const sortedClasses = [...classRows].sort((left, right) => {
    const sessionDelta = (sessionSortKeyById.get(left.session_id) ?? '').localeCompare(
      sessionSortKeyById.get(right.session_id) ?? '',
    )
    if (sessionDelta !== 0) return sessionDelta
    return left.start_time.localeCompare(right.start_time)
  })

  const includedClasses = includedClassIds
    ? sortedClasses.filter(classRow => includedClassIds.has(classRow.id))
    : sortedClasses

  if (includedClasses.length === 0) return null

  const classIds = includedClasses.map(classRow => classRow.id)
  const { data: registrations, error: registrationsError } = await supabase
    .from('registrations')
    .select('class_id, player_id, status')
    .in('class_id', classIds)

  if (registrationsError) throw new Error(registrationsError.message)

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, name, club')
    .eq('competition_id', competitionId)

  if (playersError) throw new Error(playersError.message)

  const playerById = new Map<string, PlayerSlot>()
  for (const player of players ?? []) {
    playerById.set(player.id, { name: player.name, club: player.club })
  }

  const playersByClassId = new Map<string, PlayerSlot[]>()
  for (const registration of registrations ?? []) {
    if (registration.status === 'reserve') continue
    const player = playerById.get(registration.player_id)
    if (!player) continue
    const classPlayers = playersByClassId.get(registration.class_id) ?? []
    classPlayers.push(player)
    playersByClassId.set(registration.class_id, classPlayers)
  }

  let totalPools = 0
  let totalCompletedMatches = 0
  const snapshotClasses: OnDataSnapshotClass[] = []

  includedClasses.forEach((classRow, classIndex) => {
    const playersForClass = (playersByClassId.get(classRow.id) ?? []).slice()
    playersForClass.sort((left, right) => left.name.localeCompare(right.name, 'sv'))

    const pools = partitionIntoPools(playersForClass)
    if (pools.length === 0) return

    const progress = determineProgress(classIndex)
    let matchNumberCursor = 1

    const snapshotPools: OnDataSnapshotPool[] = pools.map((poolPlayers, poolIndex) => {
      const pairs = roundRobinPairs(poolPlayers.length)
      const completedCount =
        progress === 'complete'
          ? pairs.length
          : progress === 'partial'
            ? Math.ceil(pairs.length / 2)
            : 0

      const matches = pairs.map((pair, matchIndex) => ({
        matchNumber: matchNumberCursor++,
        playerA: poolPlayers[pair.a],
        playerB: poolPlayers[pair.b],
        result:
          matchIndex < completedCount
            ? pickResult(poolPlayers[pair.a], poolPlayers[pair.b])
            : null,
      }))

      totalCompletedMatches += completedCount

      return {
        poolNumber: poolIndex + 1,
        completedMatchCount: completedCount,
        players: poolPlayers,
        matches,
      }
    })

    totalPools += snapshotPools.length
    const local = formatStockholmDateTime(classRow.start_time)
    snapshotClasses.push({
      externalClassKey: `${slugifyClassName(classRow.name)}-${classIndex + 1}`,
      className: classRow.name,
      classDate: local.date,
      classTime: local.time,
      pools: snapshotPools,
    })
  })

  if (snapshotClasses.length === 0) return null

  const nowIso = new Date().toISOString()
  return {
    schemaVersion: ONDATA_SNAPSHOT_SCHEMA_VERSION,
    competitionSlug,
    source: {
      fileName: 'manual-fixture.json',
      filePath: MANUAL_FIXTURE_PATH,
      fileModifiedAt: nowIso,
      copiedToTempAt: nowIso,
      processedAt: nowIso,
      fileHash: `manual-fixture-${Date.now()}`,
    },
    summary: {
      classes: snapshotClasses.length,
      pools: totalPools,
      completedMatches: totalCompletedMatches,
    },
    classes: snapshotClasses,
  }
}

async function seedDrawData(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  competitionId: string,
  competitionSlug: string,
  includedClassIds: ReadonlySet<string> | null = null,
) {
  const { error: deleteSnapshotsError } = await supabase
    .from('ondata_integration_snapshots')
    .delete()
    .eq('competition_id', competitionId)

  if (deleteSnapshotsError) {
    throw new Error(`Kunde inte rensa gamla snapshots: ${deleteSnapshotsError.message}`)
  }

  const { error: deleteStatusError } = await supabase
    .from('ondata_integration_status')
    .delete()
    .eq('competition_id', competitionId)

  if (deleteStatusError) {
    throw new Error(`Kunde inte rensa gammal integrationsstatus: ${deleteStatusError.message}`)
  }

  const { error: settingsError } = await supabase
    .from('ondata_integration_settings')
    .upsert(
      {
        competition_id: competitionId,
        api_token_hash: null,
        api_token_last4: null,
        token_generated_at: null,
      },
      { onConflict: 'competition_id' },
    )

  if (settingsError) {
    throw new Error(`Kunde inte skapa integrationssettings: ${settingsError.message}`)
  }

  const payload = await buildDrawPayload(supabase, competitionId, competitionSlug, includedClassIds)
  if (!payload) return null

  const payloadHash = hashOnDataSnapshotPayload(payload)
  await persistOnDataSnapshot(supabase, competitionId, payload, payloadHash)
  return payload.summary
}

async function seedManualCompetition(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  competitionId: string,
  fixture: ManualCompetitionFixture,
) {
  await resetCompetitionData(supabase, competitionId)

  const resolvedSessions = buildResolvedSessions(fixture)
  const sessionIdByKey = await insertSessions(supabase, competitionId, resolvedSessions)
  const classIdByKey = await insertClasses(supabase, fixture, resolvedSessions, sessionIdByKey)
  const registrations = await insertPlayersAndRegistrations(supabase, competitionId, fixture, classIdByKey)
  await seedAttendance(supabase, fixture, classIdByKey, registrations)

  return {
    counts: countStates(fixture),
    drawClassIds: getDrawClassIds(fixture, classIdByKey),
  }
}

async function main() {
  const fixture = loadManualFixture()
  const supabase = createSupabaseAdminClient()
  const competitionId = await ensureCompetition(supabase, fixture.competition)
  const manualStateSummary = await seedManualCompetition(supabase, competitionId, fixture)
  const drawSummary = await seedDrawData(
    supabase,
    competitionId,
    fixture.competition.slug,
    new Set(manualStateSummary.drawClassIds),
  )

  console.log(`Manuell testtavling klar: http://localhost:3000/${fixture.competition.slug}`)
  console.log(`  Player PIN: ${fixture.competition.playerPin}`)
  console.log(`  Admin PIN:  ${fixture.competition.adminPin}`)

  if (drawSummary) {
    console.log(
      `  Lottning: ${drawSummary.classes} klasser, ${drawSummary.pools} pools, ${drawSummary.completedMatches} spelade matcher`,
    )
  } else {
    console.log('  Lottning: hoppade over (inga klasser markerade med pooldata).')
  }

  console.log(
    `  Manuella testlagen: ${manualStateSummary.counts.awaiting_attendance} invantar narvaro, ${manualStateSummary.counts.full_attendance} fullstandigt rapporterade, ${manualStateSummary.counts.draw_available} med pooldata, ${manualStateSummary.counts.not_open} ej oppna`,
  )
  console.log(
    `  Fixture: ${fixture.sessions.length} pass och ${fixture.classes.length} klasser fran scripts/fixtures/manual-competition.json`,
  )
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error)

  if (isOptionalMode) {
    console.warn(`Varning: hoppade over fixture-seed for manual-2026: ${message}`)
    process.exit(0)
  }

  console.error(message)
  process.exit(1)
})
