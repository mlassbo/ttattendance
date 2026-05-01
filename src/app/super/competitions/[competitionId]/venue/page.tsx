import { createServerClient } from '@/lib/supabase'
import VenueSettingsView from './VenueSettingsView'

export default async function CompetitionVenuePage({
  params,
}: {
  params: { competitionId: string }
}) {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('competitions')
    .select('id, venue_table_count')
    .eq('id', params.competitionId)
    .single()

  const initialVenueTableCount = (data?.venue_table_count as number | null | undefined) ?? null

  return (
    <VenueSettingsView
      competitionId={params.competitionId}
      initialVenueTableCount={initialVenueTableCount}
    />
  )
}
