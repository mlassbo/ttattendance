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

  const { data: classes } = await supabase
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

  const { data: classes } = await supabase
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

  const { data: classes } = await supabase
    .from('classes')
    .insert([
      {
        session_id: session1.id,
        name: 'Herrar A',
        start_time: '2025-09-13T09:00:00+02:00',
        attendance_deadline: '2025-09-13T08:15:00+02:00',
      },
      {
        session_id: session1.id,
        name: 'Damer A',
        start_time: '2025-09-13T09:30:00+02:00',
        attendance_deadline: '2025-09-13T08:45:00+02:00',
      },
      {
        session_id: session2.id,
        name: 'Herrar B',
        start_time: '2025-09-13T13:00:00+02:00',
        attendance_deadline: '2025-09-13T12:15:00+02:00',
      },
    ])
    .select('id, name, session_id, start_time, attendance_deadline')

  function classesForSession(sessionId: string) {
    return classes!
      .filter(c => c.session_id === sessionId)
      .map(c => ({
        id: c.id,
        name: c.name,
        startTime: c.start_time,
        attendanceDeadline: c.attendance_deadline,
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
  if (!slug.startsWith('test-player-pmr-')) {
    throw new Error('seedCompetitionWithPoolMatches requires a slug starting with "test-player-pmr-"')
  }

  const poolCount = options?.poolCount ?? 1
  const playersPerPool = options?.playersPerPool ?? 4
  const matchesPerPool = options?.matchesPerPool ?? []

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
      external_class_key: 'poolmatch-liveklass-a',
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
    poolIds,
  }
}
