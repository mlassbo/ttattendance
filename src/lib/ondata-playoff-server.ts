import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OnDataPlayoffSnapshotPayload } from './ondata-playoff-contract'
import { buildOnDataCompetitionIngestPath } from './ondata-integration-server'

export function buildOnDataPlayoffIngestPath(competitionSlug: string): string {
  return `${buildOnDataCompetitionIngestPath(competitionSlug)}/playoff-snapshots`
}

export function hashOnDataPlayoffSnapshotPayload(payload: OnDataPlayoffSnapshotPayload): string {
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex')
}

export async function persistOnDataPlayoffSnapshot(
  supabase: SupabaseClient,
  competitionId: string,
  payload: OnDataPlayoffSnapshotPayload,
  payloadHash: string,
) {
  const receivedAt = new Date().toISOString()

  const { data: previousStatus, error: previousStatusError } = await supabase
    .from('ondata_playoff_status')
    .select('current_snapshot_id, last_processed_at')
    .eq('competition_id', competitionId)
    .eq('external_class_key', payload.class.externalClassKey)
    .maybeSingle()

  if (previousStatusError) {
    throw new Error(previousStatusError.message)
  }

  const { data: snapshot, error: snapshotError } = await supabase
    .from('ondata_playoff_snapshots')
    .insert({
      competition_id: competitionId,
      schema_version: payload.schemaVersion,
      payload_hash: payloadHash,
      received_at: receivedAt,
      processed_at: null,
      processing_status: 'received',
      error_message: null,
      source_type: payload.source.sourceType,
      source_competition_url: payload.source.competitionUrl,
      source_class_id: payload.source.sourceClassId,
      source_stage5_path: payload.source.stage5Path,
      source_stage6_path: payload.source.stage6Path,
      source_processed_at: payload.source.processedAt,
      source_file_hash: payload.source.fileHash,
      class_source_class_id: payload.class.sourceClassId,
      external_class_key: payload.class.externalClassKey,
      class_name: payload.class.className,
      summary_rounds: payload.summary.rounds,
      summary_matches: payload.summary.matches,
      summary_completed_matches: payload.summary.completedMatches,
      raw_payload: payload,
    })
    .select('id')
    .single()

  if (snapshotError || !snapshot) {
    throw new Error(snapshotError?.message ?? 'Kunde inte spara playoff-snapshot.')
  }

  try {
    const roundRows = payload.rounds.map((roundEntry, roundIndex) => ({
      id: randomUUID(),
      snapshot_id: snapshot.id,
      round_order: roundIndex,
      round_name: roundEntry.name,
    }))

    const roundIdByIndex = new Map(roundRows.map((row, index) => [index, row.id]))

    const matchRows = payload.rounds.flatMap((roundEntry, roundIndex) =>
      roundEntry.matches.map((matchEntry, matchIndex) => {
        const snapshotRoundId = roundIdByIndex.get(roundIndex)
        if (!snapshotRoundId) {
          throw new Error('Kunde inte koppla match till rätt slutspelsrunda.')
        }

        return {
          id: randomUUID(),
          snapshot_id: snapshot.id,
          snapshot_round_id: snapshotRoundId,
          match_order: matchIndex,
          match_key: matchEntry.matchKey,
          player_a_name: matchEntry.playerA,
          player_b_name: matchEntry.playerB,
          winner_name: matchEntry.winner,
          result: matchEntry.result,
          is_completed: matchEntry.winner != null || matchEntry.result != null,
        }
      }),
    )

    if (roundRows.length > 0) {
      const { error } = await supabase.from('ondata_playoff_snapshot_rounds').insert(roundRows)
      if (error) {
        throw new Error(error.message)
      }
    }

    if (matchRows.length > 0) {
      const { error } = await supabase.from('ondata_playoff_snapshot_matches').insert(matchRows)
      if (error) {
        throw new Error(error.message)
      }
    }

    const processedAt = new Date().toISOString()

    const { error: processedError } = await supabase
      .from('ondata_playoff_snapshots')
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
      .from('ondata_playoff_status')
      .upsert({
        competition_id: competitionId,
        external_class_key: payload.class.externalClassKey,
        current_snapshot_id: snapshot.id,
        last_received_at: receivedAt,
        last_processed_at: processedAt,
        last_payload_hash: payloadHash,
        last_source_processed_at: payload.source.processedAt,
        last_error: null,
        last_summary_rounds: payload.summary.rounds,
        last_summary_matches: payload.summary.matches,
        last_summary_completed_matches: payload.summary.completedMatches,
        updated_at: processedAt,
      }, { onConflict: 'competition_id,external_class_key' })

    if (statusError) {
      throw new Error(statusError.message)
    }

    return {
      snapshotId: snapshot.id,
      receivedAt,
      processedAt,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Kunde inte bearbeta playoff-snapshot.'

    await supabase
      .from('ondata_playoff_snapshots')
      .update({
        processing_status: 'error',
        error_message: errorMessage,
      })
      .eq('id', snapshot.id)

    await supabase
      .from('ondata_playoff_status')
      .upsert({
        competition_id: competitionId,
        external_class_key: payload.class.externalClassKey,
        current_snapshot_id: previousStatus?.current_snapshot_id ?? null,
        last_received_at: receivedAt,
        last_processed_at: previousStatus?.last_processed_at ?? null,
        last_payload_hash: payloadHash,
        last_source_processed_at: payload.source.processedAt,
        last_error: errorMessage,
        last_summary_rounds: payload.summary.rounds,
        last_summary_matches: payload.summary.matches,
        last_summary_completed_matches: payload.summary.completedMatches,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'competition_id,external_class_key' })

    throw error
  }
}