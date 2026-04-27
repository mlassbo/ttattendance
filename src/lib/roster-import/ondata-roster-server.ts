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
import type { OnDataRosterSnapshotClass, OnDataRosterSnapshotPayload } from './ondata-roster-contract'

export type RegistrationImportDecisionState =
  | 'no_snapshot'
  | 'ingested_only'
  | 'pending_manual_review'
  | 'auto_applied'
  | 'manually_applied'
  | 'apply_failed'

export type RegistrationImportDecisionReasonCode =
  | 'none'
  | 'confirmed_removals'
  | 'missing_session_assignment'
  | 'preview_errors'
  | 'ingest_failed'
  | 'apply_failed'

export type RegistrationImportPreviewSummary = {
  registrationsToAdd: number
  registrationsToRemove: number
  registrationsToRemoveWithConfirmedAttendance: number
  registrationsToRemoveWithAbsentAttendance: number
}

export type RegistrationImportDecision = {
  state: RegistrationImportDecisionState
  reasonCode: RegistrationImportDecisionReasonCode
  message: string | null
  latestSnapshotId: string | null
  lastAppliedSnapshotId: string | null
  latestSnapshotProcessedAt: string | null
  lastAppliedAt: string | null
  latestSummary: {
    classes: number
    players: number
    registrations: number
  }
  previewSummary?: RegistrationImportPreviewSummary
}

export type RegistrationImportStatus = {
  latestSnapshotReceivedAt: string | null
  latestSourceFilePath: string | null
  lastError: string | null
  decision: RegistrationImportDecision
}

type OnDataRegistrationStatusRow = {
  current_snapshot_id: string | null
  last_received_at: string | null
  last_processed_at: string | null
  last_summary_classes: number | null
  last_summary_players: number | null
  last_summary_registrations: number | null
  last_error: string | null
  last_applied_snapshot_id: string | null
  last_applied_at: string | null
  decision_state: RegistrationImportDecisionState | null
  decision_reason_code: RegistrationImportDecisionReasonCode | null
  decision_message: string | null
  preview_registrations_to_add: number | null
  preview_registrations_to_remove: number | null
  preview_registrations_to_remove_with_confirmed_attendance: number | null
  preview_registrations_to_remove_with_absent_attendance: number | null
}

export function buildOnDataRegistrationIngestPath(competitionSlug: string): string {
  return `/api/integrations/ondata/competitions/${competitionSlug}/registration-snapshots`
}

export function buildOnDataRegistrationImportStatusPath(competitionSlug: string): string {
  return `/api/integrations/ondata/competitions/${competitionSlug}/registration-import-status`
}

export function hashOnDataRosterSnapshotPayload(payload: OnDataRosterSnapshotPayload): string {
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex')
}

function buildRegistrationImportPreviewSummary(
  preview: CompetitionImportPreview,
): RegistrationImportPreviewSummary {
  return {
    registrationsToAdd: preview.summary.registrationsToAdd,
    registrationsToRemove: preview.summary.registrationsToRemove,
    registrationsToRemoveWithConfirmedAttendance:
      preview.summary.registrationsToRemoveWithConfirmedAttendance,
    registrationsToRemoveWithAbsentAttendance:
      preview.summary.registrationsToRemoveWithAbsentAttendance,
  }
}

function buildRegistrationImportDecision(args: {
  state: RegistrationImportDecisionState
  reasonCode: RegistrationImportDecisionReasonCode
  message: string | null
  latestSnapshotId: string | null
  lastAppliedSnapshotId: string | null
  latestSnapshotProcessedAt: string | null
  lastAppliedAt: string | null
  latestSummary: {
    classes: number
    players: number
    registrations: number
  }
  previewSummary?: RegistrationImportPreviewSummary
}): RegistrationImportDecision {
  return {
    state: args.state,
    reasonCode: args.reasonCode,
    message: args.message,
    latestSnapshotId: args.latestSnapshotId,
    lastAppliedSnapshotId: args.lastAppliedSnapshotId,
    latestSnapshotProcessedAt: args.latestSnapshotProcessedAt,
    lastAppliedAt: args.lastAppliedAt,
    latestSummary: args.latestSummary,
    previewSummary: args.previewSummary,
  }
}

function buildDecisionFromStatusRow(
  statusRow: OnDataRegistrationStatusRow | null,
): RegistrationImportDecision {
  const latestSummary = {
    classes: statusRow?.last_summary_classes ?? 0,
    players: statusRow?.last_summary_players ?? 0,
    registrations: statusRow?.last_summary_registrations ?? 0,
  }

  if (!statusRow?.current_snapshot_id) {
    return buildRegistrationImportDecision({
      state: 'no_snapshot',
      reasonCode: 'none',
      message: null,
      latestSnapshotId: null,
      lastAppliedSnapshotId: statusRow?.last_applied_snapshot_id ?? null,
      latestSnapshotProcessedAt: statusRow?.last_processed_at ?? null,
      lastAppliedAt: statusRow?.last_applied_at ?? null,
      latestSummary,
    })
  }

  const previewSummary = {
    registrationsToAdd: statusRow.preview_registrations_to_add ?? 0,
    registrationsToRemove: statusRow.preview_registrations_to_remove ?? 0,
    registrationsToRemoveWithConfirmedAttendance:
      statusRow.preview_registrations_to_remove_with_confirmed_attendance ?? 0,
    registrationsToRemoveWithAbsentAttendance:
      statusRow.preview_registrations_to_remove_with_absent_attendance ?? 0,
  }

  const fallbackState: RegistrationImportDecisionState =
    statusRow.last_applied_snapshot_id === statusRow.current_snapshot_id
      ? 'manually_applied'
      : 'ingested_only'

  return buildRegistrationImportDecision({
    state: statusRow.decision_state ?? fallbackState,
    reasonCode: statusRow.decision_reason_code ?? 'none',
    message: statusRow.decision_message,
    latestSnapshotId: statusRow.current_snapshot_id,
    lastAppliedSnapshotId: statusRow.last_applied_snapshot_id,
    latestSnapshotProcessedAt: statusRow.last_processed_at,
    lastAppliedAt: statusRow.last_applied_at,
    latestSummary,
    previewSummary,
  })
}

async function loadOnDataRegistrationStatusRow(
  supabase: SupabaseClient,
  competitionId: string,
): Promise<OnDataRegistrationStatusRow | null> {
  const { data, error } = await supabase
    .from('ondata_registration_status')
    .select([
      'current_snapshot_id',
      'last_received_at',
      'last_processed_at',
      'last_summary_classes',
      'last_summary_players',
      'last_summary_registrations',
      'last_error',
      'last_applied_snapshot_id',
      'last_applied_at',
      'decision_state',
      'decision_reason_code',
      'decision_message',
      'preview_registrations_to_add',
      'preview_registrations_to_remove',
      'preview_registrations_to_remove_with_confirmed_attendance',
      'preview_registrations_to_remove_with_absent_attendance',
    ].join(', '))
    .eq('competition_id', competitionId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as OnDataRegistrationStatusRow | null) ?? null
}

async function persistRegistrationImportDecision(
  supabase: SupabaseClient,
  competitionId: string,
  args: {
    state: RegistrationImportDecisionState
    reasonCode: RegistrationImportDecisionReasonCode
    message: string | null
    previewSummary?: RegistrationImportPreviewSummary
    lastAppliedSnapshotId?: string | null
    lastAppliedAt?: string | null
    lastError?: string | null
  },
) {
  const updatePayload: Record<string, unknown> = {
    competition_id: competitionId,
    decision_state: args.state,
    decision_reason_code: args.reasonCode,
    decision_message: args.message,
    updated_at: new Date().toISOString(),
  }

  if (args.previewSummary) {
    updatePayload.preview_registrations_to_add = args.previewSummary.registrationsToAdd
    updatePayload.preview_registrations_to_remove = args.previewSummary.registrationsToRemove
    updatePayload.preview_registrations_to_remove_with_confirmed_attendance =
      args.previewSummary.registrationsToRemoveWithConfirmedAttendance
    updatePayload.preview_registrations_to_remove_with_absent_attendance =
      args.previewSummary.registrationsToRemoveWithAbsentAttendance
  }

  if (args.lastAppliedSnapshotId !== undefined) {
    updatePayload.last_applied_snapshot_id = args.lastAppliedSnapshotId
  }

  if (args.lastAppliedAt !== undefined) {
    updatePayload.last_applied_at = args.lastAppliedAt
  }

  if (args.lastError !== undefined) {
    updatePayload.last_error = args.lastError
  }

  const { error } = await supabase
    .from('ondata_registration_status')
    .upsert(updatePayload, { onConflict: 'competition_id' })

  if (error) {
    throw new Error(error.message)
  }
}

function buildPendingManualReviewDecision(
  preview: CompetitionImportPreview,
  snapshotId: string,
  processedAt: string,
  latestSummary: { classes: number; players: number; registrations: number },
  reasonCode: Extract<
    RegistrationImportDecisionReasonCode,
    'confirmed_removals' | 'missing_session_assignment' | 'preview_errors'
  >,
  lastAppliedSnapshotId: string | null,
  lastAppliedAt: string | null,
): RegistrationImportDecision {
  const message = reasonCode === 'confirmed_removals'
    ? 'Manuell granskning krävs eftersom borttagningen påverkar anmälningar med bekräftad närvaro.'
    : reasonCode === 'missing_session_assignment'
      ? 'Manuell granskning krävs eftersom minst en klass saknar passmappning.'
      : 'Manuell granskning krävs eftersom förhandsgranskningen innehåller fel.'

  return buildRegistrationImportDecision({
    state: 'pending_manual_review',
    reasonCode,
    message,
    latestSnapshotId: snapshotId,
    lastAppliedSnapshotId,
    latestSnapshotProcessedAt: processedAt,
    lastAppliedAt,
    latestSummary,
    previewSummary: buildRegistrationImportPreviewSummary(preview),
  })
}

function buildDefaultClassSessionAssignments(
  preview: CompetitionImportPreview,
): CompetitionImportClassSessionAssignment[] | null {
  const assignments: CompetitionImportClassSessionAssignment[] = []

  for (const prompt of preview.classSessionPrompts) {
    if (prompt.defaultSessionNumber === null) {
      return null
    }

    if (!prompt.options.some(option => option.sessionNumber === prompt.defaultSessionNumber)) {
      return null
    }

    assignments.push({
      classKey: prompt.classKey,
      sessionNumber: prompt.defaultSessionNumber,
    })
  }

  return assignments
}

function resolveOnDataClassDate(classRow: OnDataRosterSnapshotClass): string {
  return classRow.classDate ?? (classRow.startAt ? isoToStockholmDate(classRow.startAt) : '')
}

function resolveOnDataClassTime(classRow: OnDataRosterSnapshotClass): string {
  return classRow.classTime ?? (classRow.startAt ? isoToStockholmTime(classRow.startAt) : '')
}

function buildOnDataRosterDatasetErrors(payload: OnDataRosterSnapshotPayload): string[] {
  return payload.classes
    .filter(classRow => !classRow.startAt)
    .map(classRow => `Klassen ${classRow.className} saknar starttid i OnData och kan inte importeras som aktiv klass ännu.`)
}

export function buildRosterImportDatasetFromOnDataSnapshot(payload: OnDataRosterSnapshotPayload): RosterImportDataset {
  return {
    sourceType: payload.source.sourceType,
    competitionTitleFromSource: null,
    classes: payload.classes.map(classRow => {
      const classDate = resolveOnDataClassDate(classRow)
      const classTime = resolveOnDataClassTime(classRow)

      return {
        externalClassKey: classRow.externalClassKey,
        identityKey: buildClassIdentityKey(
          classRow.className,
          classDate,
          classTime,
        ),
        className: classRow.className,
        startAt: classRow.startAt,
        classDate,
        classTime,
        registrations: classRow.registrations.map(registration => ({
          playerName: registration.playerName,
          clubName: registration.clubName,
          playerKey: buildPlayerKey(registration.playerName, registration.clubName),
        })),
      }
    }),
    errors: buildOnDataRosterDatasetErrors(payload),
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

  const typedPreviousStatus = await loadOnDataRegistrationStatusRow(supabase, competitionId)

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
        decision_state: 'ingested_only',
        decision_reason_code: 'none',
        decision_message: null,
        preview_registrations_to_add: 0,
        preview_registrations_to_remove: 0,
        preview_registrations_to_remove_with_confirmed_attendance: 0,
        preview_registrations_to_remove_with_absent_attendance: 0,
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

export async function getOnDataRegistrationImportStatus(
  supabase: SupabaseClient,
  competitionId: string,
): Promise<RegistrationImportStatus> {
  const statusRow = await loadOnDataRegistrationStatusRow(supabase, competitionId)

  let latestSourceFilePath: string | null = null
  if (statusRow?.current_snapshot_id) {
    const { data, error } = await supabase
      .from('ondata_registration_snapshots')
      .select('source_file_path')
      .eq('id', statusRow.current_snapshot_id)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    latestSourceFilePath = (data as { source_file_path?: string | null } | null)?.source_file_path ?? null
  }

  return {
    latestSnapshotReceivedAt: statusRow?.last_received_at ?? null,
    latestSourceFilePath,
    lastError: statusRow?.last_error ?? null,
    decision: buildDecisionFromStatusRow(statusRow),
  }
}

export async function ingestAndMaybeApplyOnDataRegistrationSnapshot(
  supabase: SupabaseClient,
  competitionId: string,
  payload: OnDataRosterSnapshotPayload,
  payloadHash: string,
): Promise<{
  snapshotId: string
  receivedAt: string
  processedAt: string
  decision: RegistrationImportDecision
}> {
  const persisted = await persistOnDataRegistrationSnapshot(
    supabase,
    competitionId,
    payload,
    payloadHash,
  )

  const latestSummary = {
    classes: payload.summary.classes,
    players: payload.summary.players,
    registrations: payload.summary.registrations,
  }

  const statusRow = await loadOnDataRegistrationStatusRow(supabase, competitionId)
  const lastAppliedSnapshotId = statusRow?.last_applied_snapshot_id ?? null
  const lastAppliedAt = statusRow?.last_applied_at ?? null
  const preview = await buildRosterImportPreview(
    supabase,
    competitionId,
    buildRosterImportDatasetFromOnDataSnapshot(payload),
  )

  if (preview.errors.length > 0) {
    const decision = buildPendingManualReviewDecision(
      preview,
      persisted.snapshotId,
      persisted.processedAt,
      latestSummary,
      'preview_errors',
      lastAppliedSnapshotId,
      lastAppliedAt,
    )

    await persistRegistrationImportDecision(supabase, competitionId, {
      state: decision.state,
      reasonCode: decision.reasonCode,
      message: decision.message,
      previewSummary: decision.previewSummary,
      lastError: null,
    })

    return { ...persisted, decision }
  }

  const defaultAssignments = buildDefaultClassSessionAssignments(preview)
  if (!defaultAssignments) {
    const decision = buildPendingManualReviewDecision(
      preview,
      persisted.snapshotId,
      persisted.processedAt,
      latestSummary,
      'missing_session_assignment',
      lastAppliedSnapshotId,
      lastAppliedAt,
    )

    await persistRegistrationImportDecision(supabase, competitionId, {
      state: decision.state,
      reasonCode: decision.reasonCode,
      message: decision.message,
      previewSummary: decision.previewSummary,
      lastError: null,
    })

    return { ...persisted, decision }
  }

  if (preview.summary.registrationsToRemoveWithConfirmedAttendance > 0) {
    const decision = buildPendingManualReviewDecision(
      preview,
      persisted.snapshotId,
      persisted.processedAt,
      latestSummary,
      'confirmed_removals',
      lastAppliedSnapshotId,
      lastAppliedAt,
    )

    await persistRegistrationImportDecision(supabase, competitionId, {
      state: decision.state,
      reasonCode: decision.reasonCode,
      message: decision.message,
      previewSummary: decision.previewSummary,
      lastError: null,
    })

    return { ...persisted, decision }
  }

  try {
    const applied = await applyRosterImport(
      supabase,
      competitionId,
      buildRosterImportDatasetFromOnDataSnapshot(payload),
      false,
      defaultAssignments,
    )

    if (applied.preview) {
      const decision = buildPendingManualReviewDecision(
        applied.preview,
        persisted.snapshotId,
        persisted.processedAt,
        latestSummary,
        applied.preview.errors.length > 0 ? 'preview_errors' : 'missing_session_assignment',
        lastAppliedSnapshotId,
        lastAppliedAt,
      )

      await persistRegistrationImportDecision(supabase, competitionId, {
        state: decision.state,
        reasonCode: decision.reasonCode,
        message: decision.message,
        previewSummary: decision.previewSummary,
        lastError: null,
      })

      return { ...persisted, decision }
    }

    const appliedAt = new Date().toISOString()
    const decision = buildRegistrationImportDecision({
      state: 'auto_applied',
      reasonCode: 'none',
      message: 'Anmälningssnapshot applicerades automatiskt.',
      latestSnapshotId: persisted.snapshotId,
      lastAppliedSnapshotId: persisted.snapshotId,
      latestSnapshotProcessedAt: persisted.processedAt,
      lastAppliedAt: appliedAt,
      latestSummary,
      previewSummary: buildRegistrationImportPreviewSummary(preview),
    })

    await persistRegistrationImportDecision(supabase, competitionId, {
      state: decision.state,
      reasonCode: decision.reasonCode,
      message: decision.message,
      previewSummary: decision.previewSummary,
      lastAppliedSnapshotId: persisted.snapshotId,
      lastAppliedAt: appliedAt,
      lastError: null,
    })

    return { ...persisted, decision }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Kunde inte applicera anmälningssnapshot automatiskt.'
    const decision = buildRegistrationImportDecision({
      state: 'apply_failed',
      reasonCode: 'apply_failed',
      message: 'Anmälningssnapshot togs emot men kunde inte appliceras automatiskt.',
      latestSnapshotId: persisted.snapshotId,
      lastAppliedSnapshotId,
      latestSnapshotProcessedAt: persisted.processedAt,
      lastAppliedAt,
      latestSummary,
      previewSummary: buildRegistrationImportPreviewSummary(preview),
    })

    await persistRegistrationImportDecision(supabase, competitionId, {
      state: decision.state,
      reasonCode: decision.reasonCode,
      message: decision.message,
      previewSummary: decision.previewSummary,
      lastError: errorMessage,
    })

    return { ...persisted, decision }
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
    await persistRegistrationImportDecision(supabase, competitionId, {
      state: 'manually_applied',
      reasonCode: 'none',
      message: 'Anmälningssnapshot applicerades manuellt.',
      lastAppliedSnapshotId: snapshot.snapshotId,
      lastAppliedAt: appliedAt,
      lastError: null,
    })
  }

  return {
    snapshotId: snapshot.snapshotId,
    preview: applied.preview,
    result: applied.result,
  }
}
