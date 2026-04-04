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

  console.log(`Manuell testtävling klar: http://localhost:3000/${MANUAL_COMPETITION_SLUG}`)
  console.log(`  Player PIN: ${MANUAL_PLAYER_PIN}`)
  console.log(`  Admin PIN:  ${MANUAL_ADMIN_PIN}`)

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