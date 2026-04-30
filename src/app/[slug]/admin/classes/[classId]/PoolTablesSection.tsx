'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatPoolTables, parsePoolTables } from '@/lib/pool-tables'

type SavedPool = { poolNumber: number; tables: number[] }

type PoolTablesSectionProps = {
  slug: string
  classId: string
}

export default function PoolTablesSection({ slug, classId }: PoolTablesSectionProps) {
  const router = useRouter()
  const [pools, setPools] = useState<SavedPool[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [inputs, setInputs] = useState<Record<number, string>>({})
  const [perPoolErrors, setPerPoolErrors] = useState<Record<number, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchPools = useCallback(async () => {
    setLoadError(null)

    try {
      const res = await fetch(`/api/admin/classes/${classId}/pool-tables`, {
        cache: 'no-store',
        headers: { 'x-competition-slug': slug },
      })

      if (res.status === 401) {
        router.push(`/${slug}/admin`)
        return
      }

      if (!res.ok) {
        setLoadError('Kunde inte hämta bordstilldelningar')
        return
      }

      const payload = await res.json() as { pools: SavedPool[] }
      setPools(payload.pools)

      if (payload.pools.length > 0 && payload.pools.every(p => p.tables.length === 0)) {
        const initial: Record<number, string> = {}
        for (const pool of payload.pools) {
          initial[pool.poolNumber] = ''
        }
        setInputs(initial)
        setEditing(true)
      }
    } catch {
      setLoadError('Nätverksfel')
    }
  }, [classId, slug, router])

  useEffect(() => {
    void fetchPools()
  }, [fetchPools])

  function startEditing() {
    if (!pools) return
    const initial: Record<number, string> = {}
    for (const pool of pools) {
      initial[pool.poolNumber] = formatPoolTables(pool.tables)
    }
    setInputs(initial)
    setPerPoolErrors({})
    setSaveError(null)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setInputs({})
    setPerPoolErrors({})
    setSaveError(null)
  }

  async function save() {
    if (!pools || saving) return

    const nextErrors: Record<number, string> = {}
    const normalized: Array<{ poolNumber: number; tables: number[] }> = []
    for (const pool of pools) {
      const raw = inputs[pool.poolNumber] ?? ''
      const parsed = parsePoolTables(raw)
      if (!parsed.ok) {
        nextErrors[pool.poolNumber] = parsed.error
        continue
      }
      normalized.push({ poolNumber: pool.poolNumber, tables: parsed.tables })
    }

    if (Object.keys(nextErrors).length > 0) {
      setPerPoolErrors(nextErrors)
      return
    }

    setPerPoolErrors({})
    setSaving(true)
    setSaveError(null)

    try {
      const res = await fetch(`/api/admin/classes/${classId}/pool-tables`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-competition-slug': slug,
        },
        body: JSON.stringify({ pools: normalized }),
      })

      if (res.status === 401) {
        router.push(`/${slug}/admin`)
        return
      }

      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        setSaveError(payload?.error ?? 'Kunde inte spara')
        return
      }

      setPools((payload as { pools: SavedPool[] }).pools)
      setEditing(false)
      setInputs({})
    } catch {
      setSaveError('Nätverksfel')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      id="pool-tables"
      data-testid="pool-tables-section"
      className="app-card scroll-mt-6 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-ink">Bord per pool</h2>
          <p className="text-sm text-muted">
            Ange vilka bord respektive pool spelas på.
          </p>
        </div>
        {pools && pools.length > 0 && !editing && (
          <button
            data-testid="pool-tables-edit-btn"
            onClick={startEditing}
            className="app-button-secondary min-h-10 px-4 py-2 text-sm"
          >
            Ändra
          </button>
        )}
      </div>

      {loadError && (
        <p data-testid="pool-tables-load-error" className="app-banner-error">
          {loadError}
        </p>
      )}

      {!loadError && pools === null && (
        <p className="text-sm text-muted">Laddar...</p>
      )}

      {!loadError && pools !== null && pools.length === 0 && (
        <p data-testid="pool-tables-empty-state" className="text-sm text-muted">
          Pooler dyker upp här när lottningen är synkad från OnData.
        </p>
      )}

      {!loadError && pools !== null && pools.length > 0 && !editing && (
        <>
          <ul data-testid="pool-tables-list" className="space-y-2">
            {pools.map(pool => (
              <li
                key={pool.poolNumber}
                data-testid={`pool-tables-row-${pool.poolNumber}`}
                className="grid grid-cols-[5rem_1fr] items-center gap-3 text-sm"
              >
                <span className="font-medium text-ink">Pool {pool.poolNumber}</span>
                <span className="text-ink">
                  {pool.tables.length > 0 ? `Bord ${formatPoolTables(pool.tables)}` : '—'}
                </span>
              </li>
            ))}
          </ul>
          {pools.every(pool => pool.tables.length === 0) && (
            <button
              data-testid="pool-tables-set-btn"
              onClick={startEditing}
              className="text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-hover"
            >
              Sätt bord →
            </button>
          )}
        </>
      )}

      {!loadError && pools !== null && pools.length > 0 && editing && (
        <div className="space-y-3">
          <ul className="space-y-2">
            {pools.map(pool => {
              const value = inputs[pool.poolNumber] ?? ''
              const error = perPoolErrors[pool.poolNumber]
              return (
                <li
                  key={pool.poolNumber}
                  className="space-y-1"
                >
                  <div className="grid grid-cols-[5rem_1fr] items-center gap-3 text-sm">
                    <label
                      htmlFor={`pool-tables-input-${pool.poolNumber}`}
                      className="font-medium text-ink"
                    >
                      Pool {pool.poolNumber}
                    </label>
                    <input
                      id={`pool-tables-input-${pool.poolNumber}`}
                      data-testid={`pool-tables-input-${pool.poolNumber}`}
                      type="text"
                      inputMode="numeric"
                      value={value}
                      onChange={event => {
                        const nextValue = event.target.value
                        setInputs(prev => ({ ...prev, [pool.poolNumber]: nextValue }))
                        if (perPoolErrors[pool.poolNumber]) {
                          setPerPoolErrors(prev => {
                            const next = { ...prev }
                            delete next[pool.poolNumber]
                            return next
                          })
                        }
                      }}
                      placeholder="t.ex. 1, 2"
                      className="min-h-10 w-full rounded-xl border border-stone-300 bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                    />
                  </div>
                  {error && (
                    <p
                      data-testid={`pool-tables-error-${pool.poolNumber}`}
                      className="pl-[5.75rem] text-xs text-red-700"
                    >
                      {error}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>

          {saveError && (
            <p data-testid="pool-tables-save-error" className="app-banner-error">
              {saveError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              data-testid="pool-tables-save-btn"
              onClick={save}
              disabled={saving}
              className="min-h-10 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-hover disabled:opacity-60"
            >
              Spara
            </button>
            <button
              data-testid="pool-tables-cancel-btn"
              onClick={cancelEditing}
              disabled={saving}
              className="app-button-secondary min-h-10 px-4 py-2 text-sm"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

    </section>
  )
}
