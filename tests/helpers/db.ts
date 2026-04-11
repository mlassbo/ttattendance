// Shared database helpers for Playwright tests.
// All test competitions must use slugs starting with "test-".

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
      },
      {
        session_id: sessionId,
        name: 'Utgången klass',
        start_time:           `${scheduleDate}T11:00:00+02:00`,
        attendance_deadline:  '2020-09-13T08:15:00+02:00',
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
