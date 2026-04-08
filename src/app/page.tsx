import LandingEntryCard from '@/components/LandingEntryCard'
import {
  formatCompetitionDateRange,
  getCompetitionDateRanges,
} from '@/lib/competition-dates'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('competitions')
    .select('id, name, slug')
    .is('deleted_at', null)

  const competitionRows = data ?? []
  const dateRangesByCompetitionId = await getCompetitionDateRanges(
    supabase,
    competitionRows.map(competition => competition.id),
  )

  const competitions = competitionRows
    .map(competition => ({
      ...competition,
      ...(dateRangesByCompetitionId.get(competition.id) ?? {
        firstClassStart: null,
        lastClassStart: null,
      }),
    }))
    .sort((left, right) => {
      const leftStart = left.firstClassStart
        ? new Date(left.firstClassStart).getTime()
        : Number.MAX_SAFE_INTEGER
      const rightStart = right.firstClassStart
        ? new Date(right.firstClassStart).getTime()
        : Number.MAX_SAFE_INTEGER

      if (leftStart !== rightStart) {
        return leftStart - rightStart
      }

      return left.name.localeCompare(right.name, 'sv')
    })

  return (
    <main className="app-shell">
      <div className="relative mx-auto max-w-6xl space-y-8 sm:space-y-10">
        <header className="mx-auto max-w-3xl space-y-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            TTAttendance
          </p>
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-5xl">
              Tävlingsinformation och närvarorapportering
            </h1>
            <p className="text-base leading-7 text-muted sm:text-lg">
              Välj din tävling för att se registrerade spelare, anmäla närvaro och följa tävlingen live.
            </p>
          </div>
        </header>

        {competitions.length === 0 ? (
          <section className="app-card-soft mx-auto max-w-2xl border-dashed text-center">
            <h2 className="text-2xl font-semibold text-ink">Inga tävlingar upplagda</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Lägg upp en tävling i superadminvyn innan spelare eller sekretariat loggar in.
            </p>
          </section>
        ) : (
          <section
            data-testid="competition-entry-list"
            className="grid gap-4 lg:grid-cols-2 lg:gap-6"
          >
            {competitions.map(competition => (
              <div
                key={competition.slug}
                className={competitions.length === 1
                  ? 'lg:col-span-2 lg:mx-auto lg:w-full lg:max-w-2xl'
                  : undefined}
              >
                <LandingEntryCard
                  eyebrow={formatCompetitionDateRange(
                    competition.firstClassStart,
                    competition.lastClassStart,
                  )}
                  title={competition.name}
                  description="Öppna tävlingen för att söka bland registrerade spelare, anmäla närvaro och följa tävlingen live."
                  testId={`competition-entry-card-${competition.slug}`}
                  actions={[
                    {
                      href: `/${competition.slug}`,
                      label: 'Öppna tävlingen',
                      testId: `competition-open-link-${competition.slug}`,
                    },
                  ]}
                />
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  )
}