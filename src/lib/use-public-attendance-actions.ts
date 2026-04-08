'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { getAttendanceNotOpenMessage } from './attendance-window'
import { PUBLIC_ATTENDANCE_UNLOCK_KEY_PREFIX } from './public-attendance-ui'

type BaseAttendanceAction =
  | { type: 'submit'; registrationId: string; status: 'confirmed' | 'absent' }
  | { type: 'reset'; registrationId: string }

export function usePublicAttendanceActions<TAction extends BaseAttendanceAction>({
  slug,
  onApplySuccess,
}: {
  slug: string
  onApplySuccess: (action: TAction, reportedAt: string) => void
}) {
  const [actionError, setActionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [unlockStateReady, setUnlockStateReady] = useState(false)
  const [pendingAction, setPendingAction] = useState<TAction | null>(null)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    setIsUnlocked(
      window.sessionStorage.getItem(`${PUBLIC_ATTENDANCE_UNLOCK_KEY_PREFIX}${slug}`) === 'true',
    )
    setUnlockStateReady(true)
  }, [slug])

  function resetPinState() {
    setPin('')
    setPinError('')
  }

  function closePinModal() {
    setPinModalOpen(false)
    setPendingAction(null)
    resetPinState()
  }

  function requestUnlock(action: TAction) {
    setPendingAction(action)
    resetPinState()
    setPinModalOpen(true)
  }

  async function authenticatePin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPinLoading(true)
    setPinError('')

    try {
      const res = await fetch(`/api/auth/${slug}/player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        setPinError(payload?.error ?? 'Fel PIN-kod')
        return
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(`${PUBLIC_ATTENDANCE_UNLOCK_KEY_PREFIX}${slug}`, 'true')
      }

      setIsUnlocked(true)
      setPinModalOpen(false)
      resetPinState()

      if (pendingAction) {
        const action = pendingAction
        setPendingAction(null)
        await executeAttendanceAction(action)
      }
    } catch {
      setPinError('Nätverksfel, försök igen')
    } finally {
      setPinLoading(false)
    }
  }

  async function handleAttendanceAction(action: TAction) {
    setActionError(null)

    if (!unlockStateReady) {
      return
    }

    if (!isUnlocked) {
      requestUnlock(action)
      return
    }

    await executeAttendanceAction(action)
  }

  async function executeAttendanceAction(action: TAction) {
    setSubmitting(action.registrationId)
    setActionError(null)

    try {
      const res = await fetch('/api/attendance', {
        method: action.type === 'submit' ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:
          action.type === 'submit'
            ? JSON.stringify({
                registrationId: action.registrationId,
                status: action.status,
                idempotencyKey: `${action.registrationId}:${action.status}`,
              })
            : JSON.stringify({ registrationId: action.registrationId }),
      })

      const payload = res.ok ? null : await res.json().catch(() => null)

      if (res.status === 401) {
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(`${PUBLIC_ATTENDANCE_UNLOCK_KEY_PREFIX}${slug}`)
        }

        setIsUnlocked(false)
        requestUnlock(action)
        return
      }

      if (res.ok) {
        onApplySuccess(action, new Date().toISOString())
        return
      }

      const message =
        payload?.code === 'competition_schedule_missing'
          ? 'Tävlingsschemat är inte importerat än.'
          : payload?.code === 'attendance_not_open' && payload?.opensAt
            ? getAttendanceNotOpenMessage(payload.opensAt)
            : payload?.error ?? 'Något gick fel. Försök igen.'

      setActionError(message)
    } catch {
      setActionError('Nätverksfel, försök igen')
    } finally {
      setSubmitting(null)
    }
  }

  return {
    actionError,
    authenticatePin,
    closePinModal,
    handleAttendanceAction,
    pendingAction,
    pin,
    pinError,
    pinLoading,
    pinModalOpen,
    setPin,
    submitting,
    unlockStateReady,
  }
}