import Link from 'next/link'

type LandingEntryCardProps = {
  eyebrow?: string
  title: string
  description?: string
  href?: string
  testId: string
  hrefTestId?: string
}

export default function LandingEntryCard({
  eyebrow,
  title,
  description,
  href,
  testId,
  hrefTestId,
}: LandingEntryCardProps) {
  const isLinkedCard = Boolean(href && hrefTestId)

  const content = (
    <>
      <div className="space-y-4">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h2>
          {description ? <p className="text-sm leading-6 text-muted sm:text-base">{description}</p> : null}
        </div>
      </div>
      {isLinkedCard ? (
        <div className="pt-2 text-sm font-semibold text-brand transition-colors duration-150 group-hover:text-brand-hover group-focus-visible:text-brand-hover">
          Till tävlingen →
        </div>
      ) : null}
    </>
  )

  if (href && hrefTestId) {
    return (
      <Link
        href={href}
        data-testid={hrefTestId}
        aria-label={`${title}, till tävlingen`}
        className="group block rounded-3xl focus-visible:outline-none"
      >
        <article
          data-testid={testId}
          className="app-card relative cursor-pointer overflow-hidden transition-all duration-150 group-hover:-translate-y-0.5 group-hover:border-brand/25 group-hover:shadow-glow group-focus-visible:-translate-y-0.5 group-focus-visible:border-brand/40 group-focus-visible:shadow-glow"
        >
          <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-brand/10 blur-3xl" />
          <div className="relative z-10 space-y-4">{content}</div>
        </article>
      </Link>
    )
  }

  return (
    <article
      data-testid={testId}
      className="app-card relative overflow-hidden"
    >
      <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative z-10 space-y-4">{content}</div>
    </article>
  )
}