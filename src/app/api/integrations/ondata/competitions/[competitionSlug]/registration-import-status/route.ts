import { NextRequest, NextResponse } from 'next/server'
import { extractBearerToken, verifyOnDataApiToken } from '@/lib/ondata-integration-auth'
import { createServerClient } from '@/lib/supabase'
import { getOnDataRegistrationImportStatus } from '@/lib/roster-import/ondata-roster-server'

export async function GET(
  req: NextRequest,
  { params }: { params: { competitionSlug: string } },
) {
  const token = extractBearerToken(req.headers.get('authorization'))
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const { data: competition } = await supabase
    .from('competitions')
    .select('id')
    .eq('slug', params.competitionSlug)
    .is('deleted_at', null)
    .single()

  if (!competition) {
    return NextResponse.json({ error: 'Tävlingen hittades inte.' }, { status: 404 })
  }

  const { data: settings } = await supabase
    .from('ondata_integration_settings')
    .select('api_token_hash')
    .eq('competition_id', competition.id)
    .maybeSingle()

  if (!verifyOnDataApiToken(token, settings?.api_token_hash)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await getOnDataRegistrationImportStatus(supabase, competition.id))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunde inte hämta status för anmälningsimport.' },
      { status: 500 },
    )
  }
}