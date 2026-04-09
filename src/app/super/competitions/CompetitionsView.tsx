'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Competition = {
  id: string
  name: string
  slug: string
  importedRegistrationCount: number
  playerPin: string | null
  adminPin: string | null
}

const emptyForm = {
  name: '',
  slug: '',
  playerPin: '',
  adminPin: '',
}

export default function CompetitionsView() {
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [loadingCompetitions, setLoadingCompetitions] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [deletingCompetitionId, setDeletingCompetitionId] = useState<string | null>(null)
  const [competitionPendingDeletion, setCompetitionPendingDeletion] = useState<Competition | null>(null)

  async function load() {
    setLoadingCompetitions(true)
    setLoadError('')

    try {
      const res = await fetch('/api/super/competitions')

      if (res.ok) {
        setCompetitions(await res.json())
      } else {
        setLoadError('Kunde inte hämta tävlingarna')
      }
    } catch {
      setLoadError('Nätverksfel när tävlingarna hämtades')
    } finally {
      setLoadingCompetitions(false)
    }
  }

  useEffect(() => { void load() }, [])

  useEffect(() => {
    if (!competitionPendingDeletion || deletingCompetitionId) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setCompetitionPendingDeletion(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [competitionPendingDeletion, deletingCompetitionId])

  function field(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

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
      setFormError(data.error ?? 'Något gick fel')
    }
  }

  function requestDelete(competition: Competition) {
    setActionError('')
    setCompetitionPendingDeletion(competition)
  }

  function closeDeleteDialog() {
    if (deletingCompetitionId) {
      return
    }

    setCompetitionPendingDeletion(null)
  }

  async function confirmDelete() {
    if (!competitionPendingDeletion) {
      return
    }

    setActionError('')
    setDeletingCompetitionId(competitionPendingDeletion.id)

    try {
      const res = await fetch(`/api/super/competitions/${competitionPendingDeletion.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setCompetitions(current => current.filter(currentCompetition => currentCompetition.id !== competitionPendingDeletion.id))
        setCompetitionPendingDeletion(null)
        return
      }

      const data = await res.json().catch(() => null)
      setActionError(data?.error ?? 'Kunde inte ta bort tävlingen')
    } finally {
      setDeletingCompetitionId(null)
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
              Skapa tävlingar, kontrollera inloggningskoder, öppna OnData-integrationen och rensa bort gamla tävlingar.
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
            <p className="text-sm text-muted">Tävlingsdatum sätts automatiskt från klassernas starttider vid import.</p>
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
            {formError && <p data-testid="form-error" className="app-banner-error">{formError}</p>}
            <button
              type="submit"
              data-testid="submit-competition"
              className="app-button-primary"
            >
              Skapa tävling
            </button>
          </form>
        )}

        {loadError && <p data-testid="competition-load-error" className="app-banner-error">{loadError}</p>}

        {actionError && <p data-testid="competition-action-error" className="app-banner-error">{actionError}</p>}

        {competitionPendingDeletion && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-dialog-title"
              data-testid="delete-dialog"
              className="app-card relative w-full max-w-lg overflow-hidden"
            >
              <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-brand/10 blur-3xl" />
              <div className="relative space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-700">Ta bort tävling</p>
                  <h2 id="delete-dialog-title" className="text-2xl font-semibold tracking-tight text-ink">
                    Ta bort {competitionPendingDeletion.name}?
                  </h2>
                  <p data-testid="delete-dialog-message" className="text-sm leading-6 text-muted">
                    Tävlingen raderas permanent tillsammans med importerade spelare, klasser och närvarosvar.
                  </p>
                </div>

                <div className="app-banner-warning">
                  Detta går inte att ångra. Använd bara detta för gamla eller felaktiga tävlingar.
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    data-testid="delete-dialog-cancel"
                    onClick={closeDeleteDialog}
                    disabled={Boolean(deletingCompetitionId)}
                    className="app-button-secondary"
                  >
                    Avbryt
                  </button>
                  <button
                    type="button"
                    data-testid="delete-dialog-confirm"
                    onClick={confirmDelete}
                    disabled={Boolean(deletingCompetitionId)}
                    className="app-button-primary bg-red-600 hover:bg-red-700 active:bg-red-800"
                  >
                    {deletingCompetitionId ? 'Tar bort...' : 'Ta bort permanent'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {loadingCompetitions && competitions.length === 0 && (
          <section
            data-testid="competition-list-loading"
            aria-live="polite"
            className="app-card flex items-center justify-center gap-3 py-10 text-sm text-muted"
          >
            <span
              aria-hidden="true"
              className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-brand"
            />
            Laddar tävlingar...
          </section>
        )}

        {!loadingCompetitions && competitions.length === 0 && !loadError && (
          <section className="app-card py-8 text-sm text-muted">
            Inga tävlingar har skapats än.
          </section>
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
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Link
                      href={`/super/competitions/${c.id}/integration`}
                      data-testid={`integration-action-${c.slug}`}
                      className="app-button-secondary min-h-10 h-fit px-4 py-2"
                    >
                      OnData-integration
                    </Link>
                    <button
                      type="button"
                      data-testid={`delete-action-${c.slug}`}
                      onClick={() => requestDelete(c)}
                      disabled={Boolean(deletingCompetitionId)}
                      className="app-button-secondary min-h-10 h-fit border-red-200 px-4 py-2 text-red-700 hover:border-red-300 hover:bg-red-50"
                    >
                      {deletingCompetitionId === c.id ? 'Tar bort...' : 'Ta bort'}
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}