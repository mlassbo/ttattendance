// Competition-scoped cookie helpers.
// Cookie value format (before signing): "{role}:{competitionId}:{slug}"
// e.g. "player:550e8400-e29b-41d4-a716-446655440000:smd-2025"
//
// All competition-scoped API routes are implicitly scoped to the competition
// stored in the cookie. Route handlers read competitionId from here — never
// from the request body or query string.

import { signCookie, verifyCookie } from './cookie-signing'

export interface CompetitionAuth {
  role: 'player' | 'admin'
  competitionId: string
  slug: string
}

export async function signCompetitionCookie(
  auth: CompetitionAuth,
  secret: string
): Promise<string> {
  const value = `${auth.role}:${auth.competitionId}:${auth.slug}`
  return signCookie(value, secret)
}

export async function verifyCompetitionCookie(
  signed: string,
  secret: string
): Promise<CompetitionAuth | null> {
  const value = await verifyCookie(signed, secret)
  if (!value) return null

  // Split on first two colons only.
  // role has no colons, competitionId is a UUID (no colons), slug has no colons.
  const first = value.indexOf(':')
  if (first === -1) return null
  const second = value.indexOf(':', first + 1)
  if (second === -1) return null

  const role = value.substring(0, first)
  const competitionId = value.substring(first + 1, second)
  const slug = value.substring(second + 1)

  if (!competitionId || !slug) return null
  if (role !== 'player' && role !== 'admin') return null

  return { role, competitionId, slug }
}

/** Reads and verifies the competition cookie from a Next.js API request. */
export async function getCompetitionAuth(
  cookies: { get(name: string): { value: string } | undefined }
): Promise<CompetitionAuth | null> {
  const signed = cookies.get('role')?.value
  const secret = process.env.COOKIE_SECRET
  if (!signed || !secret) return null
  return verifyCompetitionCookie(signed, secret)
}
