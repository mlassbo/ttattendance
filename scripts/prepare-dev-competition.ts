import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  applyCompetitionImport,
  buildCompetitionImportPreview,
  type CompetitionImportClassSessionAssignment,
} from '../src/lib/import/competition-import'
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

const MANUAL_COMPETITION_SLUG = 'manual-2026'
const MANUAL_COMPETITION_NAME = 'Manuell testtävling'
const MANUAL_PLAYER_PIN = '1111'
const MANUAL_ADMIN_PIN = '2222'
const IMPORT_SOURCE_PATH = path.resolve(process.cwd(), 'competition_registrations.txt')

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

async function ensureCompetition(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const [playerPinHash, adminPinHash] = await Promise.all([
    bcrypt.hash(MANUAL_PLAYER_PIN, 10),
    bcrypt.hash(MANUAL_ADMIN_PIN, 10),
  ])

  const { data: existing, error: existingError } = await supabase
    .from('competitions')
    .select('id')
    .eq('slug', MANUAL_COMPETITION_SLUG)
    .maybeSingle()

  if (existingError) {
    throw new Error(`Kunde inte läsa manuell testtävling: ${existingError.message}`)
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('competitions')
      .update({
        name: MANUAL_COMPETITION_NAME,
        player_pin_hash: playerPinHash,
        admin_pin_hash: adminPinHash,
        deleted_at: null,
      })
      .eq('id', existing.id)

    if (updateError) {
      throw new Error(`Kunde inte uppdatera manuell testtävling: ${updateError.message}`)
    }

    return existing.id
  }

  const { data: created, error: createError } = await supabase
    .from('competitions')
    .insert({
      name: MANUAL_COMPETITION_NAME,
      slug: MANUAL_COMPETITION_SLUG,
      player_pin_hash: playerPinHash,
      admin_pin_hash: adminPinHash,
    })
    .select('id')
    .single()

  if (createError || !created) {
    throw new Error(`Kunde inte skapa manuell testtävling: ${createError?.message ?? 'okänt fel'}`)
  }

  return created.id
}

function buildDefaultAssignments(
  preview: Awaited<ReturnType<typeof buildCompetitionImportPreview>>,
): CompetitionImportClassSessionAssignment[] {
  return preview.classSessionPrompts.map(prompt => ({
    classKey: prompt.classKey,
    sessionNumber: prompt.defaultSessionNumber ?? prompt.suggestedSessionNumber,
  }))
}

// ─── Draw seeding ────────────────────────────────────────────────────────────
// After the roster import populates classes + registrations, we synthesize an
// Ondata snapshot so developers can see live-draw data without running the
// real Ondata integration. The snapshot uses the same tables that production
// writes to, so any feature that reads draw data works unchanged.

type PlayerSlot = { name: string; club: string | null }

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
    .replace(/[^a-z0-9åäö]+/g, '-')
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
  if (classIndex < 2) return 'complete'
  if (classIndex < 4) return 'partial'
  return 'drawn'
}

async function buildDrawPayload(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  competitionId: string,
  competitionSlug: string,
): Promise<OnDataSnapshotPayload | null> {
  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, session_order')
    .eq('competition_id', competitionId)
    .order('session_order', { ascending: true })

  if (sessionsError) throw new Error(sessionsError.message)
  if (!sessions || sessions.length === 0) return null

  const sessionOrderById = new Map(sessions.map(s => [s.id, s.session_order]))
  const sessionIds = sessions.map(s => s.id)

  const { data: classRows, error: classesError } = await supabase
    .from('classes')
    .select('id, name, start_time, session_id')
    .in('session_id', sessionIds)

  if (classesError) throw new Error(classesError.message)
  if (!classRows || classRows.length === 0) return null

  const sortedClasses = [...classRows].sort((a, b) => {
    const sessionDelta =
      (sessionOrderById.get(a.session_id) ?? 0) - (sessionOrderById.get(b.session_id) ?? 0)
    if (sessionDelta !== 0) return sessionDelta
    return a.start_time.localeCompare(b.start_time)
  })

  const classIds = sortedClasses.map(c => c.id)
  const { data: registrations, error: regsError } = await supabase
    .from('registrations')
    .select('class_id, player_id, status')
    .in('class_id', classIds)

  if (regsError) throw new Error(regsError.message)

  const { data: playerRows, error: playersError } = await supabase
    .from('players')
    .select('id, name, club')
    .eq('competition_id', competitionId)

  if (playersError) throw new Error(playersError.message)

  const playerById = new Map<string, PlayerSlot>()
  for (const row of playerRows ?? []) {
    playerById.set(row.id, { name: row.name, club: row.club })
  }

  const playersByClass = new Map<string, PlayerSlot[]>()
  for (const reg of registrations ?? []) {
    if (reg.status === 'reserve') continue
    const player = playerById.get(reg.player_id)
    if (!player) continue
    const existing = playersByClass.get(reg.class_id) ?? []
    existing.push(player)
    playersByClass.set(reg.class_id, existing)
  }

  let totalPools = 0
  let totalCompletedMatches = 0
  const snapshotClasses: OnDataSnapshotClass[] = []

  sortedClasses.forEach((cls, classIndex) => {
    const players = (playersByClass.get(cls.id) ?? []).slice()
    players.sort((a, b) => a.name.localeCompare(b.name, 'sv'))

    const pools = partitionIntoPools(players)
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

    const local = formatStockholmDateTime(cls.start_time)
    snapshotClasses.push({
      externalClassKey: `${slugifyClassName(cls.name)}-${classIndex + 1}`,
      className: cls.name,
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
      fileName: 'dev-seed.xml',
      filePath: 'dev-seed',
      fileModifiedAt: nowIso,
      copiedToTempAt: nowIso,
      processedAt: nowIso,
      fileHash: `dev-seed-${Date.now()}`,
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
) {
  // Wipe existing snapshot data before reseeding (cascade handles children).
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

  // persistOnDataSnapshot needs a settings row to exist conceptually; create an
  // empty one if none is there (dev competitions don't need a real token).
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

  const payload = await buildDrawPayload(supabase, competitionId, competitionSlug)
  if (!payload) return null

  const payloadHash = hashOnDataSnapshotPayload(payload)
  await persistOnDataSnapshot(supabase, competitionId, payload, payloadHash)

  return payload.summary
}

async function main() {
  if (!existsSync(IMPORT_SOURCE_PATH)) {
    throw new Error('competition_registrations.txt saknas.')
  }

  const sourceText = readFileSync(IMPORT_SOURCE_PATH, 'utf8')
  if (!sourceText.trim()) {
    throw new Error('competition_registrations.txt är tom.')
  }

  const supabase = createSupabaseAdminClient()
  const competitionId = await ensureCompetition(supabase)
  const preview = await buildCompetitionImportPreview(supabase, competitionId, sourceText)

  if (preview.errors.length > 0) {
    throw new Error(`Importförhandsgranskningen misslyckades:\n${preview.errors.join('\n')}`)
  }

  const assignments = buildDefaultAssignments(preview)
  const applied = await applyCompetitionImport(
    supabase,
    competitionId,
    sourceText,
    true,
    assignments,
  )

  if (applied.preview) {
    const messages = [...applied.preview.errors, ...applied.preview.warnings]
    throw new Error(
      messages.length > 0
        ? `Importen kunde inte slutföras:\n${messages.join('\n')}`
        : 'Importen kunde inte slutföras.',
    )
  }

  const result = applied.result
  if (!result) {
    throw new Error('Importen returnerade inget resultat.')
  }

  const drawSummary = await seedDrawData(supabase, competitionId, MANUAL_COMPETITION_SLUG)

  console.log(`Manuell testtävling klar: http://localhost:3000/${MANUAL_COMPETITION_SLUG}`)
  console.log(`  Player PIN: ${MANUAL_PLAYER_PIN}`)
  console.log(`  Admin PIN:  ${MANUAL_ADMIN_PIN}`)

  if (drawSummary) {
    console.log(
      `  Lottning: ${drawSummary.classes} klasser, ${drawSummary.pools} pools, ${drawSummary.completedMatches} spelade matcher`,
    )
  } else {
    console.log('  Lottning: hoppade över (inga klasser eller spelare att lotta).')
  }

  const noChangesApplied =
    result.summary.registrationsAdded === 0
    && result.summary.registrationsRemoved === 0
    && result.summary.classesCreated === 0
    && result.summary.classesUpdated === 0
    && result.summary.playersCreated === 0
    && result.summary.playersDeleted === 0
    && result.summary.sessionsCreated === 0

  if (noChangesApplied) {
    console.log('  Import: inga ändringar behövdes, tävlingen är redan synkad med competition_registrations.txt')
  } else {
    console.log(
      `  Import: ${result.summary.registrationsAdded} tillagda, ${result.summary.registrationsRemoved} borttagna, ${result.summary.classesCreated} nya klasser, ${result.summary.classesUpdated} uppdaterade klasser`,
    )
  }

  console.log(
    `  Källa: ${preview.summary.classesParsed} klasser och ${preview.summary.registrationsParsed} anmälningar i competition_registrations.txt`,
  )
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error)

  if (isOptionalMode) {
    console.warn(`Varning: hoppade över synk av ${MANUAL_COMPETITION_SLUG}: ${message}`)
    process.exit(0)
  }

  console.error(message)
  process.exit(1)
})