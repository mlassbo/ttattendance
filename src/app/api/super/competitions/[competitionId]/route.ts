import { NextResponse } from 'next/server'
import { revalidateCompetitionPaths } from '@/lib/revalidate-competition-paths'
import { createServerClient } from '@/lib/supabase'

export async function PATCH(
  request: Request,
  { params }: { params: { competitionId: string } },
) {
  const body = await request.json().catch(() => null)

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Ogiltig begäran' }, { status: 400 })
  }

  const updates: Record<string, boolean | number | null> = {}

  if ('showOnLandingPage' in body) {
    if (typeof body.showOnLandingPage !== 'boolean') {
      return NextResponse.json({ error: 'Ogiltigt värde för startsidevisning' }, { status: 400 })
    }
    updates.show_on_landing_page = body.showOnLandingPage
  }

  if ('venueTableCount' in body) {
    const value = body.venueTableCount
    if (value !== null && (!Number.isInteger(value) || value <= 0)) {
      return NextResponse.json(
        { error: 'Antal bord måste vara ett positivt heltal' },
        { status: 400 },
      )
    }
    updates.venue_table_count = value
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'Minst ett fält måste skickas (showOnLandingPage eller venueTableCount)' },
      { status: 400 },
    )
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('competitions')
    .update(updates)
    .eq('id', params.competitionId)
    .select('id, slug, show_on_landing_page, venue_table_count')
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
    venueTableCount: data.venue_table_count,
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
