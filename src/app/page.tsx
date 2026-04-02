import LandingEntryCard from '@/components/LandingEntryCard'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function formatCompetitionDateRange(startDate: string, endDate: string) {
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Datum saknas'
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

export default async function HomePage() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('competitions')
    .select('name, slug, start_date, end_date')
    .is('deleted_at', null)
    .order('start_date', { ascending: true })

  const competitions = data ?? []

  return (
    <main className="app-shell">
      <div className="relative mx-auto max-w-6xl space-y-8 sm:space-y-10">
        <header className="mx-auto max-w-3xl space-y-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            TTAttendance
          </p>
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-5xl">
              Närvarorapportering för pingistävlingar
            </h1>
            <p className="text-base leading-7 text-muted sm:text-lg">
              Välj din tävling och logga in med pin-koden från tävlingsprogrammet.
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
              <LandingEntryCard
                key={competition.slug}
                eyebrow={formatCompetitionDateRange(competition.start_date, competition.end_date)}
                title={competition.name}
                description="Välj om du ska rapportera som spelare eller arbeta i sekretariatet."
                testId={`competition-entry-card-${competition.slug}`}
                actions={[
                  {
                    href: `/${competition.slug}/player`,
                    label: 'Logga in som spelare',
                    testId: `player-login-link-${competition.slug}`,
                  },
                  {
                    href: `/${competition.slug}/admin`,
                    label: 'Logga in som sekretariat',
                    testId: `admin-login-link-${competition.slug}`,
                  },
                ]}
              />
            ))}
          </section>
        )}
      </div>
    </main>
  )
}