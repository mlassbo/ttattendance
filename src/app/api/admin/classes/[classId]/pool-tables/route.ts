import { NextRequest, NextResponse } from 'next/server'
import { getScopedCompetitionAuth } from '@/lib/scoped-competition-auth'
import { getAuthorizedAdminClass } from '@/lib/class-workflow-server'
import {
  getPoolTablesByClassId,
  getSnapshotPoolNumbersForClass,
} from '@/lib/pool-progress'
import { parsePoolTables } from '@/lib/pool-tables'
import { createServerClient } from '@/lib/supabase'

type SavedPool = { poolNumber: number; tables: number[] }

async function buildResponseBody(
  supabase: ReturnType<typeof createServerClient>,
  competitionId: string,
  classId: string,
  className: string,
): Promise<{ pools: SavedPool[] }> {
  const [snapshotPoolNumbers, savedTablesByClass] = await Promise.all([
    getSnapshotPoolNumbersForClass(supabase, competitionId, className),
    getPoolTablesByClassId(supabase, [classId]),
  ])

  const savedByNumber = savedTablesByClass.get(classId) ?? new Map<number, number[]>()
  const allNumbers = new Set<number>(snapshotPoolNumbers)
  for (const poolNumber of Array.from(savedByNumber.keys())) {
    allNumbers.add(poolNumber)
  }

  const ordered = Array.from(allNumbers).sort((a, b) => a - b)
  return {
    pools: ordered.map(poolNumber => ({
      poolNumber,
      tables: savedByNumber.get(poolNumber) ?? [],
    })),
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { classId: string } },
) {
  const auth = await getScopedCompetitionAuth(req)
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const cls = await getAuthorizedAdminClass(supabase, auth.competitionId, params.classId)
  if (!cls) {
    return NextResponse.json({ error: 'Klassen hittades inte' }, { status: 404 })
  }

  try {
    const body = await buildResponseBody(supabase, auth.competitionId, cls.id, cls.name)
    return NextResponse.json(body)
  } catch {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }
}

type IncomingPool = { poolNumber?: unknown; tables?: unknown }

export async function PUT(
  req: NextRequest,
  { params }: { params: { classId: string } },
) {
  const auth = await getScopedCompetitionAuth(req)
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const cls = await getAuthorizedAdminClass(supabase, auth.competitionId, params.classId)
  if (!cls) {
    return NextResponse.json({ error: 'Klassen hittades inte' }, { status: 404 })
  }

  const payload = await req.json().catch(() => null)
  const rawPools = Array.isArray(payload?.pools) ? (payload.pools as IncomingPool[]) : null
  if (!rawPools) {
    return NextResponse.json({ error: 'Ogiltig data' }, { status: 400 })
  }

  type Normalized = { poolNumber: number; tables: number[] }
  const normalized: Normalized[] = []
  const seen = new Set<number>()

  for (const pool of rawPools) {
    if (
      typeof pool?.poolNumber !== 'number'
      || !Number.isInteger(pool.poolNumber)
      || pool.poolNumber < 1
    ) {
      return NextResponse.json({ error: 'Ogiltigt poolnummer' }, { status: 400 })
    }
    if (seen.has(pool.poolNumber)) {
      return NextResponse.json({ error: 'Duplicerat poolnummer' }, { status: 400 })
    }
    seen.add(pool.poolNumber)

    let tables: number[]
    if (typeof pool.tables === 'string') {
      const parsed = parsePoolTables(pool.tables)
      if (!parsed.ok) {
        return NextResponse.json(
          { error: `Pool ${pool.poolNumber}: ${parsed.error}` },
          { status: 400 },
        )
      }
      tables = parsed.tables
    } else if (Array.isArray(pool.tables)) {
      const collected: number[] = []
      for (const value of pool.tables) {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
          return NextResponse.json(
            { error: `Pool ${pool.poolNumber}: Bordnummer måste vara minst 1` },
            { status: 400 },
          )
        }
        collected.push(value)
      }
      tables = Array.from(new Set(collected)).sort((a, b) => a - b)
    } else {
      return NextResponse.json({ error: 'Ogiltig data' }, { status: 400 })
    }

    normalized.push({ poolNumber: pool.poolNumber, tables })
  }

  const toClear = normalized.filter(pool => pool.tables.length === 0).map(pool => pool.poolNumber)
  const toUpsert = normalized.filter(pool => pool.tables.length > 0)

  try {
    if (toClear.length > 0) {
      const { error } = await supabase
        .from('class_pool_tables')
        .delete()
        .eq('class_id', params.classId)
        .in('pool_number', toClear)

      if (error) {
        return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
      }
    }

    if (toUpsert.length > 0) {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('class_pool_tables')
        .upsert(
          toUpsert.map(pool => ({
            class_id: params.classId,
            pool_number: pool.poolNumber,
            tables: pool.tables,
            updated_at: now,
          })),
          { onConflict: 'class_id,pool_number' },
        )

      if (error) {
        return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
      }
    }

    const body = await buildResponseBody(supabase, auth.competitionId, cls.id, cls.name)
    return NextResponse.json(body)
  } catch {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }
}
