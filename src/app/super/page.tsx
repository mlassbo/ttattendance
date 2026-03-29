'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SuperLoginPage() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const res = await fetch('/api/auth/super', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })

    if (res.ok) {
      router.push('/super/competitions')
    } else {
      setError('Felaktig PIN')
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 w-full max-w-xs bg-white p-8 rounded shadow"
      >
        <h1 className="text-xl font-semibold text-center">Super Admin</h1>
        <input
          type="password"
          data-testid="pin-input"
          value={pin}
          onChange={e => setPin(e.target.value)}
          placeholder="PIN"
          autoComplete="current-password"
          className="border rounded px-3 py-2 text-center tracking-widest"
        />
        {error && (
          <p data-testid="error-message" className="text-red-600 text-sm text-center">
            {error}
          </p>
        )}
        <button
          type="submit"
          data-testid="login-button"
          className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700"
        >
          Logga in
        </button>
      </form>
    </main>
  )
}
