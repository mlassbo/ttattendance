import type { createServerClient } from './supabase'

type ServerClient = ReturnType<typeof createServerClient>

export type PlayoffBracketCode = 'A' | 'B'

export type PlayoffRoundProgress = {
  name: string
  totalMatches: number
  completedMatches: number
}

export type BracketProgress = {
  bracket: PlayoffBracketCode
  className: string
  rounds: PlayoffRoundProgress[]
  totalMatches: number
  completedMatches: number
  lastSourceProcessedAt: string | null
}

export type PlayoffProgress = {
  a: BracketProgress | null
  b: BracketProgress | null
  lastSourceProcessedAt: string | null
}

export type PlayoffProgressLookup = {
  byClassId: Map<string, PlayoffProgress>
}

type LocalClassRow = {
  id: string
  name: string
}

type StatusRow = {
  parent_external_class_key: string
  playoff_bracket: PlayoffBracketCode
  current_snapshot_id: string | null
  last_source_processed_at: string | null
  last_summary_matches: number
  last_summary_completed_matches: number
}

type SnapshotRow = {
  id: string
  class_name: string
  parent_class_name: string
  parent_external_class_key: string
  playoff_bracket: PlayoffBracketCode
  source_processed_at: string | null
}

type RoundRow = {
  id: string
  snapshot_id: string
  round_order: number
  round_name: string
}

type MatchRow = {
  snapshot_round_id: string
  is_completed: boolean
}

function maxIsoDate(left: string | null, right: string | null): string | null {
  if (!left) return right
  if (!right) return left
  return left > right ? left : right
}

export async function getPlayoffProgressByClassId(
  supabase: ServerClient,
  competitionId: string,
  classes: LocalClassRow[],
): Promise<PlayoffProgressLookup> {
  if (classes.length === 0) {
    return { byClassId: new Map() }
  }

  const { data: statusData, error: statusError } = await supabase
    .from('ondata_playoff_status')
    .select(
      'parent_external_class_key, playoff_bracket, current_snapshot_id, last_source_processed_at, last_summary_matches, last_summary_completed_matches',
    )
    .eq('competition_id', competitionId)

  if (statusError) {
    throw new Error(statusError.message)
  }

  const statusRows = (statusData ?? []) as StatusRow[]
  const snapshotIds = statusRows
    .map(row => row.current_snapshot_id)
    .filter((value): value is string => Boolean(value))

  if (snapshotIds.length === 0) {
    return { byClassId: new Map() }
  }

  const { data: snapshotData, error: snapshotError } = await supabase
    .from('ondata_playoff_snapshots')
    .select('id, class_name, parent_class_name, parent_external_class_key, playoff_bracket, source_processed_at')
    .in('id', snapshotIds)

  if (snapshotError) {
    throw new Error(snapshotError.message)
  }

  const snapshotRows = (snapshotData ?? []) as SnapshotRow[]
  if (snapshotRows.length === 0) {
    return { byClassId: new Map() }
  }

  const snapshotById = new Map(snapshotRows.map(row => [row.id, row] as const))

  const { data: roundData, error: roundsError } = await supabase
    .from('ondata_playoff_snapshot_rounds')
    .select('id, snapshot_id, round_order, round_name')
    .in('snapshot_id', snapshotIds)
    .order('round_order', { ascending: true })

  if (roundsError) {
    throw new Error(roundsError.message)
  }

  const roundRows = (roundData ?? []) as RoundRow[]
  const roundsBySnapshotId = new Map<string, RoundRow[]>()
  for (const round of roundRows) {
    const list = roundsBySnapshotId.get(round.snapshot_id) ?? []
    list.push(round)
    roundsBySnapshotId.set(round.snapshot_id, list)
  }

  const roundIds = roundRows.map(round => round.id)
  const matchCountByRoundId = new Map<string, { total: number; completed: number }>()

  if (roundIds.length > 0) {
    const { data: matchData, error: matchError } = await supabase
      .from('ondata_playoff_snapshot_matches')
      .select('snapshot_round_id, is_completed')
      .in('snapshot_round_id', roundIds)

    if (matchError) {
      throw new Error(matchError.message)
    }

    for (const match of (matchData ?? []) as MatchRow[]) {
      const entry = matchCountByRoundId.get(match.snapshot_round_id) ?? { total: 0, completed: 0 }
      entry.total += 1
      if (match.is_completed) entry.completed += 1
      matchCountByRoundId.set(match.snapshot_round_id, entry)
    }
  }

  const classIdsByName = new Map<string, string[]>()
  for (const classRow of classes) {
    const existing = classIdsByName.get(classRow.name) ?? []
    existing.push(classRow.id)
    classIdsByName.set(classRow.name, existing)
  }

  const bracketProgressByClassIdAndBracket = new Map<string, { a: BracketProgress | null; b: BracketProgress | null }>()

  for (const status of statusRows) {
    if (!status.current_snapshot_id) continue
    const snapshot = snapshotById.get(status.current_snapshot_id)
    if (!snapshot) continue

    const localClassIds = classIdsByName.get(snapshot.parent_class_name) ?? []
    if (localClassIds.length === 0) continue

    const rounds = (roundsBySnapshotId.get(snapshot.id) ?? [])
      .slice()
      .sort((left, right) => left.round_order - right.round_order)
      .map(round => {
        const counts = matchCountByRoundId.get(round.id) ?? { total: 0, completed: 0 }
        return {
          name: round.round_name,
          totalMatches: counts.total,
          completedMatches: counts.completed,
        }
      })

    const bracketProgress: BracketProgress = {
      bracket: status.playoff_bracket,
      className: snapshot.class_name,
      rounds,
      totalMatches: status.last_summary_matches,
      completedMatches: status.last_summary_completed_matches,
      lastSourceProcessedAt: status.last_source_processed_at,
    }

    for (const classId of localClassIds) {
      const entry = bracketProgressByClassIdAndBracket.get(classId) ?? { a: null, b: null }
      if (status.playoff_bracket === 'A') {
        entry.a = bracketProgress
      } else {
        entry.b = bracketProgress
      }
      bracketProgressByClassIdAndBracket.set(classId, entry)
    }
  }

  const byClassId = new Map<string, PlayoffProgress>()
  for (const [classId, { a, b }] of Array.from(bracketProgressByClassIdAndBracket.entries())) {
    byClassId.set(classId, {
      a,
      b,
      lastSourceProcessedAt: maxIsoDate(a?.lastSourceProcessedAt ?? null, b?.lastSourceProcessedAt ?? null),
    })
  }

  return { byClassId }
}
