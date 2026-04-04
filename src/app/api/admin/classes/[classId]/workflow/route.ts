import { NextRequest, NextResponse } from 'next/server'
import { getScopedCompetitionAuth } from '@/lib/scoped-competition-auth'
import { getAdminClassWorkflowPayload } from '@/lib/class-workflow-server'
import { createServerClient } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: { classId: string } },
) {
  const auth = await getScopedCompetitionAuth(req)
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await getAdminClassWorkflowPayload(
      createServerClient(),
      auth.competitionId,
      params.classId,
    )

    if (!payload) {
      return NextResponse.json({ error: 'Klassen hittades inte' }, { status: 404 })
    }

    return NextResponse.json(payload)
  } catch {
    return NextResponse.json({ error: 'Databasfel' }, { status: 500 })
  }
}