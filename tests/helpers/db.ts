// Shared database helpers for Playwright tests.
// All test competitions must use slugs starting with "test-".

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

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
      start_date: '2025-09-13',
      end_date: '2025-09-13',
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
        start_time:          '2099-09-13T09:00:00+02:00',
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
  playerPin: string
): Promise<SeededCompetition> {
  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash(playerPin, 4),
    bcrypt.hash('0000', 4),
  ])

  const { data: comp } = await supabase
    .from('competitions')
    .insert({
      name: 'Test Tävling',
      slug,
      start_date: '2025-09-13',
      end_date: '2025-09-13',
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
        start_time:           '2099-09-13T09:00:00+02:00',
        attendance_deadline:  '2099-09-13T08:15:00+02:00',
      },
      {
        session_id: sessionId,
        name: 'Utgången klass',
        start_time:           '2020-09-13T09:00:00+02:00',
        attendance_deadline:  '2020-09-13T08:15:00+02:00',
      },
    ])
    .select('id, name')

  const futureClass = classes!.find(c => c.name === 'Herrar A-klass')!
  const pastClass   = classes!.find(c => c.name === 'Utgången klass')!

  const { data: players } = await supabase
    .from('players')
    .insert({ competition_id: competitionId, name: 'Anna Testsson', club: 'Test BTK' })
    .select('id')

  const playerId = players![0].id

  const { data: regs } = await supabase
    .from('registrations')
    .insert([
      { player_id: playerId, class_id: futureClass.id },
      { player_id: playerId, class_id: pastClass.id },
    ])
    .select('id, class_id')

  const futureRegId = regs!.find(r => r.class_id === futureClass.id)!.id
  const pastRegId   = regs!.find(r => r.class_id === pastClass.id)!.id

  return { competitionId, player: { id: playerId, name: 'Anna Testsson', futureRegId, pastRegId } }
}
