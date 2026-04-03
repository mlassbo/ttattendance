import { NextResponse } from 'next/server'
import { revalidateCompetitionPaths } from '@/lib/revalidate-competition-paths'
import { createServerClient } from '@/lib/supabase'

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