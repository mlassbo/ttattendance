'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

const VENUE_TABLE_COUNT_SAVE_DELAY_MS = 450

type SaveStatus = {
  state: 'saving' | 'saved' | 'error'
  message?: string
}

export default function VenueSettingsView({
  competitionId,
  initialVenueTableCount,
}: {
  competitionId: string
  initialVenueTableCount: number | null
}) {
  const [draft, setDraft] = useState<string>(
    initialVenueTableCount === null ? '' : String(initialVenueTableCount),
  )
  const [saved, setSaved] = useState<number | null>(initialVenueTableCount)
  const [status, setStatus] = useState<SaveStatus | null>(null)
  const saveTimer = useRef<number | null>(null)
  const saveInFlight = useRef<boolean>(false)
  const pendingValue = useRef<string | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current)
      }
    }
  }, [])

  async function save(rawValue: string) {
    const trimmed = rawValue.trim()
    let parsed: number | null = null

    if (trimmed !== '') {
      const value = Number(trimmed)
      if (!Number.isInteger(value) || value <= 0) {
        setStatus({
          state: 'error',
          message: 'Antal bord måste vara ett positivt heltal',
        })
        return
      }
      parsed = value
    }

    if (parsed === saved) {
      setStatus(null)
      return
    }

    setStatus({ state: 'saving' })

    try {
      const res = await fetch(`/api/super/competitions/${competitionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueTableCount: parsed }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setStatus({
          state: 'error',
          message: data?.error ?? 'Kunde inte spara',
        })
        return
      }

      setSaved(parsed)
      setStatus({ state: 'saved' })
    } catch {
      setStatus({ state: 'error', message: 'Nätverksfel' })
    }
  }

  async function requestSave(rawValue: string) {
    if (saveInFlight.current) {
      pendingValue.current = rawValue
      setStatus({ state: 'saving' })
      return
    }

    saveInFlight.current = true

    try {
      await save(rawValue)
    } finally {
      saveInFlight.current = false

      const next = pendingValue.current
      if (next !== undefined && next !== rawValue) {
        pendingValue.current = undefined
        await requestSave(next)
        return
      }

      pendingValue.current = undefined
    }
  }

  function queueSave(rawValue: string) {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
    }

    saveTimer.current = window.setTimeout(() => {
      void requestSave(rawValue)
      saveTimer.current = null
    }, VENUE_TABLE_COUNT_SAVE_DELAY_MS)
  }

  function flushSave() {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    void requestSave(draft)
  }

  function resetDraft() {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    setDraft(saved === null ? '' : String(saved))
    setStatus(null)
  }

  return (
    <section className="app-card space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Hallen</h2>
        <p className="text-sm text-muted">
          Inställningar för hallen där tävlingen spelas.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="venue-table-count-input"
          className="text-xs font-semibold uppercase tracking-[0.18em] text-muted"
        >
          Antal bord i hallen
        </label>
        <input
          id="venue-table-count-input"
          data-testid="venue-table-count-input"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={draft}
          placeholder="T.ex. 22"
          onChange={event => {
            const nextValue = event.target.value
            setDraft(nextValue)
            setStatus(null)
            queueSave(nextValue)
          }}
          onBlur={() => flushSave()}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              flushSave()
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              resetDraft()
            }
          }}
          className="app-input w-full max-w-[180px] py-2 text-sm tabular-nums"
        />
        <p className="text-xs text-muted">
          Används av sekretariatet för att se hur många bord som är lediga inför att en klass startas.
        </p>
        {status?.state === 'error' && (
          <p data-testid="venue-table-count-error" className="text-xs text-red-600">
            {status.message}
          </p>
        )}
      </div>
    </section>
  )
}
