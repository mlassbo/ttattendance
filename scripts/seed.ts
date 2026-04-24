// Seed script — populates local dev data for manual testing.
// Run with: npm run db:seed
// Example: npm run db:seed -- --slug manual-2026 --name "Manuell testtävling"
//
// Creates and seeds a non-test competition (default: "dev-2025").
// Safe to re-run: clears and rebuilds data for the chosen slug each time.
// Does NOT touch test-* competitions (those are owned by Playwright tests).

import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import bcrypt from 'bcryptjs'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DEFAULT_SLUG = 'dev-2025'
const DEFAULT_NAME = 'Utvecklingstävling 2025'
const DEFAULT_PLAYER_PIN = '1234'
const DEFAULT_ADMIN_PIN = '5678'
const DEFAULT_SCHEDULE_DATE = '2025-09-13'

const SEED_MATCH_RESULTS = [
  '6, 3, 8',
  '-4, 6, 4, 11',
  '7, 8, 9',
  '-9, 8, -7, 6, -10',
  '11, -12, 10, -9, 11',
  '0, 4, 2',
] as const

interface SeedOptions {
  slug: string
  name: string
  playerPin: string
  adminPin: string
  scheduleDate: string
}

type SeedPlayer = {
  name: string
  club: string | null
}

type OnDataClassFixture = {
  competitionId: string
  className: string
  date: string
  time: string
  players: SeedPlayer[]
  playedMatches: number
  publishResults: boolean
  snapshotId: string
  classOrder: number
}

function parseOptions(argv: string[]): SeedOptions {
  const options: SeedOptions = {
    slug: DEFAULT_SLUG,
    name: DEFAULT_NAME,
    playerPin: DEFAULT_PLAYER_PIN,
    adminPin: DEFAULT_ADMIN_PIN,
    scheduleDate: DEFAULT_SCHEDULE_DATE,
  }

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    const value = argv[index + 1]

    switch (argument) {
      case '--slug':
        if (!value) throw new Error('Missing value for --slug')
        options.slug = value
        index += 1
        break
      case '--name':
        if (!value) throw new Error('Missing value for --name')
        options.name = value
        index += 1
        break
      case '--player-pin':
        if (!value) throw new Error('Missing value for --player-pin')
        options.playerPin = value
        index += 1
        break
      case '--admin-pin':
        if (!value) throw new Error('Missing value for --admin-pin')
        options.adminPin = value
        index += 1
        break
      case '--schedule-date':
        if (!value) throw new Error('Missing value for --schedule-date')
        options.scheduleDate = value
        index += 1
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

function buildExternalClassKey(className: string, date: string, time: string): string {
  return `seed::${className}::${date}::${time}`
}

function getSeedMatchResult(index: number): string {
  return SEED_MATCH_RESULTS[index % SEED_MATCH_RESULTS.length]
}

function buildRoundRobinPairs(players: SeedPlayer[]) {
  const pairs: Array<{ playerA: SeedPlayer; playerB: SeedPlayer }> = []

  for (let playerAIndex = 0; playerAIndex < players.length; playerAIndex += 1) {
    for (let playerBIndex = playerAIndex + 1; playerBIndex < players.length; playerBIndex += 1) {
      pairs.push({
        playerA: players[playerAIndex],
        playerB: players[playerBIndex],
      })
    }
  }

  return pairs
}

async function clearCompetitionData(competitionId: string) {
  const { error: integrationStatusError } = await supabase
    .from('ondata_integration_status')
    .delete()
    .eq('competition_id', competitionId)

  if (integrationStatusError) {
    throw new Error(`Failed to clear OnData integration status: ${integrationStatusError.message}`)
  }

  const { error: integrationSnapshotsError } = await supabase
    .from('ondata_integration_snapshots')
    .delete()
    .eq('competition_id', competitionId)

  if (integrationSnapshotsError) {
    throw new Error(`Failed to clear OnData integration snapshots: ${integrationSnapshotsError.message}`)
  }

  const { error: poolResultStatusError } = await supabase
    .from('ondata_pool_result_status')
    .delete()
    .eq('competition_id', competitionId)

  if (poolResultStatusError) {
    throw new Error(`Failed to clear OnData pool-result status: ${poolResultStatusError.message}`)
  }

  const { error: poolResultSnapshotsError } = await supabase
    .from('ondata_pool_result_snapshots')
    .delete()
    .eq('competition_id', competitionId)

  if (poolResultSnapshotsError) {
    throw new Error(`Failed to clear OnData pool-result snapshots: ${poolResultSnapshotsError.message}`)
  }

  const { error: sessionsError } = await supabase
    .from('sessions')
    .delete()
    .eq('competition_id', competitionId)

  if (sessionsError) {
    throw new Error(`Failed to clear sessions: ${sessionsError.message}`)
  }

  const { error: playersError } = await supabase
    .from('players')
    .delete()
    .eq('competition_id', competitionId)

  if (playersError) {
    throw new Error(`Failed to clear players: ${playersError.message}`)
  }
}

async function seedOnDataFixture(input: OnDataClassFixture) {
  const externalClassKey = buildExternalClassKey(input.className, input.date, input.time)
  const timestamp = `${input.date}T08:00:00.000Z`
  const snapshotClassId = randomUUID()
  const snapshotPoolId = randomUUID()
  const poolPairs = buildRoundRobinPairs(input.players)
  const playedPairs = poolPairs.slice(0, input.playedMatches)

  const { error: snapshotClassError } = await supabase
    .from('ondata_integration_snapshot_classes')
    .insert({
      id: snapshotClassId,
      snapshot_id: input.snapshotId,
      class_order: input.classOrder,
      external_class_key: externalClassKey,
      class_name: input.className,
      class_date: input.date,
      class_time: input.time,
    })

  if (snapshotClassError) {
    throw new Error(`Failed to seed OnData snapshot class ${input.className}: ${snapshotClassError.message}`)
  }

  const { error: poolError } = await supabase
    .from('ondata_integration_snapshot_pools')
    .insert({
      id: snapshotPoolId,
      snapshot_class_id: snapshotClassId,
      pool_order: 0,
      pool_number: 1,
      completed_match_count: input.playedMatches,
    })

  if (poolError) {
    throw new Error(`Failed to seed OnData pool ${input.className}: ${poolError.message}`)
  }

  const { error: playersError } = await supabase
    .from('ondata_integration_snapshot_players')
    .insert(
      input.players.map((player, playerIndex) => ({
        snapshot_pool_id: snapshotPoolId,
        player_order: playerIndex,
        name: player.name,
        club: player.club,
      })),
    )

  if (playersError) {
    throw new Error(`Failed to seed OnData pool players ${input.className}: ${playersError.message}`)
  }

  if (playedPairs.length > 0) {
    const { error: matchesError } = await supabase
      .from('ondata_integration_snapshot_matches')
      .insert(
        playedPairs.map((pair, matchIndex) => ({
          snapshot_pool_id: snapshotPoolId,
          match_order: matchIndex,
          match_number: matchIndex + 1,
          player_a_name: pair.playerA.name,
          player_a_club: pair.playerA.club,
          player_b_name: pair.playerB.name,
          player_b_club: pair.playerB.club,
          result: getSeedMatchResult(matchIndex),
        })),
      )

    if (matchesError) {
      throw new Error(`Failed to seed OnData pool matches ${input.className}: ${matchesError.message}`)
    }
  }

  if (!input.publishResults) {
    return
  }

  const poolResultSnapshotId = randomUUID()
  const poolResultPoolId = randomUUID()

  const { error: poolResultSnapshotError } = await supabase
    .from('ondata_pool_result_snapshots')
    .insert({
      id: poolResultSnapshotId,
      competition_id: input.competitionId,
      external_class_key: externalClassKey,
      source_class_id: externalClassKey,
      class_name: input.className,
      class_date: input.date,
      class_time: input.time,
      source_file_name: `seed-pool-results-${input.className}.json`,
      source_file_path: `scripts/seed-pool-results-${input.className}.json`,
      source_file_modified_at: timestamp,
      source_processed_at: timestamp,
      source_file_hash: `hash-${poolResultSnapshotId}`,
      payload_hash: `seed-${poolResultSnapshotId}`,
      processing_status: 'processed',
      last_error: null,
      raw_payload: {
        schemaVersion: 1,
        competitionSlug: 'manual-seed',
        source: {
          sourceType: 'ondata-stage4',
          fileName: `seed-pool-results-${input.className}.json`,
          filePath: `scripts/seed-pool-results-${input.className}.json`,
          fileModifiedAt: timestamp,
          processedAt: timestamp,
          fileHash: `hash-${poolResultSnapshotId}`,
        },
        class: {
          externalClassKey,
          sourceClassId: externalClassKey,
          className: input.className,
          classDate: input.date,
          classTime: input.time,
          pools: [],
        },
      },
      received_at: timestamp,
      processed_at: timestamp,
    })

  if (poolResultSnapshotError) {
    throw new Error(`Failed to seed pool-result snapshot ${input.className}: ${poolResultSnapshotError.message}`)
  }

  const { error: poolResultPoolError } = await supabase
    .from('ondata_pool_result_snapshot_pools')
    .insert({
      id: poolResultPoolId,
      snapshot_id: poolResultSnapshotId,
      pool_number: 1,
    })

  if (poolResultPoolError) {
    throw new Error(`Failed to seed pool-result pool ${input.className}: ${poolResultPoolError.message}`)
  }

  const standings = [...input.players].map((player, index) => ({
    placement: index + 1,
    playerName: player.name,
    clubName: player.club,
  }))

  const { error: standingsError } = await supabase
    .from('ondata_pool_result_snapshot_standings')
    .insert(
      standings.map((standing, index) => ({
        pool_id: poolResultPoolId,
        placement: standing.placement,
        player_name: standing.playerName,
        club_name: standing.clubName,
        matches_won: Math.max(0, input.players.length - index - 1),
        matches_lost: index,
        sets_won: Math.max(0, (input.players.length - index) * 3),
        sets_lost: index,
        points_for: 33 - index * 3,
        points_against: 18 + index * 3,
      })),
    )

  if (standingsError) {
    throw new Error(`Failed to seed pool-result standings ${input.className}: ${standingsError.message}`)
  }

  const { error: poolResultStatusError } = await supabase
    .from('ondata_pool_result_status')
    .upsert({
      competition_id: input.competitionId,
      external_class_key: externalClassKey,
      current_snapshot_id: poolResultSnapshotId,
      last_payload_hash: `seed-${poolResultSnapshotId}`,
      last_processed_at: timestamp,
      last_error: null,
      updated_at: timestamp,
    }, { onConflict: 'competition_id,external_class_key' })

  if (poolResultStatusError) {
    throw new Error(`Failed to seed pool-result status ${input.className}: ${poolResultStatusError.message}`)
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const { slug, name, playerPin, adminPin, scheduleDate } = options

  console.log(`Seeding competition "${slug}" (player PIN: ${playerPin}, admin PIN: ${adminPin})`)

  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash(playerPin, 10),
    bcrypt.hash(adminPin, 10),
  ])

  const { data: existing, error: existingError } = await supabase
    .from('competitions')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existingError && existingError.code !== 'PGRST116') {
    throw new Error(`Failed to look up competition: ${existingError.message}`)
  }

  let competitionId: string

  if (existing) {
    competitionId = existing.id
    const { error: updateError } = await supabase
      .from('competitions')
      .update({
        name,
        player_pin_hash: playerPinHash,
        admin_pin_hash: adminPinHash,
        deleted_at: null,
      })
      .eq('id', competitionId)

    if (updateError) {
      throw new Error(`Failed to update competition: ${updateError.message}`)
    }

    console.log('  Found existing competition, updated PIN hashes.')
  } else {
    const { data: created, error: createError } = await supabase
      .from('competitions')
      .insert({
        name,
        slug,
        player_pin_hash: playerPinHash,
        admin_pin_hash: adminPinHash,
      })
      .select('id')
      .single()

    if (createError || !created) {
      throw new Error(`Failed to create competition: ${createError?.message ?? 'Unknown error'}`)
    }

    competitionId = created.id
    console.log('  Created new competition.')
  }

  await clearCompetitionData(competitionId)

  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .insert([
      { competition_id: competitionId, name: 'Lördag förmiddag', date: scheduleDate, session_order: 1 },
      { competition_id: competitionId, name: 'Lördag eftermiddag', date: scheduleDate, session_order: 2 },
    ])
    .select('id, name')

  if (sessionsError || !sessions) {
    throw new Error(`Failed to insert sessions: ${sessionsError?.message ?? 'Unknown error'}`)
  }

  const [morning, afternoon] = sessions
  console.log(`  Sessions: ${sessions.map(session => session.name).join(', ')}`)

  const deadlineDate = '2099-09-13'
  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .insert([
      {
        session_id: morning.id,
        name: 'Herrar A-klass',
        start_time: `${scheduleDate}T09:00:00+02:00`,
        attendance_deadline: `${deadlineDate}T08:15:00+02:00`,
      },
      {
        session_id: morning.id,
        name: 'Damer A-klass',
        start_time: `${scheduleDate}T09:30:00+02:00`,
        attendance_deadline: `${deadlineDate}T08:45:00+02:00`,
      },
      {
        session_id: afternoon.id,
        name: 'Herrar B-klass',
        start_time: `${scheduleDate}T13:00:00+02:00`,
        attendance_deadline: `${deadlineDate}T12:15:00+02:00`,
      },
      {
        session_id: afternoon.id,
        name: 'Damer B-klass',
        start_time: `${scheduleDate}T13:30:00+02:00`,
        attendance_deadline: `${deadlineDate}T12:45:00+02:00`,
      },
    ])
    .select('id, name')

  if (classesError || !classes) {
    throw new Error(`Failed to insert classes: ${classesError?.message ?? 'Unknown error'}`)
  }

  const classByName = new Map(classes.map(classRow => [classRow.name, classRow]))
  const herrarA = classByName.get('Herrar A-klass')!
  const damerA = classByName.get('Damer A-klass')!
  const herrarB = classByName.get('Herrar B-klass')!
  const damerB = classByName.get('Damer B-klass')!

  console.log(`  Classes: ${classes.map(classRow => classRow.name).join(', ')}`)

  const { data: players, error: playersError } = await supabase
    .from('players')
    .insert([
      { competition_id: competitionId, name: 'Anna Lindqvist', club: 'Stockholms BTK' },
      { competition_id: competitionId, name: 'Anders Johansson', club: 'Goteborgs BTK' },
      { competition_id: competitionId, name: 'Beatrice Karlsson', club: 'Malmo BTK' },
      { competition_id: competitionId, name: 'Erik Bergstrom', club: 'Stockholms BTK' },
      { competition_id: competitionId, name: 'Eva Svensson', club: 'Uppsala BTK' },
      { competition_id: competitionId, name: 'Lars Nilsson', club: 'Goteborgs BTK' },
      { competition_id: competitionId, name: 'Maria Hansson', club: 'Malmo BTK' },
      { competition_id: competitionId, name: 'Peter Eriksson', club: 'Stockholms BTK' },
    ])
    .select('id, name, club')

  if (playersError || !players) {
    throw new Error(`Failed to insert players: ${playersError?.message ?? 'Unknown error'}`)
  }

  console.log(`  Players: ${players.map(player => player.name).join(', ')}`)

  const playerByName = new Map(players.map(player => [player.name, player]))
  const anna = playerByName.get('Anna Lindqvist')!
  const anders = playerByName.get('Anders Johansson')!
  const beatrice = playerByName.get('Beatrice Karlsson')!
  const erik = playerByName.get('Erik Bergstrom')!
  const eva = playerByName.get('Eva Svensson')!
  const lars = playerByName.get('Lars Nilsson')!
  const maria = playerByName.get('Maria Hansson')!
  const peter = playerByName.get('Peter Eriksson')!

  const { error: registrationsError } = await supabase
    .from('registrations')
    .insert([
      { player_id: anders.id, class_id: herrarA.id },
      { player_id: erik.id, class_id: herrarA.id },
      { player_id: lars.id, class_id: herrarA.id },
      { player_id: peter.id, class_id: herrarA.id },
      { player_id: anna.id, class_id: damerA.id },
      { player_id: beatrice.id, class_id: damerA.id },
      { player_id: eva.id, class_id: damerA.id },
      { player_id: maria.id, class_id: damerA.id },
      { player_id: anders.id, class_id: herrarB.id },
      { player_id: erik.id, class_id: herrarB.id },
      { player_id: lars.id, class_id: herrarB.id },
      { player_id: peter.id, class_id: herrarB.id },
      { player_id: anna.id, class_id: damerB.id },
      { player_id: beatrice.id, class_id: damerB.id },
      { player_id: eva.id, class_id: damerB.id },
      { player_id: maria.id, class_id: damerB.id },
    ])

  if (registrationsError) {
    throw new Error(`Failed to insert registrations: ${registrationsError.message}`)
  }

  console.log('  Registrations: 16 inserted')

  const integrationSnapshotId = randomUUID()
  const onDataFixtures: OnDataClassFixture[] = [
    {
      competitionId,
      className: herrarA.name,
      date: scheduleDate,
      time: '09:00',
      players: [
        { name: anders.name, club: anders.club },
        { name: erik.name, club: erik.club },
        { name: lars.name, club: lars.club },
        { name: peter.name, club: peter.club },
      ],
      playedMatches: 2,
      publishResults: false,
      snapshotId: integrationSnapshotId,
      classOrder: 0,
    },
    {
      competitionId,
      className: damerA.name,
      date: scheduleDate,
      time: '09:30',
      players: [
        { name: anna.name, club: anna.club },
        { name: beatrice.name, club: beatrice.club },
        { name: eva.name, club: eva.club },
        { name: maria.name, club: maria.club },
      ],
      playedMatches: 6,
      publishResults: false,
      snapshotId: integrationSnapshotId,
      classOrder: 1,
    },
    {
      competitionId,
      className: herrarB.name,
      date: scheduleDate,
      time: '13:00',
      players: [
        { name: peter.name, club: peter.club },
        { name: anders.name, club: anders.club },
        { name: erik.name, club: erik.club },
        { name: lars.name, club: lars.club },
      ],
      playedMatches: 6,
      publishResults: true,
      snapshotId: integrationSnapshotId,
      classOrder: 2,
    },
  ]

  const integrationTimestamp = `${scheduleDate}T08:00:00.000Z`
  const totalCompletedMatches = onDataFixtures.reduce((sum, fixture) => sum + fixture.playedMatches, 0)

  const { error: integrationSnapshotError } = await supabase
    .from('ondata_integration_snapshots')
    .insert({
      id: integrationSnapshotId,
      competition_id: competitionId,
      schema_version: 1,
      payload_hash: `seed-${integrationSnapshotId}`,
      received_at: integrationTimestamp,
      processed_at: integrationTimestamp,
      processing_status: 'processed',
      error_message: null,
      source_file_name: 'seed-live-pools.json',
      source_file_path: 'scripts/seed-live-pools.json',
      source_file_modified_at: integrationTimestamp,
      source_copied_to_temp_at: integrationTimestamp,
      source_processed_at: integrationTimestamp,
      source_file_hash: `hash-${integrationSnapshotId}`,
      summary_classes: onDataFixtures.length,
      summary_pools: onDataFixtures.length,
      summary_completed_matches: totalCompletedMatches,
      raw_payload: {
        schemaVersion: 1,
        source: {
          fileName: 'seed-live-pools.json',
          filePath: 'scripts/seed-live-pools.json',
          fileModifiedAt: integrationTimestamp,
          copiedToTempAt: integrationTimestamp,
          processedAt: integrationTimestamp,
          fileHash: `hash-${integrationSnapshotId}`,
        },
        summary: {
          classes: onDataFixtures.length,
          pools: onDataFixtures.length,
          completedMatches: totalCompletedMatches,
        },
        classes: [],
      },
    })

  if (integrationSnapshotError) {
    throw new Error(`Failed to insert OnData integration snapshot: ${integrationSnapshotError.message}`)
  }

  for (let index = 0; index < onDataFixtures.length; index += 1) {
    const fixture = onDataFixtures[index]
    await seedOnDataFixture({
      ...fixture,
      classOrder: index,
    })
  }

  const { error: integrationStatusError } = await supabase
    .from('ondata_integration_status')
    .upsert({
      competition_id: competitionId,
      current_snapshot_id: integrationSnapshotId,
      last_received_at: integrationTimestamp,
      last_processed_at: integrationTimestamp,
      last_payload_hash: `seed-${integrationSnapshotId}`,
      last_source_file_modified_at: integrationTimestamp,
      last_source_processed_at: integrationTimestamp,
      last_error: null,
      last_summary_classes: onDataFixtures.length,
      last_summary_pools: onDataFixtures.length,
      last_summary_completed_matches: totalCompletedMatches,
      updated_at: integrationTimestamp,
    })

  if (integrationStatusError) {
    throw new Error(`Failed to insert OnData integration status: ${integrationStatusError.message}`)
  }

  console.log('  OnData snapshot: Herrar A (2/6 spelade), Damer A (6/6 spelade, väntar på resultat), Herrar B (resultat publicerat)')
  console.log()
  console.log('Done!')
  console.log(`  URL:        http://localhost:3000/${slug}`)
  console.log(`  Player PIN: ${playerPin}`)
  console.log(`  Admin PIN:  ${adminPin}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
