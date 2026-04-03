'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PinLoginCard from '@/components/PinLoginCard'

export default function AdminPinForm({
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
      const res = await fetch(`/api/auth/${slug}/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      if (res.ok) {
        router.push(`/${slug}/admin/dashboard`)
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
      eyebrow="Sekretariat"
      title={competitionName}
      description="Logga in som sekretariat"
      inputPlaceholder="PIN-kod"
      pin={pin}
      onPinChange={setPin}
      onSubmit={handleSubmit}
      inputTestId="admin-pin-input"
      errorTestId="admin-pin-error"
      buttonTestId="admin-login-button"
      error={error}
      loading={loading}
      disabled={loading || pin.length === 0}
    />
  )
}
