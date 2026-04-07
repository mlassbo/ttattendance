import { NextResponse } from 'next/server'
import { getOnDataIntegrationView } from '@/lib/ondata-integration-server'
import { createServerClient } from '@/lib/supabase'

export async function GET(
  _req: Request,
  { params }: { params: { competitionId: string } },
) {
  const supabase = createServerClient()
  const view = await getOnDataIntegrationView(supabase, params.competitionId)

  if (!view) {
    return NextResponse.json({ error: 'Tävlingen hittades inte.' }, { status: 404 })
  }

  return NextResponse.json(view)
}
