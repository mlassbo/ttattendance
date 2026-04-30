// Shared database helpers for Playwright tests.
// All test competitions must use slugs starting with "test-".

import { randomUUID } from 'node:crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { encryptStoredPin } from '@/lib/pin-encryption'

export function testClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Deletes competitions matching the given slug LIKE pattern and their dependent data.
 * ON DELETE CASCADE handles sessions, classes, players, registrations, and attendance.
 *
 * Use the default pattern ('test-%') only in global setup.
 * In beforeEach hooks, pass a scoped prefix (e.g. 'test-admin-%' or 'test-player-%')
 * so parallel test projects don't delete each other's data.
 */
export async function cleanTestCompetitions(
  supabase: SupabaseClient,
  pattern: string = 'test-%'
): Promise<void> {
  await supabase.from('competitions').delete().like('slug', pattern)
}

export interface SeededPlayer {
  id: string
  name: string
  /** registrationId for the future-deadline class */
  futureRegId: string
  /** registrationId for the past-deadline class */
  pastRegId: string
}

export interface SeededCompetition {
  competitionId: string
  player: SeededPlayer
  players: SeededPlayer[]
}

export interface SeededPlayerWindowCompetition {
  competitionId: string
  player: {
    id: string
    name: string
    openRegId: string
    lockedRegId: string
  }
}

export async function seedSuperadminCompetition(
  supabase: SupabaseClient,
  slug: string,
  options?: {
    name?: string
    playerPin?: string
    adminPin?: string
  },
): Promise<{ competitionId: string }> {
  const name = options?.name ?? 'Test Importtävling'
  const playerPin = options?.playerPin ?? '1111'
  const adminPin = options?.adminPin ?? '2222'

  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash(playerPin, 4),
    bcrypt.hash(adminPin, 4),
  ])
  const secret = process.env.COOKIE_SECRET!

  const { data: competition, error } = await supabase
    .from('competitions')
    .insert({
      name,
      slug,
      player_pin_hash: playerPinHash,
      admin_pin_hash: adminPinHash,
      player_pin_ciphertext: encryptStoredPin(playerPin, secret),
      admin_pin_ciphertext: encryptStoredPin(adminPin, secret),
    })
    .select('id')
    .single()

  if (error || !competition) {
    throw new Error(`Failed to seed superadmin competition: ${error?.message ?? 'Unknown error'}`)
  }

  return { competitionId: competition.id }
}

/**
 * Creates a minimal test competition with:
 *  - 1 session
 *  - 2 classes (one future deadline, one past deadline)
 *  - 1 player registered in both classes
 *
 * Uses bcrypt cost 4 for speed.
 */
export interface SeededAdminData {
  competitionId: string
  futureClassId: string
  pastClassId: string
  /** Players sorted alphabetically: Anna, Bertil, Carin */
  players: Array<{
    id: string
    name: string
    futureRegId: string
    pastRegId: string
  }>
}

/**
 * Creates a test competition for admin tests with:
 *  - 1 session
 *  - 2 classes (one future deadline, one past deadline)
 *  - 3 players registered in both classes
 *  - Pre-seeded attendance: Anna=confirmed in futureClass, Bertil=absent in futureClass
 *    → futureClass counts: 1 confirmed, 1 absent, 1 no-response
 *    → pastClass counts: 0 confirmed, 0 absent, 3 no-response (triggers warning)
 *
 * Uses bcrypt cost 4 for speed. Player PIN is always '0000'.
 */
export async function seedAdminTestCompetition(
  supabase: SupabaseClient,
  slug: string,
  adminPin: string
): Promise<SeededAdminData> {
  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash('0000', 4),
    bcrypt.hash(adminPin, 4),
  ])

  const { data: comp } = await supabase
    .from('competitions')
    .insert({
      name: 'Test Admintävling',
      slug,
      player_pin_hash: playerPinHash,
      admin_pin_hash: adminPinHash,
    })
    .select('id')
    .single()

  const competitionId = comp!.id

  const { data: sessions } = await supabase
    .from('sessions')
    .insert({ competition_id: competitionId, name: 'Lördag förmiddag', date: '2025-09-13', session_order: 1 })
    .select('id')

  const sessionId = sessions![0].id

  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .insert([
      {
        session_id: sessionId,
        name: 'Herrar A-klass',
        start_time:          '2025-09-13T09:00:00+02:00',
        attendance_deadline: '2099-09-13T08:15:00+02:00',
      },
      {
        session_id: sessionId,
        name: 'Utgången klass',
        start_time:          '2020-09-13T09:00:00+02:00',
        attendance_deadline: '2020-09-13T08:15:00+02:00',
      },
    ])
    .select('id, name')

  const futureClass = classes!.find(c => c.name === 'Herrar A-klass')!
  const pastClass   = classes!.find(c => c.name === 'Utgången klass')!

  const { data: players } = await supabase
    .from('players')
    .insert([
      { competition_id: competitionId, name: 'Anna Testsson',   club: 'Test BTK' },
      { competition_id: competitionId, name: 'Bertil Testsson', club: 'Test BTK' },
      { competition_id: competitionId, name: 'Carin Testsson',  club: 'Test BTK' },
    ])
    .select('id, name')

  const [anna, bertil, carin] = players!.sort((a, b) => a.name.localeCompare(b.name, 'sv'))

  const { data: regs } = await supabase
    .from('registrations')
    .insert([
      { player_id: anna.id,   class_id: futureClass.id },
      { player_id: anna.id,   class_id: pastClass.id },
      { player_id: bertil.id, class_id: futureClass.id },
      { player_id: bertil.id, class_id: pastClass.id },
      { player_id: carin.id,  class_id: futureClass.id },
      { player_id: carin.id,  class_id: pastClass.id },
    ])
    .select('id, player_id, class_id')

  const regFor = (playerId: string, classId: string) =>
    regs!.find(r => r.player_id === playerId && r.class_id === classId)!.id

  const annaFutureRegId   = regFor(anna.id,   futureClass.id)
  const bertilFutureRegId = regFor(bertil.id, futureClass.id)

  // Pre-seed attendance: Anna confirmed, Bertil absent in the future class.
  const { error: attError } = await supabase.from('attendance').insert([
    {
      registration_id: annaFutureRegId,
      status: 'confirmed',
      reported_at: new Date().toISOString(),
      reported_by: 'player',
      idempotency_key: `seed-${annaFutureRegId}-confirmed`,
    },
    {
      registration_id: bertilFutureRegId,
      status: 'absent',
      reported_at: new Date().toISOString(),
      reported_by: 'player',
      idempotency_key: `seed-${bertilFutureRegId}-absent`,
    },
  ])
  if (attError) {
    throw new Error(`Failed to seed attendance records: ${attError.message}`)
  }

  return {
    competitionId,
    futureClassId: futureClass.id,
    pastClassId: pastClass.id,
    players: [anna, bertil, carin].map(p => ({
      id: p.id,
      name: p.name,
      futureRegId: regFor(p.id, futureClass.id),
      pastRegId:   regFor(p.id, pastClass.id),
    })),
  }
}

export async function seedPlayerTestCompetition(
  supabase: SupabaseClient,
  slug: string,
  playerPin: string,
  options?: {
    competitionName?: string
    scheduleDate?: string
    futureDeadlineDate?: string
  }
): Promise<SeededCompetition> {
  const competitionName = options?.competitionName ?? 'Test Tävling'
  const scheduleDate = options?.scheduleDate ?? '2025-09-13'
  const futureDeadlineDate = options?.futureDeadlineDate ?? '2099-09-13'

  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash(playerPin, 4),
    bcrypt.hash('0000', 4),
  ])

  const { data: comp } = await supabase
    .from('competitions')
    .insert({
      name: competitionName,
      slug,
      player_pin_hash: playerPinHash,
      admin_pin_hash: adminPinHash,
    })
    .select('id')
    .single()

  const competitionId = comp!.id

  const { data: sessions } = await supabase
    .from('sessions')
    .insert({ competition_id: competitionId, name: 'Lördag förmiddag', date: scheduleDate, session_order: 1 })
    .select('id')

  const sessionId = sessions![0].id

  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .insert([
      {
        session_id: sessionId,
        name: 'Herrar A-klass',
        start_time:           `${scheduleDate}T09:00:00+02:00`,
        attendance_deadline:  `${futureDeadlineDate}T08:15:00+02:00`,
        max_players: 3,
      },
      {
        session_id: sessionId,
        name: 'Utgången klass',
        start_time:           `${scheduleDate}T11:00:00+02:00`,
        attendance_deadline:  '2020-09-13T08:15:00+02:00',
        max_players: 5,
      },
    ])
    .select('id, name')

  const futureClass = classes!.find(c => c.name === 'Herrar A-klass')!
  const pastClass   = classes!.find(c => c.name === 'Utgången klass')!

  const { data: players } = await supabase
    .from('players')
    .insert([
      { competition_id: competitionId, name: 'Anna Testsson', club: 'Test BTK' },
      { competition_id: competitionId, name: 'Bertil Berg', club: 'Test BTK' },
      { competition_id: competitionId, name: 'Karl Valtersson', club: 'Valbo BTK' },
    ])
    .select('id, name')

  const seededPlayers = players!.sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  const primaryPlayer = seededPlayers.find(player => player.name === 'Anna Testsson')!

  const { data: regs } = await supabase
    .from('registrations')
    .insert([
      { player_id: seededPlayers[0].id, class_id: futureClass.id },
      { player_id: seededPlayers[0].id, class_id: pastClass.id },
      { player_id: seededPlayers[1].id, class_id: futureClass.id },
      { player_id: seededPlayers[1].id, class_id: pastClass.id },
      { player_id: seededPlayers[2].id, class_id: futureClass.id },
      { player_id: seededPlayers[2].id, class_id: pastClass.id },
    ])
    .select('id, player_id, class_id')

  const registrationsFor = (playerId: string) => {
    const futureRegId = regs!.find(
      reg => reg.player_id === playerId && reg.class_id === futureClass.id
    )!.id
    const pastRegId = regs!.find(
      reg => reg.player_id === playerId && reg.class_id === pastClass.id
    )!.id

    return { futureRegId, pastRegId }
  }

  const playersWithRegistrations = seededPlayers.map(player => ({
    id: player.id,
    name: player.name,
    ...registrationsFor(player.id),
  }))

  const primaryPlayerWithRegistrations = playersWithRegistrations.find(
    player => player.id === primaryPlayer.id
  )!

  return {
    competitionId,
    player: primaryPlayerWithRegistrations,
    players: playersWithRegistrations,
  }
}

export async function seedPlayerWindowTestCompetition(
  supabase: SupabaseClient,
  slug: string,
  playerPin: string,
  options?: {
    competitionName?: string
    openClassDate?: string
    lockedClassDate?: string
  }
): Promise<SeededPlayerWindowCompetition> {
  const competitionName = options?.competitionName ?? 'Fönster Test Tävling'
  const openClassDate = options?.openClassDate ?? '2020-09-13'
  const lockedClassDate = options?.lockedClassDate ?? '2099-09-15'

  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash(playerPin, 4),
    bcrypt.hash('0000', 4),
  ])

  const { data: comp } = await supabase
    .from('competitions')
    .insert({
      name: competitionName,
      slug,
      player_pin_hash: playerPinHash,
      admin_pin_hash: adminPinHash,
    })
    .select('id')
    .single()

  const competitionId = comp!.id

  const { data: sessions } = await supabase
    .from('sessions')
    .insert([
      {
        competition_id: competitionId,
        name: 'Öppet pass',
        date: openClassDate,
        session_order: 1,
      },
      {
        competition_id: competitionId,
        name: 'Låst pass',
        date: lockedClassDate,
        session_order: 2,
      },
    ])
    .select('id, name')

  const openSessionId = sessions!.find(session => session.name === 'Öppet pass')!.id
  const lockedSessionId = sessions!.find(session => session.name === 'Låst pass')!.id

  const { data: classes } = await supabase
    .from('classes')
    .insert([
      {
        session_id: openSessionId,
        name: 'Öppen klass',
        start_time: `${openClassDate}T09:00:00+02:00`,
        attendance_deadline: '2099-09-13T08:15:00+02:00',
      },
      {
        session_id: lockedSessionId,
        name: 'Låst klass',
        start_time: `${lockedClassDate}T09:00:00+02:00`,
        attendance_deadline: `${lockedClassDate}T08:15:00+02:00`,
      },
    ])
    .select('id, name')

  const openClassId = classes!.find(cls => cls.name === 'Öppen klass')!.id
  const lockedClassId = classes!.find(cls => cls.name === 'Låst klass')!.id

  const { data: player } = await supabase
    .from('players')
    .insert({ competition_id: competitionId, name: 'Anna Testsson', club: 'Test BTK' })
    .select('id, name')
    .single()

  const { data: registrations } = await supabase
    .from('registrations')
    .insert([
      { player_id: player!.id, class_id: openClassId },
      { player_id: player!.id, class_id: lockedClassId },
    ])
    .select('id, class_id')

  return {
    competitionId,
    player: {
      id: player!.id,
      name: player!.name,
      openRegId: registrations!.find(registration => registration.class_id === openClassId)!.id,
      lockedRegId: registrations!.find(registration => registration.class_id === lockedClassId)!.id,
    },
  }
}

export interface SeededClassSettingsCompetition {
  competitionId: string
  sessions: Array<{
    id: string
    name: string
    classes: Array<{
      id: string
      name: string
      startTime: string
      attendanceDeadline: string
      plannedTablesPerPool: number
    }>
  }>
}

export async function seedClassSettingsCompetition(
  supabase: SupabaseClient,
  slug: string,
  playerPin: string = '1111',
  adminPin: string = '2222',
): Promise<SeededClassSettingsCompetition> {
  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash(playerPin, 4),
    bcrypt.hash(adminPin, 4),
  ])

  const { data: comp } = await supabase
    .from('competitions')
    .insert({
      name: 'Test Klassinställningar',
      slug,
      player_pin_hash: playerPinHash,
      admin_pin_hash: adminPinHash,
    })
    .select('id')
    .single()

  const competitionId = comp!.id

  const { data: sessions } = await supabase
    .from('sessions')
    .insert([
      { competition_id: competitionId, name: 'Pass 1', date: '2025-09-13', session_order: 1 },
      { competition_id: competitionId, name: 'Pass 2', date: '2025-09-13', session_order: 2 },
    ])
    .select('id, name')

  const session1 = sessions!.find(s => s.name === 'Pass 1')!
  const session2 = sessions!.find(s => s.name === 'Pass 2')!

  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .insert([
      {
        session_id: session1.id,
        name: 'Herrar A',
        start_time: '2025-09-13T09:00:00+02:00',
        attendance_deadline: '2025-09-13T08:15:00+02:00',
        planned_tables_per_pool: 1,
      },
      {
        session_id: session1.id,
        name: 'Damer A',
        start_time: '2025-09-13T09:30:00+02:00',
        attendance_deadline: '2025-09-13T08:45:00+02:00',
        planned_tables_per_pool: 1,
      },
      {
        session_id: session2.id,
        name: 'Herrar B',
        start_time: '2025-09-13T13:00:00+02:00',
        attendance_deadline: '2025-09-13T12:15:00+02:00',
        planned_tables_per_pool: 1,
      },
    ])
    .select('id, name, session_id, start_time, attendance_deadline, planned_tables_per_pool')

  if (classesError || !classes) {
    throw new Error(`Failed to seed class settings classes: ${classesError?.message ?? 'Unknown error'}`)
  }

  const insertedClasses = classes

  function classesForSession(sessionId: string) {
    return insertedClasses
      .filter(c => c.session_id === sessionId)
      .map(c => ({
        id: c.id,
        name: c.name,
        startTime: c.start_time,
        attendanceDeadline: c.attendance_deadline,
        plannedTablesPerPool: c.planned_tables_per_pool,
      }))
  }

  return {
    competitionId,
    sessions: [
      { id: session1.id, name: 'Pass 1', classes: classesForSession(session1.id) },
      { id: session2.id, name: 'Pass 2', classes: classesForSession(session2.id) },
    ],
  }
}

export interface SeededCompetitionWithPools {
  competitionId: string
  classId: string
  classWithoutPoolsId: string
}

type SeedPoolMatch = {
  playerAIndex: number
  playerBIndex: number
  result: string
  matchOrder?: number
}

export interface SeededCompetitionWithPoolMatches {
  competitionId: string
  classId: string
  className: string
  externalClassKey: string
  poolIds: string[]
}

const POOL_MATCH_PLAYER_TEMPLATES = [
  { name: 'Anna Andersson', club: 'BTK Mansen' },
  { name: 'Björn Berg', club: 'IFK Umeå' },
  { name: 'Carin Cedersund', club: 'Team Eken' },
  { name: 'Doris Dahl', club: 'Lunds BTK' },
  { name: 'Erik Ek', club: 'Kvarnby AK' },
  { name: 'Fia Fors', club: 'Ängby SK' },
  { name: 'Gustav Gran', club: 'Halmstad BTK' },
  { name: 'Hanna Holm', club: 'Norrtulls SK' },
  { name: 'Isak Ivarsson', club: 'Spårvägen BTK' },
  { name: 'Jenny Jönsson', club: 'Boo BTK' },
  { name: 'Kalle Karlsson', club: 'Söderhamns UIF' },
  { name: 'Lina Lund', club: 'Mariedals IK' },
] as const

function getPoolMatchPlayerTemplate(index: number): { name: string; club: string } {
  const template = POOL_MATCH_PLAYER_TEMPLATES[index]

  if (template) {
    return template
  }

  const playerNumber = index + 1
  return {
    name: `Poolspelare ${playerNumber}`,
    club: `Klubb ${playerNumber}`,
  }
}

export async function seedWaitingList(
  supabase: SupabaseClient,
  options: {
    slug: string
    classId: string
    playerName: string
    clubName: string
    joinedAt?: string
    playerId?: string
  },
): Promise<{ registrationId: string; playerId: string }> {
  let playerId = options.playerId

  if (!playerId) {
    const { data: competition, error: competitionError } = await supabase
      .from('competitions')
      .select('id')
      .eq('slug', options.slug)
      .single()

    if (competitionError || !competition) {
      throw new Error(`Failed to find competition for waiting list seed: ${competitionError?.message ?? 'Unknown error'}`)
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        competition_id: competition.id,
        name: options.playerName,
        club: options.clubName,
      })
      .select('id')
      .single()

    if (playerError || !player) {
      throw new Error(`Failed to seed waiting list player: ${playerError?.message ?? 'Unknown error'}`)
    }

    playerId = player.id
  }

  const resolvedPlayerId = playerId
  if (!resolvedPlayerId) {
    throw new Error('Failed to resolve waiting list player id')
  }

  const { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .insert({
      player_id: resolvedPlayerId,
      class_id: options.classId,
      status: 'reserve',
      reserve_joined_at: options.joinedAt ?? new Date().toISOString(),
    })
    .select('id')
    .single()

  if (registrationError || !registration) {
    throw new Error(`Failed to seed waiting list registration: ${registrationError?.message ?? 'Unknown error'}`)
  }

  return {
    registrationId: registration.id,
    playerId: resolvedPlayerId,
  }
}

export async function seedClassDashboard(
  supabase: SupabaseClient,
  slug: string,
  adminPin: string,
): Promise<{ competitionId: string; slug: string }> {
  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash('0000', 4),
    bcrypt.hash(adminPin, 4),
  ])

  const { data: competition, error: competitionError } = await supabase
    .from('competitions')
    .insert({
      name: 'Dashboard Testtävling',
      slug,
      player_pin_hash: playerPinHash,
      admin_pin_hash: adminPinHash,
    })
    .select('id')
    .single()

  if (competitionError || !competition) {
    throw new Error(`Failed to seed dashboard competition: ${competitionError?.message ?? 'Unknown error'}`)
  }

  const competitionId = competition.id

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      competition_id: competitionId,
      name: 'Pass 1',
      date: '2025-09-13',
      session_order: 1,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    throw new Error(`Failed to seed dashboard session: ${sessionError?.message ?? 'Unknown error'}`)
  }

  const { data: classes, error: classError } = await supabase
    .from('classes')
    .insert([
      {
        session_id: session.id,
        name: 'H-klass A',
        start_time: '2025-09-13T09:00:00+02:00',
        attendance_deadline: '2025-09-13T08:15:00+02:00',
        max_players: 16,
      },
      {
        session_id: session.id,
        name: 'D-klass A',
        start_time: '2025-09-13T10:30:00+02:00',
        attendance_deadline: '2025-09-13T09:45:00+02:00',
        max_players: 8,
      },
      {
        session_id: session.id,
        name: 'Mixed',
        start_time: '2025-09-13T12:00:00+02:00',
        attendance_deadline: '2025-09-13T11:15:00+02:00',
        max_players: null,
      },
    ])
    .select('id, name')

  if (classError || !classes) {
    throw new Error(`Failed to seed dashboard classes: ${classError?.message ?? 'Unknown error'}`)
  }

  const hClass = classes.find(classRow => classRow.name === 'H-klass A')
  const dClass = classes.find(classRow => classRow.name === 'D-klass A')
  const mixedClass = classes.find(classRow => classRow.name === 'Mixed')

  if (!hClass || !dClass || !mixedClass) {
    throw new Error('Failed to resolve seeded dashboard classes')
  }

  const playerRows = Array.from({ length: 30 }, (_, index) => ({
    competition_id: competitionId,
    name: `Dashboardspelare ${index + 1}`,
    club: index < 15 ? 'Test BTK' : 'Valbo BTK',
  }))

  const { data: players, error: playerError } = await supabase
    .from('players')
    .insert(playerRows)
    .select('id')

  if (playerError || !players) {
    throw new Error(`Failed to seed dashboard players: ${playerError?.message ?? 'Unknown error'}`)
  }

  const registrations = [
    ...players.slice(0, 14).map(player => ({
      player_id: player.id,
      class_id: hClass.id,
      status: 'registered' as const,
    })),
    ...players.slice(14, 22).map(player => ({
      player_id: player.id,
      class_id: dClass.id,
      status: 'registered' as const,
    })),
    ...players.slice(22, 25).map((player, index) => ({
      player_id: player.id,
      class_id: dClass.id,
      status: 'reserve' as const,
      reserve_joined_at: new Date(Date.UTC(2025, 0, 1, 8, index, 0)).toISOString(),
    })),
    ...players.slice(25, 30).map(player => ({
      player_id: player.id,
      class_id: mixedClass.id,
      status: 'registered' as const,
    })),
  ]

  const { error: registrationError } = await supabase
    .from('registrations')
    .insert(registrations)

  if (registrationError) {
    throw new Error(`Failed to seed dashboard registrations: ${registrationError.message}`)
  }

  return { competitionId, slug }
}

export async function seedCompetitionWithPools(
  supabase: SupabaseClient,
  slug: string,
  options?: {
    name?: string
    playerPin?: string
    adminPin?: string
  },
): Promise<SeededCompetitionWithPools> {
  if (!slug.startsWith('test-player-clv-')) {
    throw new Error('seedCompetitionWithPools requires a slug starting with "test-player-clv-"')
  }

  const name = options?.name ?? 'Liveklass Testtävling'
  const playerPin = options?.playerPin ?? '1111'
  const adminPin = options?.adminPin ?? '2222'

  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash(playerPin, 4),
    bcrypt.hash(adminPin, 4),
  ])
  const secret = process.env.COOKIE_SECRET!

  const { data: competition, error: competitionError } = await supabase
    .from('competitions')
    .insert({
      name,
      slug,
      player_pin_hash: playerPinHash,
      admin_pin_hash: adminPinHash,
      player_pin_ciphertext: encryptStoredPin(playerPin, secret),
      admin_pin_ciphertext: encryptStoredPin(adminPin, secret),
    })
    .select('id')
    .single()

  if (competitionError || !competition) {
    throw new Error(`Failed to seed competition with pools: ${competitionError?.message ?? 'Unknown error'}`)
  }

  const competitionId = competition.id

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      competition_id: competitionId,
      name: 'Pass 1',
      date: '2025-09-13',
      session_order: 1,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    throw new Error(`Failed to seed live-view session: ${sessionError?.message ?? 'Unknown error'}`)
  }

  const { data: classes, error: classError } = await supabase
    .from('classes')
    .insert([
      {
        session_id: session.id,
        name: 'Liveklass A',
        start_time: '2025-09-13T09:00:00+02:00',
        attendance_deadline: '2099-09-13T08:15:00+02:00',
        max_players: 8,
      },
      {
        session_id: session.id,
        name: 'Klass utan lottning',
        start_time: '2025-09-13T11:00:00+02:00',
        attendance_deadline: '2099-09-13T10:15:00+02:00',
        max_players: 4,
      },
    ])
    .select('id, name')

  if (classError || !classes) {
    throw new Error(`Failed to seed live-view classes: ${classError?.message ?? 'Unknown error'}`)
  }

  const classWithPools = classes.find(classRow => classRow.name === 'Liveklass A')
  const classWithoutPools = classes.find(classRow => classRow.name === 'Klass utan lottning')

  if (!classWithPools || !classWithoutPools) {
    throw new Error('Failed to resolve live-view class ids')
  }

  const { data: players, error: playerError } = await supabase
    .from('players')
    .insert([
      { competition_id: competitionId, name: 'Anna Andersson', club: 'BTK Mansen' },
      { competition_id: competitionId, name: 'Björn Berg', club: 'IFK Umeå' },
      { competition_id: competitionId, name: 'Clara Carlsson', club: 'Norrtulls SK' },
      { competition_id: competitionId, name: 'David Dahl', club: 'Spårvägen BTK' },
      { competition_id: competitionId, name: 'Erik Ek', club: 'Kvarnby AK' },
    ])
    .select('id, name')

  if (playerError || !players) {
    throw new Error(`Failed to seed live-view players: ${playerError?.message ?? 'Unknown error'}`)
  }

  const playerIdByName = new Map(players.map(player => [player.name, player.id]))

  const { data: registrations, error: registrationError } = await supabase
    .from('registrations')
    .insert([
      {
        player_id: playerIdByName.get('Anna Andersson')!,
        class_id: classWithPools.id,
        status: 'registered',
      },
      {
        player_id: playerIdByName.get('Björn Berg')!,
        class_id: classWithPools.id,
        status: 'registered',
      },
      {
        player_id: playerIdByName.get('Clara Carlsson')!,
        class_id: classWithoutPools.id,
        status: 'registered',
      },
      {
        player_id: playerIdByName.get('David Dahl')!,
        class_id: classWithoutPools.id,
        status: 'registered',
      },
      {
        player_id: playerIdByName.get('Erik Ek')!,
        class_id: classWithoutPools.id,
        status: 'reserve',
        reserve_joined_at: '2025-01-01T08:00:00.000Z',
      },
    ])
    .select('id')

  if (registrationError || !registrations) {
    throw new Error(`Failed to seed live-view registrations: ${registrationError?.message ?? 'Unknown error'}`)
  }

  const timestamp = '2025-09-13T08:00:00.000Z'
  const snapshotId = randomUUID()
  const liveClassSnapshotId = randomUUID()
  const fallbackClassSnapshotId = randomUUID()
  const poolOneId = randomUUID()
  const poolTwoId = randomUUID()

  const { error: snapshotError } = await supabase
    .from('ondata_integration_snapshots')
    .insert({
      id: snapshotId,
      competition_id: competitionId,
      schema_version: 1,
      payload_hash: `seed-${snapshotId}`,
      received_at: timestamp,
      processed_at: timestamp,
      processing_status: 'processed',
      error_message: null,
      source_file_name: 'seed-live.json',
      source_file_path: 'tests/seed-live.json',
      source_file_modified_at: timestamp,
      source_copied_to_temp_at: timestamp,
      source_processed_at: timestamp,
      source_file_hash: `hash-${snapshotId}`,
      summary_classes: 2,
      summary_pools: 2,
      summary_completed_matches: 0,
      raw_payload: {
        schemaVersion: 1,
        source: {
          fileName: 'seed-live.json',
          filePath: 'tests/seed-live.json',
          fileModifiedAt: timestamp,
          copiedToTempAt: timestamp,
          processedAt: timestamp,
          fileHash: `hash-${snapshotId}`,
        },
        summary: {
          classes: 2,
          pools: 2,
          completedMatches: 0,
        },
        classes: [],
      },
    })

  if (snapshotError) {
    throw new Error(`Failed to seed live snapshot: ${snapshotError.message}`)
  }

  const { error: snapshotClassesError } = await supabase
    .from('ondata_integration_snapshot_classes')
    .insert([
      {
        id: liveClassSnapshotId,
        snapshot_id: snapshotId,
        class_order: 0,
        external_class_key: 'liveklass-a',
        class_name: classWithPools.name,
        class_date: '2025-09-13',
        class_time: '09:00',
      },
      {
        id: fallbackClassSnapshotId,
        snapshot_id: snapshotId,
        class_order: 1,
        external_class_key: 'klass-utan-lottning',
        class_name: classWithoutPools.name,
        class_date: '2025-09-13',
        class_time: '11:00',
      },
    ])

  if (snapshotClassesError) {
    throw new Error(`Failed to seed live snapshot classes: ${snapshotClassesError.message}`)
  }

  const { error: poolsError } = await supabase
    .from('ondata_integration_snapshot_pools')
    .insert([
      {
        id: poolOneId,
        snapshot_class_id: liveClassSnapshotId,
        pool_order: 0,
        pool_number: 1,
        completed_match_count: 0,
      },
      {
        id: poolTwoId,
        snapshot_class_id: liveClassSnapshotId,
        pool_order: 1,
        pool_number: 2,
        completed_match_count: 0,
      },
    ])

  if (poolsError) {
    throw new Error(`Failed to seed live pools: ${poolsError.message}`)
  }

  const { error: snapshotPlayersError } = await supabase
    .from('ondata_integration_snapshot_players')
    .insert([
      {
        snapshot_pool_id: poolOneId,
        player_order: 0,
        name: 'Anna Andersson',
        club: 'BTK Mansen',
      },
      {
        snapshot_pool_id: poolOneId,
        player_order: 1,
        name: 'Björn Berg',
        club: 'IFK Umeå',
      },
      {
        snapshot_pool_id: poolTwoId,
        player_order: 0,
        name: 'Carin Cedersund',
        club: 'Team Eken',
      },
      {
        snapshot_pool_id: poolTwoId,
        player_order: 1,
        name: 'Doris Dahl',
        club: 'Lunds BTK',
      },
    ])

  if (snapshotPlayersError) {
    throw new Error(`Failed to seed live snapshot players: ${snapshotPlayersError.message}`)
  }

  const { error: statusError } = await supabase
    .from('ondata_integration_status')
    .insert({
      competition_id: competitionId,
      current_snapshot_id: snapshotId,
      last_received_at: timestamp,
      last_processed_at: timestamp,
      last_payload_hash: `seed-${snapshotId}`,
      last_source_file_modified_at: timestamp,
      last_source_processed_at: timestamp,
      last_error: null,
      last_summary_classes: 2,
      last_summary_pools: 2,
      last_summary_completed_matches: 0,
      updated_at: timestamp,
    })

  if (statusError) {
    throw new Error(`Failed to seed live integration status: ${statusError.message}`)
  }

  return {
    competitionId,
    classId: classWithPools.id,
    classWithoutPoolsId: classWithoutPools.id,
  }
}

export async function seedCompetitionWithPoolMatches(
  supabase: SupabaseClient,
  slug: string,
  options?: {
    poolCount?: number
    playersPerPool?: number
    matchesPerPool?: SeedPoolMatch[][]
  },
): Promise<SeededCompetitionWithPoolMatches> {
  if (!slug.startsWith('test-player-pmr-') && !slug.startsWith('test-player-pres-')) {
    throw new Error('seedCompetitionWithPoolMatches requires a slug starting with "test-player-pmr-" or "test-player-pres-"')
  }

  const poolCount = options?.poolCount ?? 1
  const playersPerPool = options?.playersPerPool ?? 4
  const matchesPerPool = options?.matchesPerPool ?? []
  const externalClassKey = 'poolmatch-liveklass-a'

  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash('1111', 4),
    bcrypt.hash('2222', 4),
  ])
  const secret = process.env.COOKIE_SECRET!

  const { data: competition, error: competitionError } = await supabase
    .from('competitions')
    .insert({
      name: 'Poolmatcher Testtävling',
      slug,
      player_pin_hash: playerPinHash,
      admin_pin_hash: adminPinHash,
      player_pin_ciphertext: encryptStoredPin('1111', secret),
      admin_pin_ciphertext: encryptStoredPin('2222', secret),
    })
    .select('id')
    .single()

  if (competitionError || !competition) {
    throw new Error(`Failed to seed pool-match competition: ${competitionError?.message ?? 'Unknown error'}`)
  }

  const competitionId = competition.id

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      competition_id: competitionId,
      name: 'Pass 1',
      date: '2025-09-13',
      session_order: 1,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    throw new Error(`Failed to seed pool-match session: ${sessionError?.message ?? 'Unknown error'}`)
  }

  const { data: classRow, error: classError } = await supabase
    .from('classes')
    .insert({
      session_id: session.id,
      name: 'Liveklass A',
      start_time: '2025-09-13T09:00:00+02:00',
      attendance_deadline: '2099-09-13T08:15:00+02:00',
      max_players: poolCount * playersPerPool,
    })
    .select('id, name')
    .single()

  if (classError || !classRow) {
    throw new Error(`Failed to seed pool-match class: ${classError?.message ?? 'Unknown error'}`)
  }

  const seededPlayers = Array.from({ length: poolCount * playersPerPool }, (_, index) => {
    const template = getPoolMatchPlayerTemplate(index)
    return {
      competition_id: competitionId,
      name: template.name,
      club: template.club,
    }
  })

  const { data: players, error: playersError } = await supabase
    .from('players')
    .insert(seededPlayers)
    .select('id, name')

  if (playersError || !players) {
    throw new Error(`Failed to seed pool-match players: ${playersError?.message ?? 'Unknown error'}`)
  }

  const playerIdByName = new Map(players.map(player => [player.name, player.id]))

  const { error: registrationError } = await supabase
    .from('registrations')
    .insert(seededPlayers.map(player => ({
      player_id: playerIdByName.get(player.name)!,
      class_id: classRow.id,
      status: 'registered' as const,
    })))

  if (registrationError) {
    throw new Error(`Failed to seed pool-match registrations: ${registrationError.message}`)
  }

  const timestamp = '2025-09-13T08:00:00.000Z'
  const snapshotId = randomUUID()
  const snapshotClassId = randomUUID()
  const poolIds = Array.from({ length: poolCount }, () => randomUUID())
  const totalSeededMatches = matchesPerPool.reduce((total, poolMatches) => total + poolMatches.length, 0)

  const { error: snapshotError } = await supabase
    .from('ondata_integration_snapshots')
    .insert({
      id: snapshotId,
      competition_id: competitionId,
      schema_version: 1,
      payload_hash: `seed-${snapshotId}`,
      received_at: timestamp,
      processed_at: timestamp,
      processing_status: 'processed',
      error_message: null,
      source_file_name: 'seed-pool-matches.json',
      source_file_path: 'tests/seed-pool-matches.json',
      source_file_modified_at: timestamp,
      source_copied_to_temp_at: timestamp,
      source_processed_at: timestamp,
      source_file_hash: `hash-${snapshotId}`,
      summary_classes: 1,
      summary_pools: poolCount,
      summary_completed_matches: totalSeededMatches,
      raw_payload: {
        schemaVersion: 1,
        source: {
          fileName: 'seed-pool-matches.json',
          filePath: 'tests/seed-pool-matches.json',
          fileModifiedAt: timestamp,
          copiedToTempAt: timestamp,
          processedAt: timestamp,
          fileHash: `hash-${snapshotId}`,
        },
        summary: {
          classes: 1,
          pools: poolCount,
          completedMatches: totalSeededMatches,
        },
        classes: [],
      },
    })

  if (snapshotError) {
    throw new Error(`Failed to seed pool-match snapshot: ${snapshotError.message}`)
  }

  const { error: snapshotClassError } = await supabase
    .from('ondata_integration_snapshot_classes')
    .insert({
      id: snapshotClassId,
      snapshot_id: snapshotId,
      class_order: 0,
      external_class_key: externalClassKey,
      class_name: classRow.name,
      class_date: '2025-09-13',
      class_time: '09:00',
    })

  if (snapshotClassError) {
    throw new Error(`Failed to seed pool-match snapshot class: ${snapshotClassError.message}`)
  }

  const poolRows = poolIds.map((poolId, poolIndex) => ({
    id: poolId,
    snapshot_class_id: snapshotClassId,
    pool_order: poolIndex,
    pool_number: poolIndex + 1,
    completed_match_count: matchesPerPool[poolIndex]?.length ?? 0,
  }))

  const { error: poolsError } = await supabase
    .from('ondata_integration_snapshot_pools')
    .insert(poolRows)

  if (poolsError) {
    throw new Error(`Failed to seed pool-match pools: ${poolsError.message}`)
  }

  const snapshotPlayers = poolIds.flatMap((poolId, poolIndex) =>
    Array.from({ length: playersPerPool }, (_, playerIndex) => {
      const template = getPoolMatchPlayerTemplate(poolIndex * playersPerPool + playerIndex)
      return {
        snapshot_pool_id: poolId,
        player_order: playerIndex,
        name: template.name,
        club: template.club,
      }
    }),
  )

  const { error: snapshotPlayersError } = await supabase
    .from('ondata_integration_snapshot_players')
    .insert(snapshotPlayers)

  if (snapshotPlayersError) {
    throw new Error(`Failed to seed pool-match snapshot players: ${snapshotPlayersError.message}`)
  }

  const snapshotMatches = poolIds.flatMap((poolId, poolIndex) => {
    const poolPlayers = snapshotPlayers.filter(player => player.snapshot_pool_id === poolId)

    return (matchesPerPool[poolIndex] ?? []).map((match, matchIndex) => ({
      snapshot_pool_id: poolId,
      match_order: match.matchOrder ?? matchIndex,
      match_number: matchIndex + 1,
      player_a_name: poolPlayers[match.playerAIndex]?.name ?? null,
      player_a_club: poolPlayers[match.playerAIndex]?.club ?? null,
      player_b_name: poolPlayers[match.playerBIndex]?.name ?? null,
      player_b_club: poolPlayers[match.playerBIndex]?.club ?? null,
      result: match.result,
    }))
  })

  if (snapshotMatches.length > 0) {
    const { error: snapshotMatchesError } = await supabase
      .from('ondata_integration_snapshot_matches')
      .insert(snapshotMatches)

    if (snapshotMatchesError) {
      throw new Error(`Failed to seed pool-match snapshot matches: ${snapshotMatchesError.message}`)
    }
  }

  const { error: statusError } = await supabase
    .from('ondata_integration_status')
    .insert({
      competition_id: competitionId,
      current_snapshot_id: snapshotId,
      last_received_at: timestamp,
      last_processed_at: timestamp,
      last_payload_hash: `seed-${snapshotId}`,
      last_source_file_modified_at: timestamp,
      last_source_processed_at: timestamp,
      last_error: null,
      last_summary_classes: 1,
      last_summary_pools: poolCount,
      last_summary_completed_matches: totalSeededMatches,
      updated_at: timestamp,
    })

  if (statusError) {
    throw new Error(`Failed to seed pool-match integration status: ${statusError.message}`)
  }

  return {
    competitionId,
    classId: classRow.id,
    className: classRow.name,
    externalClassKey,
    poolIds,
  }
}

export type SeededAdminPoolProgressClass = {
  id: string
  name: string
  startTime: string
  plannedTablesPerPool: number
}

export type SeededAdminPoolProgressCompetition = {
  competitionId: string
  classes: SeededAdminPoolProgressClass[]
}

type AdminPoolProgressClassSeed = {
  name: string
  /** ISO timestamp — used as classes.start_time. Controls delay calculations. */
  startTime: string
  /** Skip the workflow changes so the class stays in "awaiting_attendance". */
  phase?: 'pool_play_in_progress' | 'pool_play_complete' | 'awaiting_attendance'
  /** Number of registered players (also confirmed attendance). Defaults to 4. */
  registeredPlayers?: number
  /** Planned number of tables used for each pool in this class. Defaults to 1. */
  plannedTablesPerPool?: number
}

async function seedClassPoolPlayWorkflow(
  supabase: SupabaseClient,
  classId: string,
  phase: 'pool_play_in_progress' | 'pool_play_complete',
  now: string,
) {
  const statuses: Array<{ step_key: string; status: 'not_started' | 'active' | 'done' | 'skipped' }> = [
    { step_key: 'seed_class', status: 'skipped' },
    { step_key: 'publish_pools', status: 'done' },
    { step_key: 'register_match_results', status: phase === 'pool_play_complete' ? 'done' : 'active' },
    { step_key: 'publish_pool_results', status: 'not_started' },
    { step_key: 'a_playoff', status: 'not_started' },
    { step_key: 'b_playoff', status: 'not_started' },
    { step_key: 'prize_ceremony', status: 'not_started' },
  ]

  const { error } = await supabase
    .from('class_workflow_steps')
    .upsert(
      statuses.map(status => ({
        class_id: classId,
        step_key: status.step_key,
        status: status.status,
        updated_at: now,
      })),
      { onConflict: 'class_id,step_key' },
    )

  if (error) {
    throw new Error(`Failed to seed class workflow: ${error.message}`)
  }
}

export async function seedAdminPoolProgressCompetition(
  supabase: SupabaseClient,
  slug: string,
  classSeeds: AdminPoolProgressClassSeed[],
  options?: { adminPin?: string; playerPin?: string },
): Promise<SeededAdminPoolProgressCompetition> {
  if (classSeeds.length === 0) {
    throw new Error('seedAdminPoolProgressCompetition requires at least one class')
  }

  const adminPin = options?.adminPin ?? '2222'
  const playerPin = options?.playerPin ?? '1111'

  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash(playerPin, 4),
    bcrypt.hash(adminPin, 4),
  ])

  const { data: competition, error: competitionError } = await supabase
    .from('competitions')
    .insert({
      name: 'Pool Progress Testtävling',
      slug,
      player_pin_hash: playerPinHash,
      admin_pin_hash: adminPinHash,
    })
    .select('id')
    .single()

  if (competitionError || !competition) {
    throw new Error(`Failed to seed pool-progress competition: ${competitionError?.message ?? 'Unknown error'}`)
  }

  const competitionId = competition.id

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      competition_id: competitionId,
      name: 'Pass 1',
      date: '2025-09-13',
      session_order: 1,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    throw new Error(`Failed to seed pool-progress session: ${sessionError?.message ?? 'Unknown error'}`)
  }

  const seenNames = new Set<string>()
  for (const classSeed of classSeeds) {
    if (seenNames.has(classSeed.name)) {
      throw new Error(`Duplicate class name in seed: ${classSeed.name}`)
    }
    seenNames.add(classSeed.name)
  }

  const pastDeadline = '2020-01-01T00:00:00Z'
  const futureDeadline = '2099-01-01T00:00:00Z'
  const { data: insertedClasses, error: classError } = await supabase
    .from('classes')
    .insert(
      classSeeds.map(classSeed => ({
        session_id: session.id,
        name: classSeed.name,
        start_time: classSeed.startTime,
        planned_tables_per_pool: classSeed.plannedTablesPerPool ?? 1,
        attendance_deadline:
          classSeed.phase === 'awaiting_attendance' ? futureDeadline : pastDeadline,
      })),
    )
    .select('id, name, start_time, planned_tables_per_pool')

  if (classError || !insertedClasses) {
    throw new Error(`Failed to seed pool-progress classes: ${classError?.message ?? 'Unknown error'}`)
  }

  const classesById = new Map<string, { id: string; name: string; start_time: string; planned_tables_per_pool: number }>()
  for (const row of insertedClasses) {
    classesById.set(row.name, row)
  }

  const now = new Date().toISOString()
  let playerIndex = 0

  for (const classSeed of classSeeds) {
    const classRow = classesById.get(classSeed.name)!
    const registeredPlayers = classSeed.registeredPlayers ?? 4

    const playerRows = Array.from({ length: registeredPlayers }, () => {
      playerIndex += 1
      return {
        competition_id: competitionId,
        name: `Poolspelare ${playerIndex}`,
        club: 'Poolklubb',
      }
    })

    const { data: insertedPlayers, error: playerError } = await supabase
      .from('players')
      .insert(playerRows)
      .select('id')

    if (playerError || !insertedPlayers) {
      throw new Error(`Failed to seed pool-progress players: ${playerError?.message ?? 'Unknown error'}`)
    }

    const { data: regs, error: regError } = await supabase
      .from('registrations')
      .insert(
        insertedPlayers.map(player => ({
          player_id: player.id,
          class_id: classRow.id,
          status: 'registered' as const,
        })),
      )
      .select('id')

    if (regError || !regs) {
      throw new Error(`Failed to seed pool-progress registrations: ${regError?.message ?? 'Unknown error'}`)
    }

    const phase = classSeed.phase ?? 'pool_play_in_progress'

    if (phase !== 'awaiting_attendance') {
      const { error: attendanceError } = await supabase.from('attendance').insert(
        regs.map(reg => ({
          registration_id: reg.id,
          status: 'confirmed' as const,
          reported_at: now,
          reported_by: 'admin' as const,
          idempotency_key: `pool-progress-seed-${reg.id}`,
        })),
      )

      if (attendanceError) {
        throw new Error(`Failed to seed pool-progress attendance: ${attendanceError.message}`)
      }

      await seedClassPoolPlayWorkflow(supabase, classRow.id, phase, now)
    }
  }

  return {
    competitionId,
    classes: classSeeds.map(classSeed => {
      const row = classesById.get(classSeed.name)!
      return {
        id: row.id,
        name: row.name,
        startTime: row.start_time,
        plannedTablesPerPool: row.planned_tables_per_pool,
      }
    }),
  }
}

export type OnDataSnapshotPoolSeed = {
  poolNumber: number
  playerCount: number
  completedMatchCount: number
}

export type OnDataSnapshotClassSeed = {
  className: string
  externalClassKey?: string
  classDate?: string
  classTime?: string
  pools: OnDataSnapshotPoolSeed[]
}

export async function seedOnDataSnapshotForClasses(
  supabase: SupabaseClient,
  input: {
    competitionId: string
    receivedAt: string
    classes: OnDataSnapshotClassSeed[]
  },
): Promise<{ snapshotId: string }> {
  await supabase.from('ondata_integration_snapshots').delete().eq('competition_id', input.competitionId)
  await supabase.from('ondata_integration_status').delete().eq('competition_id', input.competitionId)

  const snapshotId = randomUUID()
  const totalPools = input.classes.reduce((sum, cls) => sum + cls.pools.length, 0)
  const totalCompleted = input.classes.reduce(
    (sum, cls) => sum + cls.pools.reduce((acc, pool) => acc + pool.completedMatchCount, 0),
    0,
  )

  const { error: snapshotError } = await supabase.from('ondata_integration_snapshots').insert({
    id: snapshotId,
    competition_id: input.competitionId,
    schema_version: 1,
    payload_hash: `seed-${snapshotId}`,
    received_at: input.receivedAt,
    processed_at: input.receivedAt,
    processing_status: 'processed',
    error_message: null,
    source_file_name: 'pool-progress-seed.json',
    source_file_path: 'tests/pool-progress-seed.json',
    source_file_modified_at: input.receivedAt,
    source_copied_to_temp_at: input.receivedAt,
    source_processed_at: input.receivedAt,
    source_file_hash: `hash-${snapshotId}`,
    summary_classes: input.classes.length,
    summary_pools: totalPools,
    summary_completed_matches: totalCompleted,
    raw_payload: { schemaVersion: 1, source: {}, summary: {}, classes: [] },
  })

  if (snapshotError) {
    throw new Error(`Failed to seed pool-progress snapshot: ${snapshotError.message}`)
  }

  let classOrder = 0
  for (const cls of input.classes) {
    const snapshotClassId = randomUUID()

    const { error: classError } = await supabase.from('ondata_integration_snapshot_classes').insert({
      id: snapshotClassId,
      snapshot_id: snapshotId,
      class_order: classOrder,
      external_class_key: cls.externalClassKey ?? `seed-${classOrder}`,
      class_name: cls.className,
      class_date: cls.classDate ?? '2025-09-13',
      class_time: cls.classTime ?? '09:00',
    })
    classOrder += 1

    if (classError) {
      throw new Error(`Failed to seed pool-progress snapshot class: ${classError.message}`)
    }

    for (let poolIndex = 0; poolIndex < cls.pools.length; poolIndex += 1) {
      const poolSeed = cls.pools[poolIndex]
      const poolId = randomUUID()

      const { error: poolError } = await supabase.from('ondata_integration_snapshot_pools').insert({
        id: poolId,
        snapshot_class_id: snapshotClassId,
        pool_order: poolIndex,
        pool_number: poolSeed.poolNumber,
        completed_match_count: poolSeed.completedMatchCount,
      })

      if (poolError) {
        throw new Error(`Failed to seed pool-progress snapshot pool: ${poolError.message}`)
      }

      if (poolSeed.playerCount > 0) {
        const { error: playerError } = await supabase.from('ondata_integration_snapshot_players').insert(
          Array.from({ length: poolSeed.playerCount }, (_, i) => ({
            snapshot_pool_id: poolId,
            player_order: i,
            name: `Pool ${poolSeed.poolNumber} spelare ${i + 1}`,
            club: 'Snapshotklubb',
          })),
        )

        if (playerError) {
          throw new Error(`Failed to seed pool-progress snapshot players: ${playerError.message}`)
        }
      }
    }
  }

  const { error: statusError } = await supabase.from('ondata_integration_status').insert({
    competition_id: input.competitionId,
    current_snapshot_id: snapshotId,
    last_received_at: input.receivedAt,
    last_processed_at: input.receivedAt,
    last_payload_hash: `seed-${snapshotId}`,
    last_source_file_modified_at: input.receivedAt,
    last_source_processed_at: input.receivedAt,
    last_error: null,
    last_summary_classes: input.classes.length,
    last_summary_pools: totalPools,
    last_summary_completed_matches: totalCompleted,
    updated_at: input.receivedAt,
  })

  if (statusError) {
    throw new Error(`Failed to seed pool-progress integration status: ${statusError.message}`)
  }

  return { snapshotId }
}

export async function seedClassPoolTables(
  supabase: SupabaseClient,
  classId: string,
  pools: Array<{ poolNumber: number; tables: number[] }>,
): Promise<void> {
  if (pools.length === 0) return

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('class_pool_tables')
    .upsert(
      pools.map(pool => ({
        class_id: classId,
        pool_number: pool.poolNumber,
        tables: pool.tables,
        updated_at: now,
      })),
      { onConflict: 'class_id,pool_number' },
    )

  if (error) {
    throw new Error(`Failed to seed class pool tables: ${error.message}`)
  }
}

export async function seedPoolResultSnapshots(
  supabase: SupabaseClient,
  input: {
    competitionId: string
    classes: Array<{
      externalClassKey: string
      className: string
      classDate: string
      classTime: string
      pools: Array<{
        poolNumber: number
        standings: Array<{
          placement: number
          playerName: string
          clubName: string | null
        }>
      }>
    }>
  },
): Promise<{ snapshotIds: Record<string, string> }> {
  const snapshotIds: Record<string, string> = {}
  const processedAt = new Date().toISOString()

  for (const classSeed of input.classes) {
    const snapshotId = randomUUID()
    snapshotIds[classSeed.externalClassKey] = snapshotId

    const { error: snapshotError } = await supabase
      .from('ondata_pool_result_snapshots')
      .insert({
        id: snapshotId,
        competition_id: input.competitionId,
        external_class_key: classSeed.externalClassKey,
        source_class_id: classSeed.externalClassKey,
        class_name: classSeed.className,
        class_date: classSeed.classDate,
        class_time: classSeed.classTime,
        source_file_name: `pool-results-${classSeed.externalClassKey}.json`,
        source_file_path: `tests/pool-results-${classSeed.externalClassKey}.json`,
        source_file_modified_at: processedAt,
        source_processed_at: processedAt,
        source_file_hash: `hash-${snapshotId}`,
        payload_hash: `seed-${snapshotId}`,
        processing_status: 'processed',
        last_error: null,
        raw_payload: {
          schemaVersion: 1,
          competitionSlug: 'test-seed',
          source: {
            sourceType: 'ondata-stage4',
            fileName: `pool-results-${classSeed.externalClassKey}.json`,
            filePath: `tests/pool-results-${classSeed.externalClassKey}.json`,
            fileModifiedAt: processedAt,
            processedAt,
            fileHash: `hash-${snapshotId}`,
          },
          class: {
            externalClassKey: classSeed.externalClassKey,
            sourceClassId: classSeed.externalClassKey,
            className: classSeed.className,
            classDate: classSeed.classDate,
            classTime: classSeed.classTime,
            pools: [],
          },
        },
        received_at: processedAt,
        processed_at: processedAt,
      })

    if (snapshotError) {
      throw new Error(`Failed to seed pool-result snapshot: ${snapshotError.message}`)
    }

    const poolRows = classSeed.pools.map(pool => ({
      id: randomUUID(),
      snapshot_id: snapshotId,
      pool_number: pool.poolNumber,
    }))

    if (poolRows.length > 0) {
      const { error: poolError } = await supabase
        .from('ondata_pool_result_snapshot_pools')
        .insert(poolRows)

      if (poolError) {
        throw new Error(`Failed to seed pool-result pools: ${poolError.message}`)
      }
    }

    const poolIdByNumber = new Map(poolRows.map(pool => [pool.pool_number, pool.id]))
    const standingRows = classSeed.pools.flatMap(pool =>
      pool.standings.map(standing => ({
        id: randomUUID(),
        pool_id: poolIdByNumber.get(pool.poolNumber)!,
        placement: standing.placement,
        player_name: standing.playerName,
        club_name: standing.clubName,
        matches_won: 0,
        matches_lost: 0,
        sets_won: 0,
        sets_lost: 0,
        points_for: 0,
        points_against: 0,
      })),
    )

    if (standingRows.length > 0) {
      const { error: standingError } = await supabase
        .from('ondata_pool_result_snapshot_standings')
        .insert(standingRows)

      if (standingError) {
        throw new Error(`Failed to seed pool-result standings: ${standingError.message}`)
      }
    }

    const { error: statusError } = await supabase
      .from('ondata_pool_result_status')
      .upsert({
        competition_id: input.competitionId,
        external_class_key: classSeed.externalClassKey,
        current_snapshot_id: snapshotId,
        last_payload_hash: `seed-${snapshotId}`,
        last_processed_at: processedAt,
        last_error: null,
        updated_at: processedAt,
      }, { onConflict: 'competition_id,external_class_key' })

    if (statusError) {
      throw new Error(`Failed to seed pool-result status: ${statusError.message}`)
    }
  }

  return { snapshotIds }
}

export type SeededAdminPlayoffClass = {
  id: string
  name: string
  startTime: string
  externalClassKey: string
}

export type SeededAdminPlayoffCompetition = {
  competitionId: string
  classes: SeededAdminPlayoffClass[]
}

export type AdminPlayoffPhase =
  | 'awaiting_attendance'
  | 'pool_play_in_progress'
  | 'a_playoff_in_progress'
  | 'playoffs_in_progress'
  | 'playoffs_complete'

type AdminPlayoffClassSeed = {
  name: string
  startTime: string
  phase?: AdminPlayoffPhase
  registeredPlayers?: number
  externalClassKey?: string
}

async function seedClassPlayoffWorkflow(
  supabase: SupabaseClient,
  classId: string,
  phase: AdminPlayoffPhase,
  now: string,
) {
  if (phase === 'awaiting_attendance') {
    return
  }

  const rows: Array<{ step_key: string; status: 'not_started' | 'active' | 'done' | 'skipped' }> = [
    { step_key: 'seed_class', status: 'skipped' },
    { step_key: 'publish_pools', status: 'done' },
    { step_key: 'register_match_results', status: phase === 'pool_play_in_progress' ? 'active' : 'done' },
  ]

  if (phase === 'pool_play_in_progress') {
    // leave remaining steps at their default (not_started)
  } else {
    rows.push({ step_key: 'publish_pool_results', status: 'done' })

    if (phase === 'a_playoff_in_progress') {
      rows.push({ step_key: 'a_playoff', status: 'active' })
    } else if (phase === 'playoffs_in_progress') {
      rows.push({ step_key: 'a_playoff', status: 'active' })
      rows.push({ step_key: 'b_playoff', status: 'active' })
    } else if (phase === 'playoffs_complete') {
      rows.push({ step_key: 'a_playoff', status: 'done' })
      rows.push({ step_key: 'b_playoff', status: 'done' })
      rows.push({ step_key: 'register_playoff_match_results', status: 'done' })
    }
  }

  const { error } = await supabase
    .from('class_workflow_steps')
    .upsert(
      rows.map(row => ({
        class_id: classId,
        step_key: row.step_key,
        status: row.status,
        updated_at: now,
      })),
      { onConflict: 'class_id,step_key' },
    )

  if (error) {
    throw new Error(`Failed to seed class playoff workflow: ${error.message}`)
  }
}

export async function seedAdminPlayoffCompetition(
  supabase: SupabaseClient,
  slug: string,
  classSeeds: AdminPlayoffClassSeed[],
  options?: { adminPin?: string; playerPin?: string },
): Promise<SeededAdminPlayoffCompetition> {
  if (classSeeds.length === 0) {
    throw new Error('seedAdminPlayoffCompetition requires at least one class')
  }

  const adminPin = options?.adminPin ?? '2222'
  const playerPin = options?.playerPin ?? '1111'

  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash(playerPin, 4),
    bcrypt.hash(adminPin, 4),
  ])

  const { data: competition, error: competitionError } = await supabase
    .from('competitions')
    .insert({
      name: 'Playoff Progress Testtävling',
      slug,
      player_pin_hash: playerPinHash,
      admin_pin_hash: adminPinHash,
    })
    .select('id')
    .single()

  if (competitionError || !competition) {
    throw new Error(`Failed to seed playoff-progress competition: ${competitionError?.message ?? 'Unknown error'}`)
  }

  const competitionId = competition.id

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      competition_id: competitionId,
      name: 'Pass 1',
      date: '2025-09-13',
      session_order: 1,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    throw new Error(`Failed to seed playoff-progress session: ${sessionError?.message ?? 'Unknown error'}`)
  }

  const seenNames = new Set<string>()
  for (const classSeed of classSeeds) {
    if (seenNames.has(classSeed.name)) {
      throw new Error(`Duplicate class name in seed: ${classSeed.name}`)
    }
    seenNames.add(classSeed.name)
  }

  const pastDeadline = '2020-01-01T00:00:00Z'
  const futureDeadline = '2099-01-01T00:00:00Z'
  const { data: insertedClasses, error: classError } = await supabase
    .from('classes')
    .insert(
      classSeeds.map(classSeed => ({
        session_id: session.id,
        name: classSeed.name,
        start_time: classSeed.startTime,
        attendance_deadline:
          (classSeed.phase ?? 'a_playoff_in_progress') === 'awaiting_attendance'
            ? futureDeadline
            : pastDeadline,
      })),
    )
    .select('id, name, start_time')

  if (classError || !insertedClasses) {
    throw new Error(`Failed to seed playoff-progress classes: ${classError?.message ?? 'Unknown error'}`)
  }

  const classesByName = new Map<string, { id: string; name: string; start_time: string }>()
  for (const row of insertedClasses) {
    classesByName.set(row.name, row)
  }

  const now = new Date().toISOString()
  let playerIndex = 0

  for (const classSeed of classSeeds) {
    const classRow = classesByName.get(classSeed.name)!
    const registeredPlayers = classSeed.registeredPlayers ?? 8
    const phase = classSeed.phase ?? 'a_playoff_in_progress'

    const playerRows = Array.from({ length: registeredPlayers }, () => {
      playerIndex += 1
      return {
        competition_id: competitionId,
        name: `Slutspelsspelare ${playerIndex}`,
        club: 'Slutspelsklubben',
      }
    })

    const { data: insertedPlayers, error: playerError } = await supabase
      .from('players')
      .insert(playerRows)
      .select('id')

    if (playerError || !insertedPlayers) {
      throw new Error(`Failed to seed playoff-progress players: ${playerError?.message ?? 'Unknown error'}`)
    }

    const { data: regs, error: regError } = await supabase
      .from('registrations')
      .insert(
        insertedPlayers.map(player => ({
          player_id: player.id,
          class_id: classRow.id,
          status: 'registered' as const,
        })),
      )
      .select('id')

    if (regError || !regs) {
      throw new Error(`Failed to seed playoff-progress registrations: ${regError?.message ?? 'Unknown error'}`)
    }

    if (phase !== 'awaiting_attendance') {
      const { error: attendanceError } = await supabase.from('attendance').insert(
        regs.map(reg => ({
          registration_id: reg.id,
          status: 'confirmed' as const,
          reported_at: now,
          reported_by: 'admin' as const,
          idempotency_key: `playoff-progress-seed-${reg.id}`,
        })),
      )

      if (attendanceError) {
        throw new Error(`Failed to seed playoff-progress attendance: ${attendanceError.message}`)
      }

      await seedClassPlayoffWorkflow(supabase, classRow.id, phase, now)
    }
  }

  return {
    competitionId,
    classes: classSeeds.map((classSeed, index) => {
      const row = classesByName.get(classSeed.name)!
      return {
        id: row.id,
        name: row.name,
        startTime: row.start_time,
        externalClassKey: classSeed.externalClassKey ?? `playoff-seed-${index + 1}`,
      }
    }),
  }
}

export type PlayoffSnapshotMatchSeed = {
  playerA: string
  playerB: string
  winner?: string | null
  result?: string | null
}

export type PlayoffSnapshotRoundSeed = {
  name: string
  matches: PlayoffSnapshotMatchSeed[]
}

export type SeedPlayoffSnapshotInput = {
  competitionId: string
  parentClassName: string
  parentExternalClassKey: string
  parentClassDate?: string
  parentClassTime?: string
  bracket: 'A' | 'B'
  classExternalKey?: string
  className?: string
  rounds: PlayoffSnapshotRoundSeed[]
  sourceProcessedAt?: string
  receivedAt?: string
}

export async function seedOnDataPlayoffSnapshot(
  supabase: SupabaseClient,
  input: SeedPlayoffSnapshotInput,
): Promise<{ snapshotId: string }> {
  const snapshotId = randomUUID()
  const now = new Date().toISOString()
  const receivedAt = input.receivedAt ?? now
  const sourceProcessedAt = input.sourceProcessedAt ?? receivedAt
  const bracketSuffix = input.bracket === 'B' ? '~B' : ''
  const classExternalKey = input.classExternalKey ?? `${input.parentExternalClassKey}${bracketSuffix}`
  const className = input.className ?? `${input.parentClassName}${bracketSuffix}`
  const matchRows: Array<{
    id: string
    snapshot_id: string
    snapshot_round_id: string
    match_order: number
    match_key: string
    player_a_name: string
    player_b_name: string
    winner_name: string | null
    result: string | null
    is_completed: boolean
  }> = []
  const roundRows: Array<{
    id: string
    snapshot_id: string
    round_order: number
    round_name: string
  }> = []

  let totalMatches = 0
  let completedMatches = 0

  input.rounds.forEach((round, roundIndex) => {
    const roundId = randomUUID()
    roundRows.push({
      id: roundId,
      snapshot_id: snapshotId,
      round_order: roundIndex,
      round_name: round.name,
    })

    round.matches.forEach((match, matchIndex) => {
      const winner = match.winner ?? null
      const result = match.result ?? null
      const isCompleted = winner != null || result != null
      totalMatches += 1
      if (isCompleted) completedMatches += 1

      matchRows.push({
        id: randomUUID(),
        snapshot_id: snapshotId,
        snapshot_round_id: roundId,
        match_order: matchIndex,
        match_key: `${input.bracket}-r${roundIndex}-m${matchIndex}`,
        player_a_name: match.playerA,
        player_b_name: match.playerB,
        winner_name: winner,
        result,
        is_completed: isCompleted,
      })
    })
  })

  const { error: snapshotError } = await supabase
    .from('ondata_playoff_snapshots')
    .insert({
      id: snapshotId,
      competition_id: input.competitionId,
      schema_version: 2,
      payload_hash: `seed-${snapshotId}`,
      received_at: receivedAt,
      processed_at: receivedAt,
      processing_status: 'processed',
      error_message: null,
      source_type: 'ondata-stage5-playoff',
      source_competition_url: 'https://example.test/seed',
      source_class_id: classExternalKey,
      source_stage5_path: `tests/playoff-seed-${snapshotId}.pdf`,
      source_stage6_path: null,
      source_processed_at: sourceProcessedAt,
      source_file_hash: `hash-${snapshotId}`,
      class_source_class_id: classExternalKey,
      external_class_key: classExternalKey,
      class_name: className,
      playoff_bracket: input.bracket,
      parent_source_class_id: input.parentExternalClassKey,
      parent_external_class_key: input.parentExternalClassKey,
      parent_class_name: input.parentClassName,
      parent_class_date: input.parentClassDate ?? '2025-09-13',
      parent_class_time: input.parentClassTime ?? '09:00',
      summary_rounds: input.rounds.length,
      summary_matches: totalMatches,
      summary_completed_matches: completedMatches,
      raw_payload: { schemaVersion: 2, rounds: input.rounds },
    })

  if (snapshotError) {
    throw new Error(`Failed to seed playoff snapshot: ${snapshotError.message}`)
  }

  if (roundRows.length > 0) {
    const { error: roundError } = await supabase
      .from('ondata_playoff_snapshot_rounds')
      .insert(roundRows)

    if (roundError) {
      throw new Error(`Failed to seed playoff snapshot rounds: ${roundError.message}`)
    }
  }

  if (matchRows.length > 0) {
    const { error: matchError } = await supabase
      .from('ondata_playoff_snapshot_matches')
      .insert(matchRows)

    if (matchError) {
      throw new Error(`Failed to seed playoff snapshot matches: ${matchError.message}`)
    }
  }

  const { error: statusError } = await supabase
    .from('ondata_playoff_status')
    .upsert({
      competition_id: input.competitionId,
      parent_external_class_key: input.parentExternalClassKey,
      playoff_bracket: input.bracket,
      current_snapshot_id: snapshotId,
      last_received_at: receivedAt,
      last_processed_at: receivedAt,
      last_payload_hash: `seed-${snapshotId}`,
      last_source_processed_at: sourceProcessedAt,
      last_error: null,
      last_summary_rounds: input.rounds.length,
      last_summary_matches: totalMatches,
      last_summary_completed_matches: completedMatches,
      updated_at: receivedAt,
    }, { onConflict: 'competition_id,parent_external_class_key,playoff_bracket' })

  if (statusError) {
    throw new Error(`Failed to seed playoff status: ${statusError.message}`)
  }

  return { snapshotId }
}

export type SeededCompetitionWithPlayoff = {
  competitionId: string
  classId: string
  className: string
  parentExternalClassKey: string
  snapshotIdA: string | null
  snapshotIdB: string | null
}

export async function seedCompetitionWithPlayoff(
  supabase: SupabaseClient,
  slug: string,
  options: {
    bracketA?: PlayoffSnapshotRoundSeed[]
    bracketB?: PlayoffSnapshotRoundSeed[]
    className?: string
    parentExternalClassKey?: string
  },
): Promise<SeededCompetitionWithPlayoff> {
  if (!slug.startsWith('test-player-pl-')) {
    throw new Error('seedCompetitionWithPlayoff requires a slug starting with "test-player-pl-"')
  }

  const className = options.className ?? 'Liveklass A'
  const parentExternalClassKey = options.parentExternalClassKey ?? 'playoff-public-liveklass-a'

  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash('1111', 4),
    bcrypt.hash('2222', 4),
  ])
  const secret = process.env.COOKIE_SECRET!

  const { data: competition, error: competitionError } = await supabase
    .from('competitions')
    .insert({
      name: 'Slutspel Testtävling',
      slug,
      player_pin_hash: playerPinHash,
      admin_pin_hash: adminPinHash,
      player_pin_ciphertext: encryptStoredPin('1111', secret),
      admin_pin_ciphertext: encryptStoredPin('2222', secret),
    })
    .select('id')
    .single()

  if (competitionError || !competition) {
    throw new Error(`Failed to seed playoff competition: ${competitionError?.message ?? 'Unknown error'}`)
  }

  const competitionId = competition.id

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      competition_id: competitionId,
      name: 'Pass 1',
      date: '2025-09-13',
      session_order: 1,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    throw new Error(`Failed to seed playoff session: ${sessionError?.message ?? 'Unknown error'}`)
  }

  const { data: classRow, error: classError } = await supabase
    .from('classes')
    .insert({
      session_id: session.id,
      name: className,
      start_time: '2025-09-13T09:00:00+02:00',
      attendance_deadline: '2099-09-13T08:15:00+02:00',
      max_players: 16,
    })
    .select('id, name')
    .single()

  if (classError || !classRow) {
    throw new Error(`Failed to seed playoff class: ${classError?.message ?? 'Unknown error'}`)
  }

  let snapshotIdA: string | null = null
  let snapshotIdB: string | null = null

  if (options.bracketA) {
    const seeded = await seedOnDataPlayoffSnapshot(supabase, {
      competitionId,
      parentClassName: className,
      parentExternalClassKey,
      bracket: 'A',
      rounds: options.bracketA,
    })
    snapshotIdA = seeded.snapshotId
  }

  if (options.bracketB) {
    const seeded = await seedOnDataPlayoffSnapshot(supabase, {
      competitionId,
      parentClassName: className,
      parentExternalClassKey,
      bracket: 'B',
      rounds: options.bracketB,
    })
    snapshotIdB = seeded.snapshotId
  }

  return {
    competitionId,
    classId: classRow.id,
    className: classRow.name,
    parentExternalClassKey,
    snapshotIdA,
    snapshotIdB,
  }
}

export type AttendanceBannerScenario =
  | 'open'
  | 'opens_soon'
  | 'closed_pending'
  | 'idle'

export interface SeededAttendanceBannerScenario {
  competitionId: string
  classId: string
}

const SWEDISH_TIME_ZONE = 'Europe/Stockholm'

const swedishHourFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SWEDISH_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function getSwedishParts(date: Date) {
  const parts = swedishHourFormatter.formatToParts(date)
  return {
    year: Number(parts.find(part => part.type === 'year')!.value),
    month: Number(parts.find(part => part.type === 'month')!.value),
    day: Number(parts.find(part => part.type === 'day')!.value),
    hour: Number(parts.find(part => part.type === 'hour')!.value),
    minute: Number(parts.find(part => part.type === 'minute')!.value),
  }
}

/**
 * Returns true when "now" lies within the 60-min window before the next
 * 20:00 Swedish boundary, which is the only window in which the
 * `opens_soon` banner can be reliably seeded — `getClassAttendanceOpensAt`
 * always lands at 20:00 Swedish time on the day before a class starts.
 */
export function canSeedOpensSoonScenario(now: Date = new Date()): boolean {
  const swedish = getSwedishParts(now)
  return swedish.hour === 19
}

/**
 * Seeds a competition that exercises one of the four attendance-banner
 * scenarios. Tests assume the rollup helper is called with the real
 * server-side `now`, so the seed math is computed against the live clock.
 *
 * `opens_soon` can only be seeded between 19:00 and 20:00 Swedish time —
 * gate tests with `canSeedOpensSoonScenario()` and `test.skip()`.
 */
export async function seedAttendanceBannerScenario(
  supabase: SupabaseClient,
  slug: string,
  scenario: AttendanceBannerScenario,
): Promise<SeededAttendanceBannerScenario> {
  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash('0000', 4),
    bcrypt.hash('0000', 4),
  ])

  const { data: comp, error: compError } = await supabase
    .from('competitions')
    .insert({
      name: `Banner ${scenario}`,
      slug,
      player_pin_hash: playerPinHash,
      admin_pin_hash: adminPinHash,
    })
    .select('id')
    .single()

  if (compError || !comp) {
    throw new Error(`Failed to seed banner competition: ${compError?.message ?? 'Unknown error'}`)
  }

  const competitionId = comp.id
  const sessionDate =
    scenario === 'opens_soon'
      ? swedishDateOnNextOpensAt()
      : scenario === 'idle'
        ? '2099-09-15'
        : scenario === 'open' || scenario === 'closed_pending'
          ? '2020-09-13'
          : '2099-09-15'

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      competition_id: competitionId,
      name: 'Pass 1',
      date: sessionDate,
      session_order: 1,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    throw new Error(`Failed to seed banner session: ${sessionError?.message ?? 'Unknown error'}`)
  }

  const startTime = `${sessionDate}T09:00:00+02:00`
  let attendanceDeadline: string

  if (scenario === 'open') {
    attendanceDeadline = '2099-09-13T08:15:00+02:00'
  } else if (scenario === 'closed_pending') {
    attendanceDeadline = '2020-09-13T08:15:00+02:00'
  } else if (scenario === 'opens_soon') {
    attendanceDeadline = `${sessionDate}T08:15:00+02:00`
  } else {
    attendanceDeadline = `${sessionDate}T08:15:00+02:00`
  }

  const { data: classRow, error: classError } = await supabase
    .from('classes')
    .insert({
      session_id: session.id,
      name: 'Banner-klass',
      start_time: startTime,
      attendance_deadline: attendanceDeadline,
      max_players: 8,
    })
    .select('id')
    .single()

  if (classError || !classRow) {
    throw new Error(`Failed to seed banner class: ${classError?.message ?? 'Unknown error'}`)
  }

  if (scenario === 'open' || scenario === 'closed_pending' || scenario === 'idle') {
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        competition_id: competitionId,
        name: 'Banner Player',
        club: 'Banner BTK',
      })
      .select('id')
      .single()

    if (playerError || !player) {
      throw new Error(`Failed to seed banner player: ${playerError?.message ?? 'Unknown error'}`)
    }

    const { data: registration, error: registrationError } = await supabase
      .from('registrations')
      .insert({
        player_id: player.id,
        class_id: classRow.id,
      })
      .select('id')
      .single()

    if (registrationError || !registration) {
      throw new Error(
        `Failed to seed banner registration: ${registrationError?.message ?? 'Unknown error'}`,
      )
    }

    if (scenario === 'idle') {
      const { error: attendanceError } = await supabase.from('attendance').insert({
        registration_id: registration.id,
        status: 'confirmed',
        reported_at: new Date().toISOString(),
        reported_by: 'player',
        idempotency_key: `seed-${registration.id}-confirmed`,
      })

      if (attendanceError) {
        throw new Error(`Failed to seed banner attendance: ${attendanceError.message}`)
      }
    }
  }

  return { competitionId, classId: classRow.id }
}

function swedishDateOnNextOpensAt(now: Date = new Date()): string {
  const parts = getSwedishParts(now)
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1))
  const year = next.getUTCFullYear()
  const month = String(next.getUTCMonth() + 1).padStart(2, '0')
  const day = String(next.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
