import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  applyRosterImport,
  buildClassIdentityKey,
  buildPlayerKey,
  buildRosterImportPreview,
  CompetitionImportClassSessionAssignment,
  isoToStockholmDate,
  isoToStockholmTime,
  type CompetitionImportApplyResult,
  type CompetitionImportPreview,
  type RosterImportDataset,
} from './planner'
import type { OnDataRosterSnapshotPayload } from './ondata-roster-contract'

type OnDataRegistrationStatusRow = {
  current_snapshot_id: string | null
  last_processed_at: string | null
  last_summary_classes: number | null
  last_summary_players: number | null
  last_summary_registrations: number | null
}

export function buildOnDataRegistrationIngestPath(competitionSlug: string): string {
  return `/api/integrations/ondata/competitions/${competitionSlug}/registration-snapshots`
}

export function hashOnDataRosterSnapshotPayload(payload: OnDataRosterSnapshotPayload): string {
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex')
}

export function buildRosterImportDatasetFromOnDataSnapshot(payload: OnDataRosterSnapshotPayload): RosterImportDataset {
  return {
    sourceType: payload.source.sourceType,
    competitionTitleFromSource: null,
    classes: payload.classes.map(classRow => ({
      externalClassKey: classRow.externalClassKey,
      identityKey: buildClassIdentityKey(
        classRow.className,
        isoToStockholmDate(classRow.startAt),
        isoToStockholmTime(classRow.startAt),
      ),
      className: classRow.className,
      startAt: classRow.startAt,
      classDate: isoToStockholmDate(classRow.startAt),
      classTime: isoToStockholmTime(classRow.startAt),
      registrations: classRow.registrations.map(registration => ({
        playerName: registration.playerName,
        clubName: registration.clubName,
        playerKey: buildPlayerKey(registration.playerName, registration.clubName),
      })),
    })),
    errors: [],
    summary: {
      classesParsed: payload.summary.classes,
      playersParsed: payload.summary.players,
      registrationsParsed: payload.summary.registrations,
    },
  }
}

export async function persistOnDataRegistrationSnapshot(
  supabase: SupabaseClient,
  competitionId: string,
  payload: OnDataRosterSnapshotPayload,
  payloadHash: string,
) {
  const receivedAt = new Date().toISOString()

  const { data: previousStatus, error: previousStatusError } = await supabase
    .from('ondata_registration_status')
    .select('current_snapshot_id, last_processed_at, last_summary_classes, last_summary_players, last_summary_registrations')
    .eq('competition_id', competitionId)
    .maybeSingle()

  if (previousStatusError) {
    throw new Error(previousStatusError.message)
  }

  const typedPreviousStatus = previousStatus as OnDataRegistrationStatusRow | null

  const { data: snapshot, error: snapshotError } = await supabase
    .from('ondata_registration_snapshots')
    .insert({
      competition_id: competitionId,
      schema_version: payload.schemaVersion,
      payload_hash: payloadHash,
      received_at: receivedAt,
      processed_at: null,
      processing_status: 'received',
      error_message: null,
      source_file_name: payload.source.fileName,
      source_file_path: payload.source.filePath,
      source_file_modified_at: payload.source.fileModifiedAt,
      source_processed_at: payload.source.processedAt,
      source_file_hash: payload.source.fileHash,
      summary_classes: payload.summary.classes,
      summary_players: payload.summary.players,
      summary_registrations: payload.summary.registrations,
      raw_payload: payload,
    })
    .select('id')
    .single()

  if (snapshotError || !snapshot) {
    throw new Error(snapshotError?.message ?? 'Kunde inte spara anmälningssnapshot.')
  }

  try {
    const classRows = payload.classes.map((classEntry, classIndex) => ({
      id: randomUUID(),
      snapshot_id: snapshot.id,
      class_order: classIndex,
      external_class_key: classEntry.externalClassKey,
      source_class_id: classEntry.sourceClassId,
      class_name: classEntry.className,
      start_at: classEntry.startAt,
    }))

    const registrationRows = payload.classes.flatMap((classEntry, classIndex) =>
      classEntry.registrations.map((registrationEntry, registrationIndex) => ({
        id: randomUUID(),
        snapshot_class_id: classRows[classIndex].id,
        registration_order: registrationIndex,
        player_name: registrationEntry.playerName,
        club_name: registrationEntry.clubName,
      })),
    )

    if (classRows.length > 0) {
      const { error } = await supabase.from('ondata_registration_snapshot_classes').insert(classRows)
      if (error) {
        throw new Error(error.message)
      }
    }

    if (registrationRows.length > 0) {
      const { error } = await supabase.from('ondata_registration_snapshot_registrations').insert(registrationRows)
      if (error) {
        throw new Error(error.message)
      }
    }

    const processedAt = new Date().toISOString()

    const { error: processedError } = await supabase
      .from('ondata_registration_snapshots')
      .update({
        processed_at: processedAt,
        processing_status: 'processed',
        error_message: null,
      })
      .eq('id', snapshot.id)

    if (processedError) {
      throw new Error(processedError.message)
    }

    const { error: statusError } = await supabase
      .from('ondata_registration_status')
      .upsert({
        competition_id: competitionId,
        current_snapshot_id: snapshot.id,
        last_received_at: receivedAt,
        last_processed_at: processedAt,
        last_payload_hash: payloadHash,
        last_error: null,
        last_summary_classes: payload.summary.classes,
        last_summary_players: payload.summary.players,
        last_summary_registrations: payload.summary.registrations,
        updated_at: processedAt,
      }, { onConflict: 'competition_id' })

    if (statusError) {
      throw new Error(statusError.message)
    }

    return {
      snapshotId: snapshot.id,
      receivedAt,
      processedAt,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Kunde inte bearbeta anmälningssnapshot.'

    await supabase
      .from('ondata_registration_snapshots')
      .update({
        processing_status: 'error',
        error_message: errorMessage,
      })
      .eq('id', snapshot.id)

    await supabase
      .from('ondata_registration_status')
      .upsert({
        competition_id: competitionId,
        current_snapshot_id: typedPreviousStatus?.current_snapshot_id ?? null,
        last_received_at: receivedAt,
        last_processed_at: typedPreviousStatus?.last_processed_at ?? null,
        last_payload_hash: payloadHash,
        last_error: errorMessage,
        last_summary_classes: typedPreviousStatus?.last_summary_classes ?? 0,
        last_summary_players: typedPreviousStatus?.last_summary_players ?? 0,
        last_summary_registrations: typedPreviousStatus?.last_summary_registrations ?? 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'competition_id' })

    throw error
  }
}

async function resolveSnapshotId(
  supabase: SupabaseClient,
  competitionId: string,
  snapshotId?: string,
): Promise<string | null> {
  if (snapshotId) {
    return snapshotId
  }

  const { data: status, error } = await supabase
    .from('ondata_registration_status')
    .select('current_snapshot_id')
    .eq('competition_id', competitionId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (status as { current_snapshot_id?: string | null } | null)?.current_snapshot_id ?? null
}

export async function loadOnDataRegistrationSnapshotPayload(
  supabase: SupabaseClient,
  competitionId: string,
  snapshotId?: string,
): Promise<{ snapshotId: string; payload: OnDataRosterSnapshotPayload } | null> {
  const resolvedSnapshotId = await resolveSnapshotId(supabase, competitionId, snapshotId)
  if (!resolvedSnapshotId) {
    return null
  }

  const { data, error } = await supabase
    .from('ondata_registration_snapshots')
    .select('id, raw_payload')
    .eq('competition_id', competitionId)
    .eq('id', resolvedSnapshotId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    return null
  }

  return {
    snapshotId: (data as { id: string }).id,
    payload: (data as { raw_payload: OnDataRosterSnapshotPayload }).raw_payload,
  }
}

export async function buildOnDataRegistrationImportPreview(
  supabase: SupabaseClient,
  competitionId: string,
  snapshotId?: string,
): Promise<{ snapshotId: string; preview: CompetitionImportPreview } | null> {
  const snapshot = await loadOnDataRegistrationSnapshotPayload(supabase, competitionId, snapshotId)
  if (!snapshot) {
    return null
  }

  const preview = await buildRosterImportPreview(
    supabase,
    competitionId,
    buildRosterImportDatasetFromOnDataSnapshot(snapshot.payload),
  )

  return {
    snapshotId: snapshot.snapshotId,
    preview,
  }
}

export async function applyOnDataRegistrationImport(
  supabase: SupabaseClient,
  competitionId: string,
  confirmRemovalWithAttendance: boolean,
  classSessionAssignments: CompetitionImportClassSessionAssignment[],
  snapshotId?: string,
): Promise<{ snapshotId: string; preview?: CompetitionImportPreview; result?: CompetitionImportApplyResult } | null> {
  const snapshot = await loadOnDataRegistrationSnapshotPayload(supabase, competitionId, snapshotId)
  if (!snapshot) {
    return null
  }

  const applied = await applyRosterImport(
    supabase,
    competitionId,
    buildRosterImportDatasetFromOnDataSnapshot(snapshot.payload),
    confirmRemovalWithAttendance,
    classSessionAssignments,
  )

  if (applied.result) {
    const appliedAt = new Date().toISOString()
    const { error } = await supabase
      .from('ondata_registration_status')
      .upsert({
        competition_id: competitionId,
        last_applied_snapshot_id: snapshot.snapshotId,
        last_applied_at: appliedAt,
        updated_at: appliedAt,
      }, { onConflict: 'competition_id' })

    if (error) {
      throw new Error(error.message)
    }
  }

  return {
    snapshotId: snapshot.snapshotId,
    preview: applied.preview,
    result: applied.result,
  }
}