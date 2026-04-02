// Seed script — populates local dev data for manual testing.
// Run with: npm run db:seed
// Example: npm run db:seed -- --slug manual-2026 --name "Manuell testtävling"
//
// Creates and seeds a non-test competition (default: "dev-2025").
// Safe to re-run: clears and rebuilds data for the chosen slug each time.
// Does NOT touch test-* competitions (those are owned by Playwright tests).

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import bcrypt from 'bcryptjs'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DEFAULT_SLUG = 'dev-2025'
const DEFAULT_NAME = 'Utvecklingstävling 2025'
const DEFAULT_PLAYER_PIN = '1234'
const DEFAULT_ADMIN_PIN = '5678'
const DEFAULT_START_DATE = '2025-09-13'
const DEFAULT_END_DATE = '2025-09-14'

interface SeedOptions {
  slug: string
  name: string
  playerPin: string
  adminPin: string
  startDate: string
  endDate: string
}

function parseOptions(argv: string[]): SeedOptions {
  const options: SeedOptions = {
    slug: DEFAULT_SLUG,
    name: DEFAULT_NAME,
    playerPin: DEFAULT_PLAYER_PIN,
    adminPin: DEFAULT_ADMIN_PIN,
    startDate: DEFAULT_START_DATE,
    endDate: DEFAULT_END_DATE,
  }

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    const value = argv[index + 1]

    switch (argument) {
      case '--slug':
        if (!value) throw new Error('Missing value for --slug')
        options.slug = value
        index++
        break
      case '--name':
        if (!value) throw new Error('Missing value for --name')
        options.name = value
        index++
        break
      case '--player-pin':
        if (!value) throw new Error('Missing value for --player-pin')
        options.playerPin = value
        index++
        break
      case '--admin-pin':
        if (!value) throw new Error('Missing value for --admin-pin')
        options.adminPin = value
        index++
        break
      case '--start-date':
        if (!value) throw new Error('Missing value for --start-date')
        options.startDate = value
        index++
        break
      case '--end-date':
        if (!value) throw new Error('Missing value for --end-date')
        options.endDate = value
        index++
        break
      default:
        throw new Error(`Unknown argument: ${argument}`)
    }
  }

  if (options.slug.startsWith('test-')) {
    throw new Error('Manual seed slugs must not start with "test-" because Playwright cleans those up.')
  }

  return options
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const { slug, name, playerPin, adminPin, startDate, endDate } = options

  console.log(`Seeding competition "${slug}" (player PIN: ${playerPin}, admin PIN: ${adminPin})`)

  // ── Upsert competition ────────────────────────────────────────────────────
  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash(playerPin, 10),
    bcrypt.hash(adminPin, 10),
  ])

  // Check for existing (possibly soft-deleted) competition.
  const { data: existing } = await supabase
    .from('competitions')
    .select('id')
    .eq('slug', slug)
    .single()

  let competitionId: string

  if (existing) {
    competitionId = existing.id
    const { error: updateError } = await supabase
      .from('competitions')
      .update({
        name,
        start_date: startDate,
        end_date: endDate,
        player_pin_hash: playerPinHash,
        admin_pin_hash: adminPinHash,
        deleted_at: null,
      })
      .eq('id', competitionId)
    if (updateError) {
      console.error('Failed to update competition:', updateError)
      process.exit(1)
    }
    console.log(`  Found existing competition, updated PIN hashes.`)
  } else {
    const { data: created, error } = await supabase
      .from('competitions')
      .insert({
        name,
        slug,
        start_date: startDate,
        end_date: endDate,
        player_pin_hash: playerPinHash,
        admin_pin_hash: adminPinHash,
      })
      .select('id')
      .single()

    if (error || !created) {
      console.error('Failed to create competition:', error)
      process.exit(1)
    }

    competitionId = created.id
    console.log(`  Created new competition.`)
  }

  // ── Clear existing data for this competition ───────────────────────────────
  // ON DELETE CASCADE handles classes → registrations → attendance automatically.
  await supabase.from('sessions').delete().eq('competition_id', competitionId)
  await supabase.from('players').delete().eq('competition_id', competitionId)

  // ── Sessions ──────────────────────────────────────────────────────────────
  const { data: sessions, error: sessErr } = await supabase
    .from('sessions')
    .insert([
      { competition_id: competitionId, name: 'Lördag förmiddag', date: '2025-09-13', session_order: 1 },
      { competition_id: competitionId, name: 'Lördag eftermiddag', date: '2025-09-13', session_order: 2 },
    ])
    .select('id, name')

  if (sessErr || !sessions) {
    console.error('Failed to insert sessions:', sessErr)
    process.exit(1)
  }

  const [morning, afternoon] = sessions
  console.log(`  Sessions: ${sessions.map(s => s.name).join(', ')}`)

  // ── Classes ───────────────────────────────────────────────────────────────
  // Deadlines far in the future so local testing is never blocked.
  const d = '2099-09-13'

  const { data: classes, error: classErr } = await supabase
    .from('classes')
    .insert([
      {
        session_id: morning.id,
        name: 'Herrar A-klass',
        start_time: `${d}T09:00:00+02:00`,
        attendance_deadline: `${d}T08:15:00+02:00`,
      },
      {
        session_id: morning.id,
        name: 'Damer A-klass',
        start_time: `${d}T09:30:00+02:00`,
        attendance_deadline: `${d}T08:45:00+02:00`,
      },
      {
        session_id: afternoon.id,
        name: 'Herrar B-klass',
        start_time: `${d}T13:00:00+02:00`,
        attendance_deadline: `${d}T12:15:00+02:00`,
      },
      {
        session_id: afternoon.id,
        name: 'Damer B-klass',
        start_time: `${d}T13:30:00+02:00`,
        attendance_deadline: `${d}T12:45:00+02:00`,
      },
    ])
    .select('id, name')

  if (classErr || !classes) {
    console.error('Failed to insert classes:', classErr)
    process.exit(1)
  }

  const [herrarA, damerA, herrarB, damerB] = classes
  console.log(`  Classes: ${classes.map(c => c.name).join(', ')}`)

  // ── Players ───────────────────────────────────────────────────────────────
  const { data: players, error: playersErr } = await supabase
    .from('players')
    .insert([
      { competition_id: competitionId, name: 'Anna Lindqvist',  club: 'Stockholms BTK' },
      { competition_id: competitionId, name: 'Anders Johansson', club: 'Göteborgs BTK' },
      { competition_id: competitionId, name: 'Beatrice Karlsson', club: 'Malmö BTK' },
      { competition_id: competitionId, name: 'Erik Bergström',   club: 'Stockholms BTK' },
      { competition_id: competitionId, name: 'Eva Svensson',     club: 'Uppsala BTK' },
      { competition_id: competitionId, name: 'Lars Nilsson',     club: 'Göteborgs BTK' },
      { competition_id: competitionId, name: 'Maria Hansson',    club: 'Malmö BTK' },
      { competition_id: competitionId, name: 'Peter Eriksson',   club: 'Stockholms BTK' },
    ])
    .select('id, name')

  if (playersErr || !players) {
    console.error('Failed to insert players:', playersErr)
    process.exit(1)
  }

  console.log(`  Players: ${players.map(p => p.name).join(', ')}`)

  const [anna, anders, beatrice, erik, eva, lars, maria, peter] = players

  // ── Registrations ─────────────────────────────────────────────────────────
  const { error: regErr } = await supabase.from('registrations').insert([
    // Herrar A
    { player_id: anders.id,   class_id: herrarA.id },
    { player_id: erik.id,     class_id: herrarA.id },
    { player_id: lars.id,     class_id: herrarA.id },
    { player_id: peter.id,    class_id: herrarA.id },
    // Damer A
    { player_id: anna.id,     class_id: damerA.id },
    { player_id: beatrice.id, class_id: damerA.id },
    { player_id: eva.id,      class_id: damerA.id },
    { player_id: maria.id,    class_id: damerA.id },
    // Some players registered in two classes
    { player_id: anders.id,   class_id: herrarB.id },
    { player_id: peter.id,    class_id: herrarB.id },
    { player_id: anna.id,     class_id: damerB.id },
    { player_id: eva.id,      class_id: damerB.id },
  ])

  if (regErr) {
    console.error('Failed to insert registrations:', regErr)
    process.exit(1)
  }

  console.log(`  Registrations: 12 inserted`)
  console.log()
  console.log(`Done!`)
  console.log(`  URL:        http://localhost:3000/${slug}`)
  console.log(`  Player PIN: ${playerPin}`)
  console.log(`  Admin PIN:  ${adminPin}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
