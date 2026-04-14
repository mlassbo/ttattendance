import { NextResponse } from 'next/server'
import { getClassLiveData, getPublicClassDetails } from '@/lib/public-competition'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: { classId: string } },
) {
  const supabase = createServerClient()

  const { data: classRow, error: classError } = await supabase
    .from('classes')
    .select(`
      id,
      sessions!inner (
        competition_id
      )
    `)
    .eq('id', params.classId)
    .maybeSingle()

  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 500 })
  }

  const session = Array.isArray(classRow?.sessions)
    ? (classRow.sessions[0] ?? null)
    : (classRow?.sessions ?? null)
  const competitionId = session?.competition_id
  if (!classRow || !competitionId) {
    return NextResponse.json({ error: 'Klassen hittades inte.' }, { status: 404 })
  }

  const { data: competition, error: competitionError } = await supabase
    .from('competitions')
    .select('id')
    .eq('id', competitionId)
    .is('deleted_at', null)
    .maybeSingle()

  if (competitionError) {
    return NextResponse.json({ error: competitionError.message }, { status: 500 })
  }

  if (!competition) {
    return NextResponse.json({ error: 'Klassen hittades inte.' }, { status: 404 })
  }

  try {
    const [liveData, classDetails] = await Promise.all([
      getClassLiveData(supabase, competitionId, params.classId),
      getPublicClassDetails(supabase, competitionId, params.classId),
    ])

    if (!classDetails) {
      return NextResponse.json({ error: 'Klassen hittades inte.' }, { status: 404 })
    }

    if (!liveData) {
      return NextResponse.json({
        status: 'none',
        data: null,
        classDetails,
      })
    }

    return NextResponse.json({
      status: 'pools_available',
      data: liveData,
      classDetails,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Det gick inte att läsa lottningen.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
