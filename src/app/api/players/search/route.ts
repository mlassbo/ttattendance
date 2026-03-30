import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCompetitionAuth } from '@/lib/auth'

// ── In-memory rate limiter ────────────────────────────────────────────────────
// Limits search requests per IP to protect the DB during peak event load.
// Module-level state persists across requests within the same server process.
// For this use-case (single-server, bounded number of competition devices) this
// is sufficient — a Redis-backed limiter is not needed.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 60 // 1 request/s sustained — generous for shared devices

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return false
  }
  if (entry.count >= RATE_MAX) return true
  entry.count++
  return false
}

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'För många förfrågningar' }, { status: 429 })
  }

  const auth = await getCompetitionAuth(req.cookies)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = req.nextUrl.searchParams.get('q') ?? ''
  if (q.length < 2) {
    return NextResponse.json({ players: [] })
  }

  const supabase = createServerClient()

  // Uses search_players() so the planner can hit the idx_players_competition_lower_name
  // index (lower(name) LIKE lower($2) || '%'). A plain .ilike() call generates
  // "name ILIKE $1" which PostgreSQL cannot rewrite to use that index.
  const { data, error } = await supabase.rpc('search_players', {
    p_competition_id: auth.competitionId,
    p_query: q,
  })

  if (error) {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }

  return NextResponse.json({ players: data })
}
