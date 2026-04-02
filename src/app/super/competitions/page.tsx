'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'

type Competition = {
  id: string
  name: string
  slug: string
  start_date: string
  end_date: string
  importedRegistrationCount: number
  playerPin: string | null
  adminPin: string | null
}

const emptyForm = {
  name: '',
  slug: '',
  startDate: '',
  endDate: '',
  playerPin: '',
  adminPin: '',
}

export default function CompetitionsPage() {
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  async function load() {
    const res = await fetch('/api/super/competitions')
    if (res.ok) setCompetitions(await res.json())
  }

  useEffect(() => { load() }, [])

  function field(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const res = await fetch('/api/super/competitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (res.ok) {
      setForm(emptyForm)
      setShowForm(false)
      await load()
    } else {
      const data = await res.json()
      setError(data.error ?? 'Något gick fel')
    }
  }

  return (
    <main className="app-shell">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="app-card flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Superadmin</p>
            <h1 className="text-3xl font-semibold tracking-tight text-ink">Tävlingar</h1>
            <p className="text-sm leading-6 text-muted">
              Skapa tävlingar, kontrollera inloggningskoder och gå vidare till importen.
            </p>
          </div>
          <button
            data-testid="new-competition-button"
            onClick={() => setShowForm(v => !v)}
            className="app-button-primary w-full sm:w-auto"
          >
            Ny tävling
          </button>
        </section>

        {showForm && (
          <form onSubmit={handleSubmit} className="app-card flex flex-col gap-3">
            <input
              data-testid="field-name"
              placeholder="Namn"
              value={form.name}
              onChange={field('name')}
              required
              className="app-input"
            />
            <input
              data-testid="field-slug"
              placeholder="Slug (t.ex. smd-2025)"
              value={form.slug}
              onChange={field('slug')}
              required
              className="app-input"
            />
            <input
              data-testid="field-start-date"
              type="date"
              value={form.startDate}
              onChange={field('startDate')}
              required
              className="app-input"
            />
            <input
              data-testid="field-end-date"
              type="date"
              value={form.endDate}
              onChange={field('endDate')}
              required
              className="app-input"
            />
            <input
              data-testid="field-player-pin"
              type="password"
              placeholder="Spelar-PIN"
              value={form.playerPin}
              onChange={field('playerPin')}
              required
              className="app-input"
            />
            <input
              data-testid="field-admin-pin"
              type="password"
              placeholder="Admin-PIN"
              value={form.adminPin}
              onChange={field('adminPin')}
              required
              className="app-input"
            />
            {error && <p data-testid="form-error" className="app-banner-error">{error}</p>}
            <button
              type="submit"
              data-testid="submit-competition"
              className="app-button-primary"
            >
              Skapa tävling
            </button>
          </form>
        )}

        <ul data-testid="competition-list" className="flex flex-col gap-3">
          {competitions.map(c => (
            <li key={c.id} data-testid="competition-item" className="app-card">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-3">
                  <div>
                    <p className="text-lg font-semibold text-ink">{c.name}</p>
                    <p className="text-sm text-muted">{c.slug}</p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted">Spelar-PIN</p>
                      <p data-testid={`player-pin-${c.slug}`} className="font-mono text-sm text-ink">
                        {c.playerPin ?? 'Saknas'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted">Admin-PIN</p>
                      <p data-testid={`admin-pin-${c.slug}`} className="font-mono text-sm text-ink">
                        {c.adminPin ?? 'Saknas'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-start gap-2 md:items-end">
                  <span data-testid={`import-status-${c.slug}`} className="app-pill-muted">
                    {c.importedRegistrationCount} importerade anmälningar
                  </span>
                  <Link
                    href={`/super/competitions/${c.id}/import`}
                    data-testid={`import-action-${c.slug}`}
                    className="app-button-secondary min-h-10 h-fit px-4 py-2"
                  >
                    Importera startlista
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
