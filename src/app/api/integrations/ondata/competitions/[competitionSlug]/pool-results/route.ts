import { NextRequest, NextResponse } from 'next/server'
import { extractBearerToken, verifyOnDataApiToken } from '@/lib/ondata-integration-auth'
import { createServerClient } from '@/lib/supabase'
import { parseOnDataPoolResultsPayload } from '@/lib/ondata-pool-results-contract'
import {
  hashOnDataPoolResultsPayload,
  persistOnDataPoolResults,
} from '@/lib/ondata-pool-results-server'

export async function POST(
  req: NextRequest,
  { params }: { params: { competitionSlug: string } },
) {
  const token = extractBearerToken(req.headers.get('authorization'))
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Ogiltig JSON.' }, { status: 400 })
  }

  let payload
  try {
    payload = parseOnDataPoolResultsPayload(body)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ogiltigt payload-format.' },
      { status: 400 },
    )
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
    const result = await persistOnDataPoolResults(
      supabase,
      competition.id,
      payload,
      hashOnDataPoolResultsPayload(payload),
    )

    return NextResponse.json({
      snapshotId: result.snapshotId,
      receivedAt: result.receivedAt,
      processedAt: result.processedAt,
    }, { status: 202 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunde inte spara poolresultat-snapshot.' },
      { status: 500 },
    )
  }
}