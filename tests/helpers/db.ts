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
 * Deletes all test-* competitions and their dependent data.
 * ON DELETE CASCADE handles sessions, classes, players, registrations, and attendance.
 * Safe to call as global setup or beforeEach.
 */
export async function cleanTestCompetitions(supabase: SupabaseClient): Promise<void> {
  await supabase.from('competitions').delete().like('slug', 'test-%')
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
