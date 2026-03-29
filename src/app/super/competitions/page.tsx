'use client'

import { useState, useEffect } from 'react'

type Competition = {
  id: string
  name: string
  slug: string
  start_date: string
  end_date: string
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
    <main className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Tävlingar</h1>
        <button
          data-testid="new-competition-button"
          onClick={() => setShowForm(v => !v)}
          className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700"
        >
          Ny tävling
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 mb-8 border rounded p-4 bg-gray-50"
        >
          <input
            data-testid="field-name"
            placeholder="Namn"
            value={form.name}
            onChange={field('name')}
            required
            className="border rounded px-3 py-2"
          />
          <input
            data-testid="field-slug"
            placeholder="Slug (t.ex. smd-2025)"
            value={form.slug}
            onChange={field('slug')}
            required
            className="border rounded px-3 py-2"
          />
          <input
            data-testid="field-start-date"
            type="date"
            value={form.startDate}
            onChange={field('startDate')}
            required
            className="border rounded px-3 py-2"
          />
          <input
            data-testid="field-end-date"
            type="date"
            value={form.endDate}
            onChange={field('endDate')}
            required
            className="border rounded px-3 py-2"
          />
          <input
            data-testid="field-player-pin"
            type="password"
            placeholder="Spelar-PIN"
            value={form.playerPin}
            onChange={field('playerPin')}
            required
            className="border rounded px-3 py-2"
          />
          <input
            data-testid="field-admin-pin"
            type="password"
            placeholder="Admin-PIN"
            value={form.adminPin}
            onChange={field('adminPin')}
            required
            className="border rounded px-3 py-2"
          />
          {error && (
            <p data-testid="form-error" className="text-red-600 text-sm">
              {error}
            </p>
          )}
          <button
            type="submit"
            data-testid="submit-competition"
            className="bg-green-600 text-white rounded px-4 py-2 hover:bg-green-700"
          >
            Skapa tävling
          </button>
        </form>
      )}

      <ul data-testid="competition-list" className="flex flex-col gap-2">
        {competitions.map(c => (
          <li key={c.id} data-testid="competition-item" className="border rounded p-4 bg-white">
            <p className="font-medium">{c.name}</p>
            <p className="text-sm text-gray-500">{c.slug}</p>
          </li>
        ))}
      </ul>
    </main>
  )
}
