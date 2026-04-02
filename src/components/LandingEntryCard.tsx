import Link from 'next/link'

type LandingAction = {
  href: string
  label: string
  testId: string
}

type LandingEntryCardProps = {
  eyebrow?: string
  title: string
  description?: string
  href?: string
  testId: string
  hrefTestId?: string
  actions?: LandingAction[]
}

export default function LandingEntryCard({
  eyebrow,
  title,
  description,
  href,
  testId,
  hrefTestId,
  actions = [],
}: LandingEntryCardProps) {
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

      {actions.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {actions.map((action, index) => (
            <Link
              key={action.testId}
              href={action.href}
              data-testid={action.testId}
              className={`relative z-10 ${index === 0 ? 'app-button-primary' : 'app-button-secondary'} w-full`}
            >
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </>
  )

  if (href && hrefTestId && actions.length === 0) {
    return (
      <Link
        href={href}
        data-testid={hrefTestId}
        aria-label={title}
        className="group block focus-visible:outline-none"
      >
        <article
          data-testid={testId}
          className="app-card relative overflow-hidden transition-all duration-150 group-hover:-translate-y-0.5 group-hover:border-brand/25 group-hover:shadow-glow group-focus-visible:border-brand/40"
        >
          <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-brand/10 blur-3xl" />
          <div className="space-y-4">{content}</div>
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
      {href && hrefTestId && actions.length === 0 ? (
        <Link
          href={href}
          data-testid={hrefTestId}
          aria-label={title}
          className="absolute inset-0 rounded-[28px]"
        />
      ) : null}

      <div className="relative z-10 space-y-4">{content}</div>
    </article>
  )
}