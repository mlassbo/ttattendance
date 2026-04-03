import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import {
  applyCompetitionImport,
  CompetitionImportClassSessionAssignment,
  CompetitionImportNotFoundError,
} from '@/lib/import/competition-import'
import { revalidateCompetitionPaths } from '@/lib/revalidate-competition-paths'

export async function POST(
  req: NextRequest,
  { params }: { params: { competitionId: string } },
) {
  const body = await req.json().catch(() => null)
  const sourceText = typeof body?.sourceText === 'string' ? body.sourceText : ''
  const confirmRemovalWithAttendance = body?.confirmRemovalWithAttendance === true
  const classSessionAssignments = Array.isArray(body?.classSessionAssignments)
    ? (body.classSessionAssignments as unknown[])
        .filter((assignment): assignment is CompetitionImportClassSessionAssignment => {
          if (typeof assignment !== 'object' || assignment === null) {
            return false
          }

          const candidate = assignment as Record<string, unknown>
          return typeof candidate.classKey === 'string'
            && typeof candidate.sessionNumber === 'number'
        })
    : []

  if (!sourceText.trim()) {
    return NextResponse.json({ error: 'Klistra in startlistan först.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: competition } = await supabase
    .from('competitions')
    .select('slug')
    .eq('id', params.competitionId)
    .maybeSingle()

  try {
    const applied = await applyCompetitionImport(
      supabase,
      params.competitionId,
      sourceText,
      confirmRemovalWithAttendance,
      classSessionAssignments,
    )

    if (applied.preview) {
      const status = applied.preview.summary.registrationsToRemoveWithAttendance > 0
        ? 409
        : 400
      return NextResponse.json(applied.preview, { status })
    }

    revalidateCompetitionPaths(competition?.slug)

    return NextResponse.json(applied.result)
  } catch (error) {
    if (error instanceof CompetitionImportNotFoundError) {
      return NextResponse.json({ error: 'Tävlingen hittades inte.' }, { status: 404 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ett okänt fel inträffade.' },
      { status: 500 },
    )
  }
}