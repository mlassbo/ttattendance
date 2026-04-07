import { NextResponse } from 'next/server'
import {
  generateOnDataApiToken,
  hashOnDataApiToken,
  maskOnDataApiTokenLast4,
} from '@/lib/ondata-integration-auth'
import { createServerClient } from '@/lib/supabase'

export async function POST(
  _req: Request,
  { params }: { params: { competitionId: string } },
) {
  const supabase = createServerClient()

  const { data: competition } = await supabase
    .from('competitions')
    .select('id')
    .eq('id', params.competitionId)
    .is('deleted_at', null)
    .single()

  if (!competition) {
    return NextResponse.json({ error: 'Tävlingen hittades inte.' }, { status: 404 })
  }

  const apiKey = generateOnDataApiToken()
  const generatedAt = new Date().toISOString()
  const tokenLast4 = maskOnDataApiTokenLast4(apiKey)

  const { error } = await supabase
    .from('ondata_integration_settings')
    .upsert({
      competition_id: competition.id,
      api_token_hash: hashOnDataApiToken(apiKey),
      api_token_last4: tokenLast4,
      token_generated_at: generatedAt,
      updated_at: generatedAt,
    }, { onConflict: 'competition_id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    apiKey,
    tokenLast4,
    generatedAt,
  })
}