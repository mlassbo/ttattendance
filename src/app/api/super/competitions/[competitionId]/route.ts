import { NextResponse } from 'next/server'
import { revalidateCompetitionPaths } from '@/lib/revalidate-competition-paths'
import { createServerClient } from '@/lib/supabase'

export async function PATCH(
  request: Request,
  { params }: { params: { competitionId: string } },
) {
  const body = await request.json().catch(() => null)
  const showOnLandingPage = body?.showOnLandingPage

  if (typeof showOnLandingPage !== 'boolean') {
    return NextResponse.json({ error: 'Ogiltigt värde för startsidevisning' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('competitions')
    .update({ show_on_landing_page: showOnLandingPage })
    .eq('id', params.competitionId)
    .select('id, slug, show_on_landing_page')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Tävlingen hittades inte' }, { status: 404 })
  }

  revalidateCompetitionPaths(data.slug)

  return NextResponse.json({
    id: data.id,
    showOnLandingPage: data.show_on_landing_page,
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { competitionId: string } },
) {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('competitions')
    .delete()
    .eq('id', params.competitionId)
    .select('id, slug')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Tävlingen hittades inte' }, { status: 404 })
  }

  revalidateCompetitionPaths(data.slug)

  return NextResponse.json({ ok: true })
}