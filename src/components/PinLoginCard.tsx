'use client'

import type { FormEventHandler } from 'react'

type PinLoginCardProps = {
  eyebrow: string
  title: string
  description: string
  inputPlaceholder: string
  pin: string
  onPinChange: (value: string) => void
  onSubmit: FormEventHandler<HTMLFormElement>
  inputTestId: string
  errorTestId: string
  buttonTestId: string
  error: string
  loading: boolean
  disabled?: boolean
  submitLabel?: string
  loadingLabel?: string
}

export default function PinLoginCard({
  eyebrow,
  title,
  description,
  inputPlaceholder,
  pin,
  onPinChange,
  onSubmit,
  inputTestId,
  errorTestId,
  buttonTestId,
  error,
  loading,
  disabled = false,
  submitLabel = 'Logga in',
  loadingLabel = 'Loggar in...',
}: PinLoginCardProps) {
  return (
    <main
      data-testid="pin-login-page"
      className="app-shell flex items-center justify-center"
    >
      <div
        data-testid="pin-login-card"
        className="app-card relative w-full max-w-md overflow-hidden p-6 sm:p-8"
      >
        <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-brand/10 blur-3xl" />

        <div className="relative mb-8 space-y-3">
          <p
            data-testid="pin-login-eyebrow"
            className="text-xs font-semibold uppercase tracking-[0.24em] text-muted"
          >
            {eyebrow}
          </p>
          <div className="space-y-2">
            <h1
              data-testid="pin-login-title"
              className="text-3xl font-semibold tracking-tight text-ink"
            >
              {title}
            </h1>
            <p
              data-testid="pin-login-description"
              className="text-sm leading-6 text-muted"
            >
              {description}
            </p>
          </div>
        </div>

        <form data-testid="pin-login-form" onSubmit={onSubmit} className="relative space-y-4">
          <label className="block">
            <input
              data-testid={inputTestId}
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={event => onPinChange(event.target.value)}
              placeholder={inputPlaceholder}
              className="app-input rounded-2xl text-center text-lg tracking-[0.35em] placeholder:text-center placeholder:text-base placeholder:font-normal placeholder:tracking-normal"
              autoFocus
            />
          </label>

          {error && (
            <p
              data-testid={errorTestId}
              className="app-banner-error"
            >
              {error}
            </p>
          )}

          <button
            data-testid={buttonTestId}
            type="submit"
            disabled={disabled}
            className="app-button-primary w-full rounded-2xl"
          >
            {loading ? loadingLabel : submitLabel}
          </button>
        </form>
      </div>
    </main>
  )
}
