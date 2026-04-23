import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OnDataPoolResultsPayload } from './ondata-pool-results-contract'
import { buildOnDataCompetitionIngestPath } from './ondata-integration-server'

export function buildOnDataPoolResultsIngestPath(competitionSlug: string): string {
  return `${buildOnDataCompetitionIngestPath(competitionSlug)}/pool-results`
}

export function hashOnDataPoolResultsPayload(payload: OnDataPoolResultsPayload): string {
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex')
}

export async function persistOnDataPoolResults(
  supabase: SupabaseClient,
  competitionId: string,
  payload: OnDataPoolResultsPayload,
  payloadHash: string,
) {
  const receivedAt = new Date().toISOString()

  const { data: previousStatus, error: previousStatusError } = await supabase
    .from('ondata_pool_result_status')
    .select('current_snapshot_id, last_processed_at')
    .eq('competition_id', competitionId)
    .eq('external_class_key', payload.class.externalClassKey)
    .maybeSingle()

  if (previousStatusError) {
    throw new Error(previousStatusError.message)
  }

  const { data: snapshot, error: snapshotError } = await supabase
    .from('ondata_pool_result_snapshots')
    .insert({
      competition_id: competitionId,
      external_class_key: payload.class.externalClassKey,
      source_class_id: payload.class.sourceClassId,
      class_name: payload.class.className,
      class_date: payload.class.classDate,
      class_time: payload.class.classTime,
      source_file_name: payload.source.fileName,
      source_file_path: payload.source.filePath,
      source_file_modified_at: payload.source.fileModifiedAt,
      source_processed_at: payload.source.processedAt,
      source_file_hash: payload.source.fileHash,
      payload_hash: payloadHash,
      processing_status: 'received',
      last_error: null,
      raw_payload: payload,
      received_at: receivedAt,
      processed_at: null,
    })
    .select('id')
    .single()

  if (snapshotError || !snapshot) {
    throw new Error(snapshotError?.message ?? 'Kunde inte spara poolresultat-snapshot.')
  }

  try {
    const poolRows = payload.class.pools.map((poolEntry) => ({
      id: randomUUID(),
      snapshot_id: snapshot.id,
      pool_number: poolEntry.poolNumber,
    }))

    const poolIdByNumber = new Map(poolRows.map((row) => [row.pool_number, row.id]))

    const standingRows = payload.class.pools.flatMap((poolEntry) =>
      poolEntry.standings.map((standingEntry) => {
        const poolId = poolIdByNumber.get(poolEntry.poolNumber)
        if (!poolId) {
          throw new Error('Kunde inte koppla placering till rätt pool.')
        }

        return {
          id: randomUUID(),
          pool_id: poolId,
          placement: standingEntry.placement,
          player_name: standingEntry.playerName,
          club_name: standingEntry.clubName,
          matches_won: standingEntry.matchesWon,
          matches_lost: standingEntry.matchesLost,
          sets_won: standingEntry.setsWon,
          sets_lost: standingEntry.setsLost,
          points_for: standingEntry.pointsFor,
          points_against: standingEntry.pointsAgainst,
        }
      }),
    )

    if (poolRows.length > 0) {
      const { error } = await supabase.from('ondata_pool_result_snapshot_pools').insert(poolRows)
      if (error) {
        throw new Error(error.message)
      }
    }

    if (standingRows.length > 0) {
      const { error } = await supabase.from('ondata_pool_result_snapshot_standings').insert(standingRows)
      if (error) {
        throw new Error(error.message)
      }
    }

    const processedAt = new Date().toISOString()

    const { error: processedError } = await supabase
      .from('ondata_pool_result_snapshots')
      .update({
        processed_at: processedAt,
        processing_status: 'processed',
        last_error: null,
      })
      .eq('id', snapshot.id)

    if (processedError) {
      throw new Error(processedError.message)
    }

    const { error: statusError } = await supabase
      .from('ondata_pool_result_status')
      .upsert({
        competition_id: competitionId,
        external_class_key: payload.class.externalClassKey,
        current_snapshot_id: snapshot.id,
        last_payload_hash: payloadHash,
        last_processed_at: processedAt,
        last_error: null,
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
    const errorMessage = error instanceof Error ? error.message : 'Kunde inte bearbeta poolresultat-snapshot.'

    await supabase
      .from('ondata_pool_result_snapshots')
      .update({
        processing_status: 'error',
        last_error: errorMessage,
      })
      .eq('id', snapshot.id)

    await supabase
      .from('ondata_pool_result_status')
      .upsert({
        competition_id: competitionId,
        external_class_key: payload.class.externalClassKey,
        current_snapshot_id: previousStatus?.current_snapshot_id ?? null,
        last_payload_hash: payloadHash,
        last_processed_at: previousStatus?.last_processed_at ?? null,
        last_error: errorMessage,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'competition_id,external_class_key' })

    throw error
  }
}