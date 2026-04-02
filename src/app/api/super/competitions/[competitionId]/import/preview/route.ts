import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import {
  buildCompetitionImportPreview,
  CompetitionImportNotFoundError,
} from '@/lib/import/competition-import'

export async function POST(
  req: NextRequest,
  { params }: { params: { competitionId: string } },
) {
  const body = await req.json().catch(() => null)
  const sourceText = typeof body?.sourceText === 'string' ? body.sourceText : ''

  if (!sourceText.trim()) {
    return NextResponse.json({ error: 'Klistra in startlistan först.' }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    const preview = await buildCompetitionImportPreview(supabase, params.competitionId, sourceText)
    return NextResponse.json(preview)
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