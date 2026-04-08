'use client'

type PublicAttendancePinModalProps = {
  open: boolean
  pin: string
  onPinChange: (value: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  error: string
  loading: boolean
  submitLabel: string
}

export default function PublicAttendancePinModal({
  open,
  pin,
  onPinChange,
  onSubmit,
  onCancel,
  error,
  loading,
  submitLabel,
}: PublicAttendancePinModalProps) {
  if (!open) {
    return null
  }

  return (
    <div
      data-testid="public-pin-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4 py-6 backdrop-blur-sm"
    >
      <div className="app-card relative w-full max-w-md space-y-5">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Ange PIN-kod</h2>
          <p className="text-sm leading-6 text-muted">
            PIN-koden ska ha skickats ut av arrangerande klubb och behövs bara första gången du rapporterar närvaro i den här webbläsaren.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            data-testid="public-pin-input"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={event => onPinChange(event.target.value)}
            placeholder="PIN-kod"
            className="app-input rounded-2xl text-center text-lg tracking-[0.35em] placeholder:text-center placeholder:text-base placeholder:font-normal placeholder:tracking-normal"
            autoFocus
          />

          {error ? (
            <p data-testid="public-pin-error" className="app-banner-error">
              {error}
            </p>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              data-testid="public-pin-submit"
              type="submit"
              disabled={loading || pin.length === 0}
              className="app-button-primary w-full"
            >
              {loading ? 'Kontrollerar...' : submitLabel}
            </button>
            <button
              data-testid="public-pin-cancel"
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="app-button-secondary w-full"
            >
              Avbryt
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}