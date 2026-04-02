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
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 px-4 py-10"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_32%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(241,245,249,0.98))]" />

      <div
        data-testid="pin-login-card"
        className="relative w-full max-w-md rounded-[28px] border border-slate-200/80 bg-white/95 p-8 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.35)] backdrop-blur sm:p-10"
      >
        <div className="mb-8 space-y-3">
          <p
            data-testid="pin-login-eyebrow"
            className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500"
          >
            {eyebrow}
          </p>
          <div className="space-y-2">
            <h1
              data-testid="pin-login-title"
              className="text-3xl font-semibold tracking-tight text-slate-950"
            >
              {title}
            </h1>
            <p
              data-testid="pin-login-description"
              className="text-sm leading-6 text-slate-600"
            >
              {description}
            </p>
          </div>
        </div>

        <form data-testid="pin-login-form" onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <input
              data-testid={inputTestId}
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={event => onPinChange(event.target.value)}
              placeholder={inputPlaceholder}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-center text-lg tracking-[0.35em] text-slate-950 outline-none transition placeholder:text-center placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              autoFocus
            />
          </label>

          {error && (
            <p
              data-testid={errorTestId}
              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {error}
            </p>
          )}

          <button
            data-testid={buttonTestId}
            type="submit"
            disabled={disabled}
            className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading ? loadingLabel : submitLabel}
          </button>
        </form>
      </div>
    </main>
  )
}
