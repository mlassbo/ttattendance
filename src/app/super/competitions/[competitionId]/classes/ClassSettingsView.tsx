'use client'

import { forwardRef, useEffect, useState, type InputHTMLAttributes } from 'react'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import DatePicker from 'react-datepicker'

type ClassData = {
  id: string
  name: string
  startTime: string
  attendanceDeadline: string
}

type SessionData = {
  id: string
  name: string
  date: string
  sessionOrder: number
  classes: ClassData[]
}

type EditingDeadline = {
  classId: string
  date: string
  time: string
}

const DeadlineInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function DeadlineInput(props, ref) {
    return <input ref={ref} {...props} />
  },
)

DeadlineInput.displayName = 'DeadlineInput'

function formatLocalDateTime(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Stockholm',
  }).format(d)
}

function formatSessionHeading(date: string, sessionName: string): string {
  const weekday = format(fromDateString(date), 'EEE', { locale: sv })
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} - ${sessionName}`
}

function toDateAndTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const stockholm = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Stockholm',
    hourCycle: 'h23',
  }).formatToParts(d)

  const parts = Object.fromEntries(stockholm.map(p => [p.type, p.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

function fromDateString(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function toDateString(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function fromTimeString(time: string): Date {
  const [hour, minute] = time.split(':').map(Number)
  return new Date(2000, 0, 1, hour, minute)
}

function toTimeString(date: Date): string {
  return format(date, 'HH:mm')
}

function fromDateAndTimeToIso(date: string, time: string): string {
  // date is e.g. "2025-03-15", time is e.g. "08:30" in Stockholm time
  const [datePart, timePart] = [date, time]
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)

  // Create a date assuming UTC, then adjust for Stockholm offset
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = formatter.formatToParts(utcGuess)
  const map = new Map(parts.map(p => [p.type, p.value]))
  const asUtc = Date.UTC(
    Number(map.get('year')),
    Number(map.get('month')) - 1,
    Number(map.get('day')),
    Number(map.get('hour')),
    Number(map.get('minute')),
    Number(map.get('second')),
  )
  const offsetMs = asUtc - utcGuess.getTime()
  return new Date(utcGuess.getTime() - offsetMs).toISOString()
}

export default function ClassSettingsView({ competitionId }: { competitionId: string }) {
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [editingDeadline, setEditingDeadline] = useState<EditingDeadline | null>(null)
  const [deadlineError, setDeadlineError] = useState('')
  const [savingDeadline, setSavingDeadline] = useState(false)
  const [sessionChangeError, setSessionChangeError] = useState<Record<string, string>>({})
  const [savingSession, setSavingSession] = useState<Record<string, boolean>>({})

  async function load() {
    setLoading(true)
    setLoadError('')

    try {
      const res = await fetch(`/api/super/competitions/${competitionId}/classes`)
      if (!res.ok) {
        setLoadError('Kunde inte hämta klasser.')
        return
      }
      const data = await res.json()
      setSessions(data as SessionData[])
    } catch {
      setLoadError('Nätverksfel när klasser hämtades.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [competitionId])

  function startEditDeadline(cls: ClassData) {
    setDeadlineError('')
    const { date, time } = toDateAndTime(cls.attendanceDeadline)
    setEditingDeadline({ classId: cls.id, date, time })
  }

  function cancelEditDeadline() {
    setEditingDeadline(null)
    setDeadlineError('')
  }

  async function saveDeadline(cls: ClassData) {
    if (!editingDeadline) return

    const newIso = fromDateAndTimeToIso(editingDeadline.date, editingDeadline.time)
    const startTime = new Date(cls.startTime)
    const newDeadline = new Date(newIso)

    if (newDeadline >= startTime) {
      setDeadlineError('Anmälningsstopp måste vara före starttiden')
      return
    }

    setSavingDeadline(true)
    setDeadlineError('')

    try {
      const res = await fetch(
        `/api/super/competitions/${competitionId}/classes/${cls.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attendanceDeadline: newIso }),
        },
      )

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setDeadlineError(data?.error ?? 'Kunde inte spara')
        return
      }

      // Update local state
      setSessions(prev =>
        prev.map(s => ({
          ...s,
          classes: s.classes.map(c =>
            c.id === cls.id ? { ...c, attendanceDeadline: newIso } : c,
          ),
        })),
      )
      setEditingDeadline(null)
    } catch {
      setDeadlineError('Nätverksfel')
    } finally {
      setSavingDeadline(false)
    }
  }

  async function changeSession(cls: ClassData, newSessionId: string) {
    setSavingSession(prev => ({ ...prev, [cls.id]: true }))
    setSessionChangeError(prev => ({ ...prev, [cls.id]: '' }))

    try {
      const res = await fetch(
        `/api/super/competitions/${competitionId}/classes/${cls.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: newSessionId }),
        },
      )

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setSessionChangeError(prev => ({
          ...prev,
          [cls.id]: data?.error ?? 'Kunde inte flytta klassen',
        }))
        return
      }

      // Reload to correctly reflect moved class
      await load()
    } catch {
      setSessionChangeError(prev => ({
        ...prev,
        [cls.id]: 'Nätverksfel',
      }))
    } finally {
      setSavingSession(prev => ({ ...prev, [cls.id]: false }))
    }
  }

  if (loading && sessions.length === 0) {
    return (
      <section
        data-testid="classes-loading"
        className="app-card flex items-center justify-center gap-3 py-10 text-sm text-muted"
      >
        <span
          aria-hidden="true"
          className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-brand"
        />
        Laddar klasser...
      </section>
    )
  }

  if (loadError) {
    return (
      <p data-testid="classes-load-error" className="app-banner-error">
        {loadError}
      </p>
    )
  }

  const totalClasses = sessions.reduce((sum, s) => sum + s.classes.length, 0)

  if (totalClasses === 0) {
    return (
      <section data-testid="classes-empty" className="app-card py-8 text-sm text-muted">
        Inga klasser importerade än.
      </section>
    )
  }

  return (
    <>
      {sessions.map(session => (
        <section key={session.id} data-testid={`session-section-${session.id}`} className="app-card space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              {formatSessionHeading(session.date, session.name)}
            </h2>
            <p className="text-sm text-muted">{session.date}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-[0.18em] text-muted">
                  <th className="pb-2 pr-4">Klass</th>
                  <th className="pb-2 pr-4">Starttid</th>
                  <th className="pb-2 pr-4">Anmälningsstopp</th>
                  <th className="pb-2">Pass</th>
                </tr>
              </thead>
              <tbody>
                {session.classes.map(cls => (
                  <tr
                    key={cls.id}
                    data-testid={`class-row-${cls.id}`}
                    className="border-b border-line/50 last:border-0"
                  >
                    <td className="py-3 pr-4 font-medium text-ink">{cls.name}</td>
                    <td className="py-3 pr-4 text-muted">{formatLocalDateTime(cls.startTime)}</td>
                    <td className="py-3 pr-4">
                      {editingDeadline?.classId === cls.id ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <DatePicker
                              selected={fromDateString(editingDeadline.date)}
                              onChange={(date: Date | null) => {
                                if (!date) return
                                setEditingDeadline({
                                  ...editingDeadline,
                                  date: toDateString(date),
                                })
                              }}
                              dateFormat="yyyy-MM-dd"
                              locale={sv}
                              placeholderText="ÅÅÅÅ-MM-DD"
                              showPopperArrow={false}
                              calendarClassName="class-settings-datepicker-calendar"
                              popperClassName="class-settings-datepicker-popper"
                              wrapperClassName="class-settings-datepicker-wrapper"
                              customInput={(
                                <DeadlineInput
                                  data-testid={`deadline-date-${cls.id}`}
                                  className="app-input w-[140px] py-1 text-sm tabular-nums"
                                />
                              )}
                            />
                            <DatePicker
                              selected={fromTimeString(editingDeadline.time)}
                              onChange={(date: Date | null) => {
                                if (!date) return
                                setEditingDeadline({
                                  ...editingDeadline,
                                  time: toTimeString(date),
                                })
                              }}
                              showTimeSelect
                              showTimeSelectOnly
                              timeIntervals={5}
                              timeCaption="Tid"
                              timeFormat="HH:mm"
                              dateFormat="HH:mm"
                              locale={sv}
                              showPopperArrow={false}
                              calendarClassName="class-settings-timepicker-calendar"
                              popperClassName="class-settings-datepicker-popper"
                              wrapperClassName="class-settings-datepicker-wrapper"
                              customInput={(
                                <DeadlineInput
                                  data-testid={`deadline-time-${cls.id}`}
                                  className="app-input w-[112px] py-1 text-sm tabular-nums"
                                />
                              )}
                            />
                            <button
                              type="button"
                              data-testid={`deadline-save-${cls.id}`}
                              onClick={() => void saveDeadline(cls)}
                              disabled={savingDeadline}
                              className="app-button-primary min-h-0 px-3 py-1 text-xs"
                            >
                              {savingDeadline ? '...' : 'Spara'}
                            </button>
                            <button
                              type="button"
                              data-testid={`deadline-cancel-${cls.id}`}
                              onClick={cancelEditDeadline}
                              disabled={savingDeadline}
                              className="app-button-secondary min-h-0 px-3 py-1 text-xs"
                            >
                              Avbryt
                            </button>
                          </div>
                          {deadlineError && (
                            <p data-testid={`deadline-error-${cls.id}`} className="text-xs text-red-600">
                              {deadlineError}
                            </p>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          data-testid={`deadline-display-${cls.id}`}
                          onClick={() => startEditDeadline(cls)}
                          className="text-left text-brand underline-offset-2 hover:underline"
                        >
                          {formatLocalDateTime(cls.attendanceDeadline)}
                        </button>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-col gap-1">
                        <select
                          data-testid={`session-select-${cls.id}`}
                          value={session.id}
                          onChange={e => void changeSession(cls, e.target.value)}
                          disabled={savingSession[cls.id]}
                          className="app-input max-w-[160px] py-1 text-sm"
                        >
                          {sessions.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        {sessionChangeError[cls.id] && (
                          <p data-testid={`session-error-${cls.id}`} className="text-xs text-red-600">
                            {sessionChangeError[cls.id]}
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  )
}
