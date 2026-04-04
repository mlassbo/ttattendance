import { getCompetitionAuth, type CompetitionAuth } from './auth'
import { createServerClient } from './supabase'

type CompetitionRequestContext = {
  cookies: { get(name: string): { value: string } | undefined }
  headers: { get(name: string): string | null }
  nextUrl?: { searchParams: URLSearchParams }
}

function getRequestedCompetitionSlug(req: CompetitionRequestContext): string | null {
  const headerSlug = req.headers.get('x-competition-slug')?.trim()
  if (headerSlug) {
    return headerSlug
  }

  const querySlug = req.nextUrl?.searchParams.get('slug')?.trim()
  return querySlug || null
}

export async function getScopedCompetitionAuth(
  req: CompetitionRequestContext,
): Promise<CompetitionAuth | null> {
  const auth = await getCompetitionAuth(req.cookies)
  if (!auth) {
    return null
  }

  const requestedSlug = getRequestedCompetitionSlug(req)
  if (!requestedSlug || requestedSlug !== auth.slug) {
    return null
  }

  const supabase = createServerClient()
  const { data: competition, error } = await supabase
    .from('competitions')
    .select('id')
    .eq('slug', requestedSlug)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !competition) {
    return null
  }

  return {
    ...auth,
    competitionId: competition.id,
  }
}