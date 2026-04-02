import LandingEntryCard from '@/components/LandingEntryCard'
import { createServerClient } from '@/lib/supabase'

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
    <main className="relative min-h-screen overflow-hidden bg-slate-100 px-4 py-10 text-slate-950 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_28%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(241,245,249,0.98))]" />

      <div className="relative mx-auto max-w-6xl space-y-10">
        <header className="mx-auto max-w-3xl space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            TTAttendance
          </p>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Närvarorapportering för pingistävlingar
            </h1>
            <p className="text-base leading-7 text-slate-600 sm:text-lg">
              Logga in med den pin-kod som skickats med i tävlingsprogrammet
            </p>
          </div>
        </header>

        {competitions.length === 0 ? (
          <section className="mx-auto max-w-2xl rounded-[28px] border border-dashed border-slate-300 bg-white/80 p-8 text-center shadow-[0_24px_60px_-32px_rgba(15,23,42,0.2)]">
            <h2 className="text-2xl font-semibold text-slate-900">Inga tävlingar upplagda</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Lägg upp en tävling i superadminvyn innan spelare eller sekretariat loggar in.
            </p>
          </section>
        ) : (
          <section
            data-testid="competition-entry-list"
            className="grid gap-6 lg:grid-cols-2"
          >
            {competitions.map(competition => (
              <LandingEntryCard
                key={competition.slug}
                title={competition.name}
                description={formatCompetitionDateRange(
                  competition.start_date,
                  competition.end_date
                )}
                href={`/${competition.slug}`}
                testId={`competition-entry-card-${competition.slug}`}
                hrefTestId={`competition-entry-link-${competition.slug}`}
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