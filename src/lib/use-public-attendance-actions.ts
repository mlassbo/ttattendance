'use client'

import { useState } from 'react'
import { getAttendanceNotOpenMessage } from './attendance-window'

type BaseAttendanceAction =
  | { type: 'submit'; registrationId: string; status: 'confirmed' | 'absent' }
  | { type: 'reset'; registrationId: string }

export function usePublicAttendanceActions<TAction extends BaseAttendanceAction>({
  onApplySuccess,
}: {
  onApplySuccess: (action: TAction, reportedAt: string) => void
}) {
  const [actionError, setActionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)

  async function handleAttendanceAction(action: TAction) {
    setActionError(null)
    setSubmitting(action.registrationId)

    try {
      const res = await fetch('/api/attendance', {
        method: action.type === 'submit' ? 'POST' : 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body:
          action.type === 'submit'
            ? JSON.stringify({
                registrationId: action.registrationId,
                status: action.status,
                idempotencyKey: `${action.registrationId}:${action.status}`,
              })
            : JSON.stringify({ registrationId: action.registrationId }),
      })

      if (res.ok) {
        onApplySuccess(action, new Date().toISOString())
        return
      }

      const payload = await res.json().catch(() => null)
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
    handleAttendanceAction,
    submitting,
  }
}
