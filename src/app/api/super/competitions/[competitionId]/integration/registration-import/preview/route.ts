import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { CompetitionImportNotFoundError } from '@/lib/import/competition-import'
import { buildOnDataRegistrationImportPreview } from '@/lib/roster-import/ondata-roster-server'

export async function POST(
  req: NextRequest,
  { params }: { params: { competitionId: string } },
) {
  const body = await req.json().catch(() => null)
  const snapshotId = typeof body?.snapshotId === 'string' && body.snapshotId.trim()
    ? body.snapshotId.trim()
    : undefined

  const supabase = createServerClient()

  try {
    const result = await buildOnDataRegistrationImportPreview(supabase, params.competitionId, snapshotId)

    if (!result) {
      return NextResponse.json({ error: 'Ingen anmälningssnapshot har tagits emot än.' }, { status: 404 })
    }

    return NextResponse.json({
      snapshotId: result.snapshotId,
      ...result.preview,
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