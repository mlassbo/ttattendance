'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PinLoginCard from '@/components/PinLoginCard'

export default function SuperLoginPage() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/super', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      if (res.ok) {
        router.push('/super/competitions')
      } else {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Felaktig PIN')
      }
    } catch {
      setError('Nätverksfel, försök igen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PinLoginCard
      eyebrow="System"
      title="Superadmin"
      description="Logga in som superadmin för att hantera tävlingar"
      inputPlaceholder="PIN-kod"
      pin={pin}
      onPinChange={setPin}
      onSubmit={handleSubmit}
      inputTestId="pin-input"
      errorTestId="error-message"
      buttonTestId="login-button"
      error={error}
      loading={loading}
      disabled={loading || pin.length === 0}
    />
  )
}
