import { NextRequest, NextResponse } from 'next/server'
import { extractBearerToken, verifyOnDataApiToken } from '@/lib/ondata-integration-auth'
import { revalidateCompetitionPaths } from '@/lib/revalidate-competition-paths'
import { createServerClient } from '@/lib/supabase'
import { parseOnDataRosterSnapshotPayload } from '@/lib/roster-import/ondata-roster-contract'
import {
  hashOnDataRosterSnapshotPayload,
  ingestAndMaybeApplyOnDataRegistrationSnapshot,
} from '@/lib/roster-import/ondata-roster-server'

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
    payload = parseOnDataRosterSnapshotPayload(body)
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
    const result = await ingestAndMaybeApplyOnDataRegistrationSnapshot(
      supabase,
      competition.id,
      payload,
      hashOnDataRosterSnapshotPayload(payload),
    )

    if (result.decision.state === 'auto_applied') {
      revalidateCompetitionPaths(params.competitionSlug)
    }

    return NextResponse.json({
      snapshotId: result.snapshotId,
      receivedAt: result.receivedAt,
      processedAt: result.processedAt,
      decision: result.decision,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunde inte spara anmälningssnapshot.' },
      { status: 500 },
    )
  }
}