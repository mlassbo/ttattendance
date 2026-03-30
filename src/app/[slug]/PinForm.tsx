'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function PinForm({
  slug,
  competitionName,
}: {
  slug: string
  competitionName: string
}) {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/auth/${slug}/player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      if (res.ok) {
        router.push(`/${slug}/search`)
      } else {
        const data = await res.json()
        setError(data.error ?? 'Fel PIN-kod')
      }
    } catch {
      setError('Nätverksfel, försök igen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-lg shadow-md p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{competitionName}</h1>
        <p className="text-gray-500 mb-6 text-sm">Ange PIN-kod för att fortsätta</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            data-testid="pin-input"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="PIN-kod"
            className="w-full border border-gray-300 rounded-md px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          {error && (
            <p data-testid="pin-error" className="text-red-600 text-sm">
              {error}
            </p>
          )}
          <button
            data-testid="login-button"
            type="submit"
            disabled={loading || pin.length === 0}
            className="w-full bg-blue-600 text-white rounded-md py-3 font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loggar in...' : 'Logga in'}
          </button>
        </form>
      </div>
    </div>
  )
}
