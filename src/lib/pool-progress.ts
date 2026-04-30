import type { createServerClient } from './supabase'

type ServerClient = ReturnType<typeof createServerClient>

export type PoolProgressPool = {
  poolNumber: number
  playerCount: number
  completedMatchCount: number
  tables: number[]
}

export type ClassPoolProgress = {
  pools: PoolProgressPool[]
  totalMatches: number
  completedMatches: number
}

export type PoolProgressLookup = {
  lastSyncAt: string | null
  byClassId: Map<string, ClassPoolProgress>
}

type StatusRow = {
  current_snapshot_id: string | null
  last_received_at: string | null
}

type SnapshotClassRow = {
  id: string
  class_name: string
}

type SnapshotPoolRow = {
  id: string
  snapshot_class_id: string
  pool_number: number
  pool_order: number
  completed_match_count: number
}

type SnapshotPlayerRow = {
  snapshot_pool_id: string
}

type ClassPoolTablesRow = {
  class_id: string
  pool_number: number
  tables: number[] | null
}

type LocalClassRow = {
  id: string
  name: string
}

export async function getSnapshotPoolNumbersForClass(
  supabase: ServerClient,
  competitionId: string,
  className: string,
): Promise<number[]> {
  const { data: statusRow, error: statusError } = await supabase
    .from('ondata_integration_status')
    .select('current_snapshot_id')
    .eq('competition_id', competitionId)
    .maybeSingle()

  if (statusError) {
    throw new Error(statusError.message)
  }

  const snapshotId = (statusRow as { current_snapshot_id: string | null } | null)?.current_snapshot_id ?? null
  if (!snapshotId) {
    return []
  }

  const { data: snapshotClassRows, error: snapshotClassError } = await supabase
    .from('ondata_integration_snapshot_classes')
    .select('id')
    .eq('snapshot_id', snapshotId)
    .eq('class_name', className)

  if (snapshotClassError) {
    throw new Error(snapshotClassError.message)
  }

  const snapshotClassIds = ((snapshotClassRows ?? []) as Array<{ id: string }>).map(row => row.id)
  if (snapshotClassIds.length === 0) {
    return []
  }

  const { data: poolsData, error: poolsError } = await supabase
    .from('ondata_integration_snapshot_pools')
    .select('pool_number')
    .in('snapshot_class_id', snapshotClassIds)
    .order('pool_number', { ascending: true })

  if (poolsError) {
    throw new Error(poolsError.message)
  }

  const seen = new Set<number>()
  const ordered: number[] = []
  for (const row of (poolsData ?? []) as Array<{ pool_number: number }>) {
    if (!seen.has(row.pool_number)) {
      seen.add(row.pool_number)
      ordered.push(row.pool_number)
    }
  }
  return ordered
}

export async function getPoolTablesByClassId(
  supabase: ServerClient,
  classIds: string[],
): Promise<Map<string, Map<number, number[]>>> {
  const result = new Map<string, Map<number, number[]>>()
  if (classIds.length === 0) {
    return result
  }

  const { data, error } = await supabase
    .from('class_pool_tables')
    .select('class_id, pool_number, tables')
    .in('class_id', classIds)

  if (error) {
    throw new Error(error.message)
  }

  for (const row of (data ?? []) as ClassPoolTablesRow[]) {
    let perClass = result.get(row.class_id)
    if (!perClass) {
      perClass = new Map<number, number[]>()
      result.set(row.class_id, perClass)
    }
    perClass.set(row.pool_number, row.tables ?? [])
  }

  return result
}

export async function getPoolProgressByClassId(
  supabase: ServerClient,
  competitionId: string,
  classes: LocalClassRow[],
): Promise<PoolProgressLookup> {
  const empty: PoolProgressLookup = {
    lastSyncAt: null,
    byClassId: new Map(),
  }

  if (classes.length === 0) {
    return empty
  }

  const { data: statusRow, error: statusError } = await supabase
    .from('ondata_integration_status')
    .select('current_snapshot_id, last_received_at')
    .eq('competition_id', competitionId)
    .maybeSingle()

  if (statusError) {
    throw new Error(statusError.message)
  }

  const status = (statusRow ?? null) as StatusRow | null
  const lastSyncAt = status?.last_received_at ?? null
  const snapshotId = status?.current_snapshot_id ?? null

  if (!snapshotId) {
    return { lastSyncAt, byClassId: new Map() }
  }

  const classNames = Array.from(new Set(classes.map(cls => cls.name)))

  const { data: snapshotClasses, error: snapshotClassesError } = await supabase
    .from('ondata_integration_snapshot_classes')
    .select('id, class_name')
    .eq('snapshot_id', snapshotId)
    .in('class_name', classNames)

  if (snapshotClassesError) {
    throw new Error(snapshotClassesError.message)
  }

  const snapshotClassRows = (snapshotClasses ?? []) as SnapshotClassRow[]
  if (snapshotClassRows.length === 0) {
    return { lastSyncAt, byClassId: new Map() }
  }

  const classIdsByName = new Map<string, string[]>()
  for (const cls of classes) {
    const existing = classIdsByName.get(cls.name) ?? []
    existing.push(cls.id)
    classIdsByName.set(cls.name, existing)
  }

  const localClassIdsBySnapshotClassId = new Map<string, string[]>()
  for (const row of snapshotClassRows) {
    const localIds = classIdsByName.get(row.class_name) ?? []
    if (localIds.length > 0) {
      localClassIdsBySnapshotClassId.set(row.id, localIds)
    }
  }

  if (localClassIdsBySnapshotClassId.size === 0) {
    return { lastSyncAt, byClassId: new Map() }
  }

  const snapshotClassIds = Array.from(localClassIdsBySnapshotClassId.keys())

  const { data: poolsData, error: poolsError } = await supabase
    .from('ondata_integration_snapshot_pools')
    .select('id, snapshot_class_id, pool_number, pool_order, completed_match_count')
    .in('snapshot_class_id', snapshotClassIds)
    .order('pool_order', { ascending: true })

  if (poolsError) {
    throw new Error(poolsError.message)
  }

  const poolRows = (poolsData ?? []) as SnapshotPoolRow[]
  if (poolRows.length === 0) {
    return { lastSyncAt, byClassId: new Map() }
  }

  const poolIds = poolRows.map(pool => pool.id)
  const { data: playersData, error: playersError } = await supabase
    .from('ondata_integration_snapshot_players')
    .select('snapshot_pool_id')
    .in('snapshot_pool_id', poolIds)

  if (playersError) {
    throw new Error(playersError.message)
  }

  const playerCountByPoolId = new Map<string, number>()
  for (const player of (playersData ?? []) as SnapshotPlayerRow[]) {
    playerCountByPoolId.set(
      player.snapshot_pool_id,
      (playerCountByPoolId.get(player.snapshot_pool_id) ?? 0) + 1,
    )
  }

  type PoolBase = {
    poolNumber: number
    playerCount: number
    completedMatchCount: number
  }

  const poolsBySnapshotClassId = new Map<string, PoolBase[]>()
  for (const pool of poolRows) {
    const playerCount = playerCountByPoolId.get(pool.id) ?? 0
    const list = poolsBySnapshotClassId.get(pool.snapshot_class_id) ?? []
    list.push({
      poolNumber: pool.pool_number,
      playerCount,
      completedMatchCount: pool.completed_match_count,
    })
    poolsBySnapshotClassId.set(pool.snapshot_class_id, list)
  }

  const allLocalClassIds = Array.from(
    new Set(Array.from(localClassIdsBySnapshotClassId.values()).flat()),
  )
  const tablesByClassId = await getPoolTablesByClassId(supabase, allLocalClassIds)

  const byClassId = new Map<string, ClassPoolProgress>()
  for (const [snapshotClassId, localClassIds] of Array.from(localClassIdsBySnapshotClassId.entries())) {
    const basePools = poolsBySnapshotClassId.get(snapshotClassId) ?? []
    if (basePools.length === 0) continue

    basePools.sort((a, b) => a.poolNumber - b.poolNumber)

    const totalMatches = basePools.reduce(
      (sum, pool) => sum + (pool.playerCount * (pool.playerCount - 1)) / 2,
      0,
    )
    const completedMatches = basePools.reduce((sum, pool) => sum + pool.completedMatchCount, 0)

    for (const localClassId of localClassIds) {
      const tablesForClass = tablesByClassId.get(localClassId) ?? new Map<number, number[]>()
      const poolsWithTables: PoolProgressPool[] = basePools.map(pool => ({
        ...pool,
        tables: tablesForClass.get(pool.poolNumber) ?? [],
      }))

      byClassId.set(localClassId, {
        pools: poolsWithTables,
        totalMatches,
        completedMatches,
      })
    }
  }

  return { lastSyncAt, byClassId }
}
