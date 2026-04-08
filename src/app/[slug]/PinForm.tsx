'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PinLoginCard from '@/components/PinLoginCard'
import { PUBLIC_ATTENDANCE_UNLOCK_KEY_PREFIX } from '@/lib/public-attendance-ui'

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
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(`${PUBLIC_ATTENDANCE_UNLOCK_KEY_PREFIX}${slug}`, 'true')
        }

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
    <PinLoginCard
      eyebrow="Spelare"
      title={competitionName}
      description="Logga in som spelare för att anmäla närvaro"
      inputPlaceholder="PIN-kod"
      pin={pin}
      onPinChange={setPin}
      onSubmit={handleSubmit}
      inputTestId="pin-input"
      errorTestId="pin-error"
      buttonTestId="login-button"
      error={error}
      loading={loading}
      disabled={loading || pin.length === 0}
    />
  )
}
