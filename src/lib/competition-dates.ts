import type { SupabaseClient } from '@supabase/supabase-js'

type CompetitionDateRangeRow = {
  competition_id: string
  first_class_start: string | null
  last_class_start: string | null
}

export type CompetitionDateRange = {
  firstClassStart: string | null
  lastClassStart: string | null
}

export async function getCompetitionDateRanges(
  supabase: SupabaseClient,
  competitionIds: string[],
) {
  if (competitionIds.length === 0) {
    return new Map<string, CompetitionDateRange>()
  }

  const { data, error } = await supabase.rpc('competition_date_ranges', {
    p_competition_ids: competitionIds,
  })

  if (error) {
    throw new Error(error.message)
  }

  return new Map(
    ((data ?? []) as CompetitionDateRangeRow[]).map(row => [
      row.competition_id,
      {
        firstClassStart: row.first_class_start,
        lastClassStart: row.last_class_start,
      },
    ]),
  )
}

export async function getCompetitionDateRange(
  supabase: SupabaseClient,
  competitionId: string,
): Promise<CompetitionDateRange> {
  const dateRangesByCompetitionId = await getCompetitionDateRanges(supabase, [competitionId])

  return dateRangesByCompetitionId.get(competitionId) ?? {
    firstClassStart: null,
    lastClassStart: null,
  }
}

export function formatCompetitionDateRange(
  firstClassStart: string | null,
  lastClassStart: string | null,
) {
  if (!firstClassStart || !lastClassStart) {
    return 'Datum sätts vid import'
  }

  const start = new Date(firstClassStart)
  const end = new Date(lastClassStart)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Datum sätts vid import'
  }

  const formatter = new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  if (start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10)) {
    return formatter.format(start)
  }

  return `${formatter.format(start)} - ${formatter.format(end)}`
}