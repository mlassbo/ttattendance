import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OnDataSnapshotPayload } from './ondata-integration-contract'
import { getOnDataRegistrationImportStatus } from './roster-import/ondata-roster-server'

export function buildOnDataCompetitionIngestPath(competitionSlug: string): string {
  return `/api/integrations/ondata/competitions/${competitionSlug}`
}

export function buildOnDataIngestPath(competitionSlug: string): string {
  return `${buildOnDataCompetitionIngestPath(competitionSlug)}/snapshots`
}

export function hashOnDataSnapshotPayload(payload: OnDataSnapshotPayload): string {
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex')
}

export async function persistOnDataSnapshot(
  supabase: SupabaseClient,
  competitionId: string,
  payload: OnDataSnapshotPayload,
  payloadHash: string,
) {
  const receivedAt = new Date().toISOString()

  const { data: previousStatus, error: previousStatusError } = await supabase
    .from('ondata_integration_status')
    .select('current_snapshot_id, last_processed_at')
    .eq('competition_id', competitionId)
    .maybeSingle()

  if (previousStatusError) {
    throw new Error(previousStatusError.message)
  }

  const { data: snapshot, error: snapshotError } = await supabase
    .from('ondata_integration_snapshots')
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
      source_copied_to_temp_at: payload.source.copiedToTempAt,
      source_processed_at: payload.source.processedAt,
      source_file_hash: payload.source.fileHash,
      summary_classes: payload.summary.classes,
      summary_pools: payload.summary.pools,
      summary_completed_matches: payload.summary.completedMatches,
      raw_payload: payload,
    })
    .select('id')
    .single()

  if (snapshotError || !snapshot) {
    throw new Error(snapshotError?.message ?? 'Kunde inte spara snapshot.')
  }

  try {
    const classRows = payload.classes.map((classEntry, classIndex) => ({
      id: randomUUID(),
      snapshot_id: snapshot.id,
      class_order: classIndex,
      external_class_key: classEntry.externalClassKey,
      class_name: classEntry.className,
      class_date: classEntry.classDate,
      class_time: classEntry.classTime,
    }))

    const poolIdByClassAndOrder = new Map<string, string>()

    const poolRows = payload.classes.flatMap((classEntry, classIndex) =>
      classEntry.pools.map((poolEntry, poolIndex) => {
        const id = randomUUID()
        poolIdByClassAndOrder.set(`${classIndex}:${poolIndex}`, id)

        return {
          id,
          snapshot_class_id: classRows[classIndex].id,
          pool_order: poolIndex,
          pool_number: poolEntry.poolNumber,
          completed_match_count: poolEntry.completedMatchCount,
        }
      }),
    )

    const playerRows = payload.classes.flatMap((classEntry, classIndex) =>
      classEntry.pools.flatMap((poolEntry, poolIndex) =>
        poolEntry.players.map((playerEntry, playerIndex) => {
          const snapshotPoolId = poolIdByClassAndOrder.get(`${classIndex}:${poolIndex}`)
          if (!snapshotPoolId) {
            throw new Error('Kunde inte koppla spelare till rätt pool.')
          }

          return {
            id: randomUUID(),
            snapshot_pool_id: snapshotPoolId,
            player_order: playerIndex,
            name: playerEntry.name,
            club: playerEntry.club,
          }
        }),
      ),
    )

    const matchRows = payload.classes.flatMap((classEntry, classIndex) =>
      classEntry.pools.flatMap((poolEntry, poolIndex) =>
        poolEntry.matches.map((matchEntry, matchIndex) => {
          const snapshotPoolId = poolIdByClassAndOrder.get(`${classIndex}:${poolIndex}`)
          if (!snapshotPoolId) {
            throw new Error('Kunde inte koppla match till rätt pool.')
          }

          return {
            id: randomUUID(),
            snapshot_pool_id: snapshotPoolId,
            match_order: matchIndex,
            match_number: matchEntry.matchNumber,
            player_a_name: matchEntry.playerA?.name ?? null,
            player_a_club: matchEntry.playerA?.club ?? null,
            player_b_name: matchEntry.playerB?.name ?? null,
            player_b_club: matchEntry.playerB?.club ?? null,
            result: matchEntry.result,
          }
        }),
      ),
    )

    if (classRows.length > 0) {
      const { error } = await supabase.from('ondata_integration_snapshot_classes').insert(classRows)
      if (error) {
        throw new Error(error.message)
      }
    }

    if (poolRows.length > 0) {
      const { error } = await supabase.from('ondata_integration_snapshot_pools').insert(poolRows)
      if (error) {
        throw new Error(error.message)
      }
    }

    if (playerRows.length > 0) {
      const { error } = await supabase.from('ondata_integration_snapshot_players').insert(playerRows)
      if (error) {
        throw new Error(error.message)
      }
    }

    if (matchRows.length > 0) {
      const { error } = await supabase.from('ondata_integration_snapshot_matches').insert(matchRows)
      if (error) {
        throw new Error(error.message)
      }
    }

    const processedAt = new Date().toISOString()

    const { error: processedError } = await supabase
      .from('ondata_integration_snapshots')
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
      .from('ondata_integration_status')
      .upsert({
        competition_id: competitionId,
        current_snapshot_id: snapshot.id,
        last_received_at: receivedAt,
        last_processed_at: processedAt,
        last_payload_hash: payloadHash,
        last_source_file_modified_at: payload.source.fileModifiedAt,
        last_source_processed_at: payload.source.processedAt,
        last_error: null,
        last_summary_classes: payload.summary.classes,
        last_summary_pools: payload.summary.pools,
        last_summary_completed_matches: payload.summary.completedMatches,
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
    const errorMessage = error instanceof Error ? error.message : 'Kunde inte bearbeta snapshot.'

    await supabase
      .from('ondata_integration_snapshots')
      .update({
        processing_status: 'error',
        error_message: errorMessage,
      })
      .eq('id', snapshot.id)

    await supabase
      .from('ondata_integration_status')
      .upsert({
        competition_id: competitionId,
        current_snapshot_id: previousStatus?.current_snapshot_id ?? null,
        last_received_at: receivedAt,
        last_processed_at: previousStatus?.last_processed_at ?? null,
        last_payload_hash: payloadHash,
        last_source_file_modified_at: payload.source.fileModifiedAt,
        last_source_processed_at: payload.source.processedAt,
        last_error: errorMessage,
        last_summary_classes: payload.summary.classes,
        last_summary_pools: payload.summary.pools,
        last_summary_completed_matches: payload.summary.completedMatches,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'competition_id' })

    throw error
  }
}

export async function getOnDataIntegrationView(
  supabase: SupabaseClient,
  competitionId: string,
) {
  const { data: competition, error: competitionError } = await supabase
    .from('competitions')
    .select('id, name, slug')
    .eq('id', competitionId)
    .is('deleted_at', null)
    .single()

  if (competitionError || !competition) {
    return null
  }

  const [{ data: settings }, { data: liveStatus }, registrationImportStatus, { count: sessionCount }] = await Promise.all([
    supabase
      .from('ondata_integration_settings')
      .select('api_token_last4, token_generated_at')
      .eq('competition_id', competitionId)
      .maybeSingle(),
    supabase
      .from('ondata_integration_status')
      .select('current_snapshot_id, last_received_at, last_processed_at, last_source_file_modified_at, last_source_processed_at, last_error, last_summary_classes, last_summary_pools, last_summary_completed_matches')
      .eq('competition_id', competitionId)
      .maybeSingle(),
    getOnDataRegistrationImportStatus(supabase, competitionId),
    supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('competition_id', competitionId),
  ])

  let liveSourceFilePath: string | null = null
  if (liveStatus?.current_snapshot_id) {
    const { data: snapshot } = await supabase
      .from('ondata_integration_snapshots')
      .select('source_file_path')
      .eq('id', liveStatus.current_snapshot_id)
      .maybeSingle()

    liveSourceFilePath = snapshot?.source_file_path ?? null
  }

  return {
    competitionId: competition.id,
    competitionName: competition.name,
    competitionSlug: competition.slug,
    ingestPath: buildOnDataCompetitionIngestPath(competition.slug),
    schemaVersions: {
      liveSync: 1,
      registrationImport: 1,
    },
    hasApiKey: Boolean(settings?.token_generated_at),
    apiKeyLast4: settings?.api_token_last4 ?? null,
    apiKeyGeneratedAt: settings?.token_generated_at ?? null,
    hasExistingImport: (sessionCount ?? 0) > 0,
    liveSync: {
      latestSnapshotReceivedAt: liveStatus?.last_received_at ?? null,
      latestSnapshotProcessedAt: liveStatus?.last_processed_at ?? null,
      latestSourceFileModifiedAt: liveStatus?.last_source_file_modified_at ?? null,
      latestSourceProcessedAt: liveStatus?.last_source_processed_at ?? null,
      latestSourceFilePath: liveSourceFilePath,
      lastError: liveStatus?.last_error ?? null,
      latestSummary: {
        classes: liveStatus?.last_summary_classes ?? 0,
        pools: liveStatus?.last_summary_pools ?? 0,
        completedMatches: liveStatus?.last_summary_completed_matches ?? 0,
      },
    },
    registrationImport: {
      latestSnapshotId: registrationImportStatus.decision.latestSnapshotId,
      latestSnapshotReceivedAt: registrationImportStatus.latestSnapshotReceivedAt,
      latestSnapshotProcessedAt: registrationImportStatus.decision.latestSnapshotProcessedAt,
      latestSourceFilePath: registrationImportStatus.latestSourceFilePath,
      lastError: registrationImportStatus.lastError,
      lastAppliedSnapshotId: registrationImportStatus.decision.lastAppliedSnapshotId,
      lastAppliedAt: registrationImportStatus.decision.lastAppliedAt,
      latestSummary: {
        classes: registrationImportStatus.decision.latestSummary.classes,
        players: registrationImportStatus.decision.latestSummary.players,
        registrations: registrationImportStatus.decision.latestSummary.registrations,
      },
      decision: registrationImportStatus.decision,
    },
  }
}
