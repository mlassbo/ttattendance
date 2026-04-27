import { NextRequest, NextResponse } from 'next/server'
import {
  CompetitionImportClassSessionAssignment,
  CompetitionImportNotFoundError,
} from '@/lib/import/competition-import'
import { revalidateCompetitionPaths } from '@/lib/revalidate-competition-paths'
import { createServerClient } from '@/lib/supabase'
import { applyOnDataRegistrationImport } from '@/lib/roster-import/ondata-roster-server'

export async function POST(
  req: NextRequest,
  { params }: { params: { competitionId: string } },
) {
  const body = await req.json().catch(() => null)
  const snapshotId = typeof body?.snapshotId === 'string' && body.snapshotId.trim()
    ? body.snapshotId.trim()
    : undefined
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

  const supabase = createServerClient()
  const { data: competition } = await supabase
    .from('competitions')
    .select('slug')
    .eq('id', params.competitionId)
    .maybeSingle()

  try {
    const applied = await applyOnDataRegistrationImport(
      supabase,
      params.competitionId,
      confirmRemovalWithAttendance,
      classSessionAssignments,
      snapshotId,
    )

    if (!applied) {
      return NextResponse.json({ error: 'Ingen anmälningssnapshot har tagits emot än.' }, { status: 404 })
    }

    if (applied.preview) {
      const status = applied.preview.summary.registrationsToRemoveWithConfirmedAttendance > 0
        ? 409
        : 400

      return NextResponse.json({
        snapshotId: applied.snapshotId,
        ...applied.preview,
      }, { status })
    }

    revalidateCompetitionPaths(competition?.slug)

    return NextResponse.json({
      snapshotId: applied.snapshotId,
      ...applied.result,
    })
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