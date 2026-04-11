import { NextRequest, NextResponse } from 'next/server'
import { getScopedCompetitionAuth } from '@/lib/scoped-competition-auth'
import { getAuthorizedAdminClass } from '@/lib/class-workflow-server'
import { createServerClient } from '@/lib/supabase'

export async function getAuthorizedReserveClass(req: NextRequest, classId: string) {
  const auth = await getScopedCompetitionAuth(req)
  if (!auth || auth.role !== 'admin') {
    return {
      auth: null,
      supabase: null,
      cls: null,
      errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const supabase = createServerClient()
  const cls = await getAuthorizedAdminClass(supabase, auth.competitionId, classId)

  if (!cls) {
    return {
      auth,
      supabase,
      cls: null,
      errorResponse: NextResponse.json({ error: 'Klassen hittades inte' }, { status: 404 }),
    }
  }

  return {
    auth,
    supabase,
    cls,
    errorResponse: null,
  }
}
