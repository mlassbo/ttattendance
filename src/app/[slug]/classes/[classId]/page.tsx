import Link from 'next/link'
import PublicClassContentTabs from '@/components/PublicClassContentTabs'
import type { PublicSearchClass } from '@/lib/public-competition'
import {
  getClassLiveData,
  getPublicClassDetails,
  getPublicCompetitionBySlug,
} from '@/lib/public-competition'
import { formatSwedishDateTime, getClassAttendanceOpensAt } from '@/lib/attendance-window'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function ClassAvailabilityBadge({ classDetails }: { classDetails: PublicSearchClass }) {
  if (classDetails.maxPlayers == null) {
    return null
  }

  const spotsLeft = classDetails.maxPlayers - classDetails.playerCount

  if (classDetails.playerCount < classDetails.maxPlayers && spotsLeft > 2) {
    return <span className="app-pill-warning">{spotsLeft} platser kvar</span>
  }

  if (classDetails.playerCount < classDetails.maxPlayers && spotsLeft === 1) {
    return <span className="app-pill-warning">1 plats kvar</span>
  }

  if (classDetails.playerCount < classDetails.maxPlayers && spotsLeft === 2) {
    return <span className="app-pill-warning">2 platser kvar</span>
  }

  return <span className="app-pill-muted">Fullt</span>
}

export default async function PublicClassPage({
  params,
  searchParams,
}: {
  params: { slug: string; classId: string }
  searchParams?: { returnTo?: string }
}) {
  const { slug, classId } = params
  const requestedReturnTo = searchParams?.returnTo
  const backHref = requestedReturnTo?.startsWith(`/${slug}/`)
    ? requestedReturnTo
    : `/${slug}`
  const fallbackBackLabel = backHref === `/${slug}` ? 'Tillbaka till startsidan' : 'Tillbaka till sök'
  const supabase = createServerClient()

  try {
    const competition = await getPublicCompetitionBySlug(supabase, slug)

    if (!competition) {
      return (
        <div className="app-shell flex items-center justify-center">
          <p className="text-muted">Tävlingen hittades inte.</p>
        </div>
      )
    }

    const [classDetails, liveData] = await Promise.all([
      getPublicClassDetails(supabase, competition.id, classId),
      getClassLiveData(supabase, competition.id, classId),
    ])

    if (!classDetails) {
      return (
        <div className="app-shell flex items-center justify-center">
          <p className="text-muted">Klassen hittades inte.</p>
        </div>
      )
    }

    const showRegistrationStatusPills = !liveData

    return (
      <main className="app-shell">
        <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
          <section data-testid="class-page-header" className="app-card space-y-4">
            <Link
              href={backHref}
              data-testid="class-page-back-link"
              className="inline-flex w-fit text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-hover"
            >
              ← {backHref === `/${slug}` ? `Tillbaka till ${competition.name}` : 'Tillbaka till sök'}
            </Link>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                  {competition.name}
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-ink">
                  {classDetails.name}
                </h1>
                <p className="text-sm text-muted">
                  {classDetails.session?.name ?? 'Okänt pass'}
                  {classDetails.startTime ? ` · ${formatSwedishDateTime(classDetails.startTime)}` : ''}
                </p>
                {classDetails.startTime ? (
                  <p data-testid="class-page-attendance-opens" className="text-xs text-muted/80">
                    Närvarorapportering öppnar {formatSwedishDateTime(getClassAttendanceOpensAt(classDetails.startTime))}
                  </p>
                ) : null}
                {classDetails.attendanceDeadline ? (
                  <p data-testid="class-page-attendance-deadline" className="text-xs text-muted/80">
                    Anmäl närvaro senast {formatSwedishDateTime(classDetails.attendanceDeadline)}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col gap-2 text-left sm:items-end sm:self-end sm:text-right">
                <div className="text-sm font-medium text-muted">
                  {classDetails.playerCount} anmälda
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {liveData ? (
                    <span className="app-pill-success">Pooler lottade</span>
                  ) : null}
                  {showRegistrationStatusPills ? (
                    <span data-testid="class-page-availability">
                      <ClassAvailabilityBadge classDetails={classDetails} />
                    </span>
                  ) : null}
                  {showRegistrationStatusPills && classDetails.reserveList.length > 0 ? (
                    <span className="app-pill-muted whitespace-nowrap">
                      {classDetails.reserveList.length} på reservlistan
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <PublicClassContentTabs
            classDetails={classDetails}
            liveData={liveData}
            showRosterSummaryPills={false}
          />
        </div>
      </main>
    )
  } catch {
    return (
      <main className="app-shell">
        <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
          <section className="app-card">
            <Link
              href={backHref}
              className="inline-flex w-fit text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-hover"
            >
              ← {fallbackBackLabel}
            </Link>
          </section>

          <section className="app-banner-error">
            Det gick inte att läsa klassens uppgifter just nu. Försök igen.
          </section>
        </div>
      </main>
    )
  }
}
