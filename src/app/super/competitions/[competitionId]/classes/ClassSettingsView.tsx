'use client'

import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import DatePicker from 'react-datepicker'

type ClassData = {
  id: string
  name: string
  startTime: string
  attendanceDeadline: string
  maxPlayers: number | null
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

type EditingMaxPlayers = {
  value: string
}

type SaveStatus = {
  state: 'saving' | 'saved' | 'error'
  message?: string
}

const MAX_PLAYERS_SAVE_DELAY_MS = 450

const DeadlineInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function DeadlineInput(props, ref) {
    return <input ref={ref} {...props} />
  },
)

DeadlineInput.displayName = 'DeadlineInput'

function formatLocalDateTime(iso: string): string {
  const d = new Date(iso)
  const stockholm = new Intl.DateTimeFormat('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Stockholm',
    hourCycle: 'h23',
  }).formatToParts(d)

  const parts = Object.fromEntries(stockholm.map(part => [part.type, part.value]))
  const weekday = (parts.weekday ?? '').replace(/\.$/, '')
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)

  return `${capitalizedWeekday} ${parts.day} ${parts.month} kl. ${parts.hour}:${parts.minute}`
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

function StatusNote({
  status,
  testId,
}: {
  status?: SaveStatus
  testId: string
}) {
  if (!status) {
    return null
  }

  if (status.state !== 'error') {
    return null
  }

  return (
    <p data-testid={testId} className="text-xs text-red-600">
      {status.message}
    </p>
  )
}

export default function ClassSettingsView({ competitionId }: { competitionId: string }) {
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [deadlineDrafts, setDeadlineDrafts] = useState<Record<string, EditingDeadline>>({})
  const [deadlineStatus, setDeadlineStatus] = useState<Record<string, SaveStatus>>({})
  const [maxPlayersDrafts, setMaxPlayersDrafts] = useState<Record<string, EditingMaxPlayers>>({})
  const [maxPlayersStatus, setMaxPlayersStatus] = useState<Record<string, SaveStatus>>({})
  const [sessionStatus, setSessionStatus] = useState<Record<string, SaveStatus>>({})
  const [flashClassIds, setFlashClassIds] = useState<Record<string, boolean>>({})
  const deadlineSaveInFlight = useRef<Record<string, boolean>>({})
  const pendingDeadlineDrafts = useRef<Record<string, EditingDeadline | undefined>>({})
  const flashTimers = useRef<Record<string, number>>({})
  const maxPlayersTimers = useRef<Record<string, number>>({})
  const maxPlayersSaveInFlight = useRef<Record<string, boolean>>({})
  const pendingMaxPlayersValues = useRef<Record<string, string | undefined>>({})

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

  useEffect(() => {
    return () => {
      Object.values(flashTimers.current).forEach(timerId => {
        window.clearTimeout(timerId)
      })

      Object.values(maxPlayersTimers.current).forEach(timerId => {
        window.clearTimeout(timerId)
      })
    }
  }, [])

  function triggerSaveFlash(classId: string) {
    const activeTimer = flashTimers.current[classId]
    if (activeTimer) {
      window.clearTimeout(activeTimer)
    }

    setFlashClassIds(previous => ({ ...previous, [classId]: true }))

    flashTimers.current[classId] = window.setTimeout(() => {
      setFlashClassIds(previous => {
        if (!(classId in previous)) {
          return previous
        }

        const next = { ...previous }
        delete next[classId]
        return next
      })
      delete flashTimers.current[classId]
    }, 900)
  }

  function findClassById(classId: string): { cls: ClassData; session: SessionData } | null {
    for (const session of sessions) {
      const cls = session.classes.find(currentClass => currentClass.id === classId)
      if (cls) {
        return { cls, session }
      }
    }

    return null
  }

  function updateClass(classId: string, updater: (cls: ClassData) => ClassData) {
    setSessions(previousSessions =>
      previousSessions.map(session => ({
        ...session,
        classes: session.classes.map(currentClass =>
          currentClass.id === classId ? updater(currentClass) : currentClass,
        ),
      })),
    )
  }

  function clearDeadlineStatus(classId: string) {
    setDeadlineStatus(previous => {
      if (!(classId in previous)) {
        return previous
      }

      const next = { ...previous }
      delete next[classId]
      return next
    })
  }

  function clearMaxPlayersStatus(classId: string) {
    setMaxPlayersStatus(previous => {
      if (!(classId in previous)) {
        return previous
      }

      const next = { ...previous }
      delete next[classId]
      return next
    })
  }

  function getDeadlineDraft(cls: ClassData): EditingDeadline {
    return deadlineDrafts[cls.id] ?? toDateAndTime(cls.attendanceDeadline)
  }

  function getMaxPlayersDraft(cls: ClassData): string {
    return maxPlayersDrafts[cls.id]?.value ?? (cls.maxPlayers === null ? '' : String(cls.maxPlayers))
  }

  async function saveDeadline(classId: string, draft: EditingDeadline) {
    const current = findClassById(classId)
    if (!current) {
      return
    }

    const newIso = fromDateAndTimeToIso(draft.date, draft.time)
    const startTime = new Date(current.cls.startTime)
    const newDeadline = new Date(newIso)

    if (newDeadline >= startTime) {
      setDeadlineStatus(previous => ({
        ...previous,
        [classId]: {
          state: 'error',
          message: 'Anmälningsstopp måste vara före starttiden',
        },
      }))
      return
    }

    if (current.cls.attendanceDeadline === newIso) {
      clearDeadlineStatus(classId)
      return
    }

    setDeadlineStatus(previous => ({ ...previous, [classId]: { state: 'saving' } }))

    try {
      const res = await fetch(
        `/api/super/competitions/${competitionId}/classes/${classId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attendanceDeadline: newIso }),
        },
      )

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setDeadlineStatus(previous => ({
          ...previous,
          [classId]: {
            state: 'error',
            message: data?.error ?? 'Kunde inte spara',
          },
        }))
        return
      }

      updateClass(classId, cls => ({ ...cls, attendanceDeadline: newIso }))
      setDeadlineDrafts(previous => ({ ...previous, [classId]: draft }))
      setDeadlineStatus(previous => ({ ...previous, [classId]: { state: 'saved' } }))
      triggerSaveFlash(classId)
    } catch {
      setDeadlineStatus(previous => ({
        ...previous,
        [classId]: {
          state: 'error',
          message: 'Nätverksfel',
        },
      }))
    }
  }

  async function requestDeadlineSave(classId: string, draft: EditingDeadline) {
    if (deadlineSaveInFlight.current[classId]) {
      pendingDeadlineDrafts.current[classId] = draft
      setDeadlineStatus(previous => ({ ...previous, [classId]: { state: 'saving' } }))
      return
    }

    deadlineSaveInFlight.current[classId] = true

    try {
      await saveDeadline(classId, draft)
    } finally {
      deadlineSaveInFlight.current[classId] = false

      const pendingDraft = pendingDeadlineDrafts.current[classId]
      if (
        pendingDraft
        && (pendingDraft.date !== draft.date || pendingDraft.time !== draft.time)
      ) {
        delete pendingDeadlineDrafts.current[classId]
        await requestDeadlineSave(classId, pendingDraft)
        return
      }

      delete pendingDeadlineDrafts.current[classId]
    }
  }

  async function saveMaxPlayers(classId: string, rawValue: string) {
    const current = findClassById(classId)
    if (!current) {
      return
    }

    const trimmedValue = rawValue.trim()
    const parsedMaxPlayers = Number(trimmedValue)

    if (trimmedValue !== '' && (!Number.isInteger(parsedMaxPlayers) || parsedMaxPlayers <= 0)) {
      setMaxPlayersStatus(previous => ({
        ...previous,
        [classId]: {
          state: 'error',
          message: 'Max spelare måste vara ett positivt heltal',
        },
      }))
      return
    }

    const nextMaxPlayers = trimmedValue === '' ? null : parsedMaxPlayers

    if (current.cls.maxPlayers === nextMaxPlayers) {
      clearMaxPlayersStatus(classId)
      return
    }

    setMaxPlayersStatus(previous => ({ ...previous, [classId]: { state: 'saving' } }))

    try {
      const res = await fetch(
        `/api/super/competitions/${competitionId}/classes/${classId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ maxPlayers: nextMaxPlayers }),
        },
      )

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setMaxPlayersStatus(previous => ({
          ...previous,
          [classId]: {
            state: 'error',
            message: data?.error ?? 'Kunde inte spara',
          },
        }))
        return
      }

      updateClass(classId, cls => ({ ...cls, maxPlayers: nextMaxPlayers }))
      setMaxPlayersDrafts(previous => ({
        ...previous,
        [classId]: { value: nextMaxPlayers === null ? '' : String(nextMaxPlayers) },
      }))
      setMaxPlayersStatus(previous => ({ ...previous, [classId]: { state: 'saved' } }))
      triggerSaveFlash(classId)
    } catch {
      setMaxPlayersStatus(previous => ({
        ...previous,
        [classId]: {
          state: 'error',
          message: 'Nätverksfel',
        },
      }))
    }
  }

  async function requestMaxPlayersSave(classId: string, rawValue: string) {
    if (maxPlayersSaveInFlight.current[classId]) {
      pendingMaxPlayersValues.current[classId] = rawValue
      setMaxPlayersStatus(previous => ({ ...previous, [classId]: { state: 'saving' } }))
      return
    }

    maxPlayersSaveInFlight.current[classId] = true

    try {
      await saveMaxPlayers(classId, rawValue)
    } finally {
      maxPlayersSaveInFlight.current[classId] = false

      const pendingValue = pendingMaxPlayersValues.current[classId]
      if (pendingValue !== undefined && pendingValue !== rawValue) {
        delete pendingMaxPlayersValues.current[classId]
        await requestMaxPlayersSave(classId, pendingValue)
        return
      }

      delete pendingMaxPlayersValues.current[classId]
    }
  }

  function queueMaxPlayersSave(classId: string, rawValue: string) {
    const activeTimer = maxPlayersTimers.current[classId]
    if (activeTimer) {
      window.clearTimeout(activeTimer)
    }

    maxPlayersTimers.current[classId] = window.setTimeout(() => {
      void requestMaxPlayersSave(classId, rawValue)
      delete maxPlayersTimers.current[classId]
    }, MAX_PLAYERS_SAVE_DELAY_MS)
  }

  function flushMaxPlayersSave(classId: string) {
    const activeTimer = maxPlayersTimers.current[classId]
    if (activeTimer) {
      window.clearTimeout(activeTimer)
      delete maxPlayersTimers.current[classId]
    }

    const currentDraft = maxPlayersDrafts[classId]?.value
    if (currentDraft !== undefined) {
      void requestMaxPlayersSave(classId, currentDraft)
    }
  }

  function resetMaxPlayersDraft(classId: string) {
    const activeTimer = maxPlayersTimers.current[classId]
    if (activeTimer) {
      window.clearTimeout(activeTimer)
      delete maxPlayersTimers.current[classId]
    }

    const current = findClassById(classId)
    if (!current) {
      return
    }

    setMaxPlayersDrafts(previous => ({
      ...previous,
      [classId]: { value: current.cls.maxPlayers === null ? '' : String(current.cls.maxPlayers) },
    }))
    clearMaxPlayersStatus(classId)
  }

  async function changeSession(classId: string, newSessionId: string) {
    const current = findClassById(classId)
    if (!current || current.session.id === newSessionId) {
      return
    }

    setSessionStatus(previous => ({ ...previous, [classId]: { state: 'saving' } }))

    try {
      const res = await fetch(
        `/api/super/competitions/${competitionId}/classes/${classId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: newSessionId }),
        },
      )

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setSessionStatus(previous => ({
          ...previous,
          [classId]: {
            state: 'error',
            message: data?.error ?? 'Kunde inte flytta klassen',
          },
        }))
        return
      }

      await load()
      setSessionStatus(previous => ({
        ...previous,
        [classId]: {
          state: 'saved',
          message: 'Flyttad',
        },
      }))
      triggerSaveFlash(classId)
    } catch {
      setSessionStatus(previous => ({
        ...previous,
        [classId]: {
          state: 'error',
          message: 'Nätverksfel',
        },
      }))
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
    <div className="space-y-8">
      {sessions.map(session => (
        <section key={session.id} data-testid={`session-section-${session.id}`} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              {formatSessionHeading(session.date, session.name)}
            </h2>
            <p className="text-sm text-muted">{session.date}</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {session.classes.map(cls => {
              const deadlineDraft = getDeadlineDraft(cls)
              const maxPlayersDraft = getMaxPlayersDraft(cls)
              const isSessionSaving = sessionStatus[cls.id]?.state === 'saving'
              const isFlashing = flashClassIds[cls.id] === true

              return (
                <article
                  key={cls.id}
                  data-testid={`class-row-${cls.id}`}
                  className={`rounded-2xl border border-line/80 bg-white/80 p-4 shadow-sm transition-[border-color,box-shadow,background-color] duration-300 ${isFlashing ? 'class-settings-card-flash' : ''}`}
                >
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-ink">{cls.name}</h3>
                    <p className="text-sm text-muted">{formatLocalDateTime(cls.startTime)}</p>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-[156px_minmax(0,1fr)] gap-x-4 gap-y-2 items-center">
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                        Anmälningsstopp
                      </label>
                      <div className="flex flex-wrap items-center justify-start gap-2">
                        <DatePicker
                          selected={fromDateString(deadlineDraft.date)}
                          onChange={(date: Date | null) => {
                            if (!date) return
                            const nextDraft = {
                              classId: cls.id,
                              date: toDateString(date),
                              time: deadlineDraft.time,
                            }
                            setDeadlineDrafts(previous => ({ ...previous, [cls.id]: nextDraft }))
                            void requestDeadlineSave(cls.id, nextDraft)
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
                              className="app-input w-[148px] py-2 text-sm tabular-nums"
                            />
                          )}
                        />
                        <DatePicker
                          selected={fromTimeString(deadlineDraft.time)}
                          onChange={(date: Date | null) => {
                            if (!date) return
                            const nextDraft = {
                              classId: cls.id,
                              date: deadlineDraft.date,
                              time: toTimeString(date),
                            }
                            setDeadlineDrafts(previous => ({ ...previous, [cls.id]: nextDraft }))
                            void requestDeadlineSave(cls.id, nextDraft)
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
                              className="app-input w-[112px] py-2 text-sm tabular-nums"
                            />
                          )}
                        />
                      </div>
                      <div className="col-start-2">
                        <StatusNote status={deadlineStatus[cls.id]} testId={`deadline-error-${cls.id}`} />
                      </div>
                    </div>

                    <div className="grid grid-cols-[156px_minmax(0,1fr)] gap-x-4 gap-y-2 items-center">
                      <label
                        htmlFor={`session-select-${cls.id}`}
                        className="text-xs font-semibold uppercase tracking-[0.18em] text-muted"
                      >
                        Pass
                      </label>
                      <div className="flex items-center justify-start">
                        <select
                          id={`session-select-${cls.id}`}
                          data-testid={`session-select-${cls.id}`}
                          value={session.id}
                          onChange={event => void changeSession(cls.id, event.target.value)}
                          disabled={isSessionSaving}
                          className="app-input w-full max-w-[220px] py-2 text-sm"
                        >
                          {sessions.map(sessionOption => (
                            <option key={sessionOption.id} value={sessionOption.id}>
                              {formatSessionHeading(sessionOption.date, sessionOption.name)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-start-2">
                        <StatusNote
                          status={sessionStatus[cls.id]}
                          testId={`session-error-${cls.id}`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-[156px_minmax(0,1fr)] gap-x-4 gap-y-2 items-center">
                      <label
                        htmlFor={`max-players-input-${cls.id}`}
                        className="text-xs font-semibold uppercase tracking-[0.18em] text-muted"
                      >
                        Max spelare
                      </label>
                      <div className="flex items-center justify-start">
                        <input
                          id={`max-players-input-${cls.id}`}
                          data-testid={`max-players-input-${cls.id}`}
                          type="number"
                          inputMode="numeric"
                          min="1"
                          step="1"
                          value={maxPlayersDraft}
                          onChange={event => {
                            const nextValue = event.target.value
                            setMaxPlayersDrafts(previous => ({
                              ...previous,
                              [cls.id]: { value: nextValue },
                            }))
                            clearMaxPlayersStatus(cls.id)
                            queueMaxPlayersSave(cls.id, nextValue)
                          }}
                          onBlur={() => flushMaxPlayersSave(cls.id)}
                          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              flushMaxPlayersSave(cls.id)
                            }

                            if (event.key === 'Escape') {
                              event.preventDefault()
                              resetMaxPlayersDraft(cls.id)
                            }
                          }}
                          className="app-input w-full max-w-[132px] py-2 text-sm tabular-nums"
                          placeholder="Tomt = obegränsat"
                        />
                      </div>
                      <div className="col-start-2">
                        <StatusNote status={maxPlayersStatus[cls.id]} testId={`max-players-error-${cls.id}`} />
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
