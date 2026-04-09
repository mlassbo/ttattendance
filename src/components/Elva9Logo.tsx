type Elva9LogoProps = {
  className?: string
}

export default function Elva9Logo({ className = '' }: Elva9LogoProps) {
  const classes = [
    'inline-flex items-baseline leading-none tracking-[-0.05em]',
    className,
  ].filter(Boolean).join(' ')

  return (
    <span aria-label="elva9.se" className={classes}>
      <span className="font-semibold text-brand">elva</span>
      <span className="font-bold text-ink">9</span>
      <span className="font-medium text-muted">.se</span>
    </span>
  )
}