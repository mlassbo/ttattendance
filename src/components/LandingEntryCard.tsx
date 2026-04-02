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
      <div className="space-y-3">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
          {description ? <p className="text-sm leading-6 text-slate-600">{description}</p> : null}
        </div>
      </div>

      {actions.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {actions.map(action => (
            <Link
              key={action.testId}
              href={action.href}
              data-testid={action.testId}
              className="relative z-10 inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white"
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
        className="group block"
      >
        <article
          data-testid={testId}
          className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.35)] backdrop-blur transition group-hover:border-slate-300 group-hover:bg-white group-focus-visible:border-slate-400"
        >
          <div className="space-y-4">{content}</div>
        </article>
      </Link>
    )
  }

  return (
    <article
      data-testid={testId}
      className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.35)] backdrop-blur"
    >
      {href && hrefTestId ? (
        <Link
          href={href}
          data-testid={hrefTestId}
          aria-label={title}
          className="absolute inset-0 rounded-[28px]"
        />
      ) : null}

      <div className="relative space-y-4">{content}</div>
    </article>
  )
}