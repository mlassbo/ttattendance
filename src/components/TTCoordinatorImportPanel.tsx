'use client'

import { useState } from 'react'
import type {
  CompetitionImportApplyResult,
  CompetitionImportClassSessionPrompt,
  CompetitionImportPreview,
} from '@/lib/import/competition-import'

function requestFailedMessage() {
  return 'Kunde inte nå servern. Försök igen.'
}

function isPreviewResponse(value: unknown): value is CompetitionImportPreview {
  return typeof value === 'object'
    && value !== null
    && 'summary' in value
    && 'errors' in value
    && 'warnings' in value
    && 'classSessionPrompts' in value
    && 'toAdd' in value
    && 'toRemove' in value
}

function attendanceLabel(status?: 'confirmed' | 'absent' | null): string {
  if (status === 'confirmed') return 'Bekräftad'
  if (status === 'absent') return 'Frånvaro'
  return 'Ingen status'
}

function sessionLabel(classDate: string, sessionNumber: number): string {
  const weekday = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'UTC',
    weekday: 'short',
  })
    .format(new Date(`${classDate}T00:00:00.000Z`))
    .replace('.', '')

  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} - Pass ${sessionNumber}`
}

function SummaryRow({
  label,
  value,
  testId,
}: {
  label: string
  value: number
  testId: string
}) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm text-slate-600">{label}</p>
      <p data-testid={testId} className="text-2xl font-semibold text-slate-900">
        {value}
      </p>
    </div>
  )
}

export default function TTCoordinatorImportPanel({
  competitionId,
  hasExistingImport,
}: {
  competitionId: string
  hasExistingImport: boolean
}) {
  const [sourceText, setSourceText] = useState('')
  const [preview, setPreview] = useState<CompetitionImportPreview | null>(null)
  const [applyResult, setApplyResult] = useState<CompetitionImportApplyResult | null>(null)
  const [classSessionAssignments, setClassSessionAssignments] = useState<Record<string, string>>({})
  const [confirmRemovalWithAttendance, setConfirmRemovalWithAttendance] = useState(false)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isApplyLoading, setIsApplyLoading] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [hasImportedData, setHasImportedData] = useState(hasExistingImport)

  function buildDefaultAssignments(classSessionPrompts: CompetitionImportClassSessionPrompt[]) {
    return Object.fromEntries(
      classSessionPrompts.map(prompt => [
        prompt.classKey,
        prompt.defaultSessionNumber ? String(prompt.defaultSessionNumber) : '',
      ]),
    )
  }

  function hasAssignmentForEveryClass(nextPreview: CompetitionImportPreview | null) {
    if (!nextPreview) return false

    return nextPreview.classSessionPrompts.every(prompt => {
      const selected = Number(classSessionAssignments[prompt.classKey])
      return prompt.options.some(option => option.sessionNumber === selected)
    })
  }

  async function fetchPreview(currentSource: string): Promise<CompetitionImportPreview | null> {
    let res: Response
    try {
      res = await fetch(`/api/super/competitions/${competitionId}/import/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceText: currentSource }),
      })
    } catch {
      setRequestError(requestFailedMessage())
      return null
    }

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setRequestError(data?.error ?? 'Kunde inte förhandsgranska importen.')
      return null
    }

    if (!isPreviewResponse(data)) {
      setRequestError('Ogiltigt svar från servern.')
      return null
    }

    return data
  }

  async function handlePreview() {
    setRequestError('')
    setApplyResult(null)
    setIsPreviewLoading(true)
    try {
      const nextPreview = await fetchPreview(sourceText)
      if (!nextPreview) return

      setConfirmRemovalWithAttendance(false)
      setClassSessionAssignments(buildDefaultAssignments(nextPreview.classSessionPrompts))
      setPreview(nextPreview)
    } finally {
      setIsPreviewLoading(false)
    }
  }

  async function handleApply() {
    setRequestError('')
    setIsApplyLoading(true)
    const wasInitialImport = !hasImportedData
    try {
      let res: Response
      try {
        res = await fetch(`/api/super/competitions/${competitionId}/import/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceText,
            confirmRemovalWithAttendance,
            classSessionAssignments: preview?.classSessionPrompts.map(prompt => ({
              classKey: prompt.classKey,
              sessionNumber: Number(classSessionAssignments[prompt.classKey]),
            })) ?? [],
          }),
        })
      } catch {
        setRequestError(requestFailedMessage())
        return
      }

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        if (isPreviewResponse(data)) {
          setPreview(data)
          if (res.status === 409) {
            setRequestError('Bekräfta att anmälningar med bekräftad närvaro får tas bort innan du synkar.')
          }
          return
        }

        setRequestError(data?.error ?? 'Kunde inte genomföra importen.')
        return
      }

      setApplyResult(data as CompetitionImportApplyResult)
      setHasImportedData(true)

      if (wasInitialImport) {
        setPreview(null)
        return
      }

      const refreshedPreview = await fetchPreview(sourceText)
      if (refreshedPreview) {
        setClassSessionAssignments(buildDefaultAssignments(refreshedPreview.classSessionPrompts))
        setPreview(refreshedPreview)
      }
    } finally {
      setIsApplyLoading(false)
    }
  }

  const canApply = preview !== null
    && preview.errors.length === 0
    && hasAssignmentForEveryClass(preview)
    && !isApplyLoading
    && !isPreviewLoading
    && (
      preview.summary.registrationsToRemoveWithConfirmedAttendance === 0
      || confirmRemovalWithAttendance
    )
  const applyTooltip = preview === null
    ? 'Förhandsgranska först för att aktivera import.'
    : preview.errors.length > 0
      ? 'Rätta felen i förhandsgranskningen innan du importerar.'
      : !hasAssignmentForEveryClass(preview)
        ? 'Välj pass för alla importerade klasser.'
        : preview.summary.registrationsToRemoveWithConfirmedAttendance > 0 && !confirmRemovalWithAttendance
          ? 'Bekräfta först att anmälningar med bekräftad närvaro får tas bort.'
          : 'Importera förhandsgranskad startlista.'
  const showReimportDetails = hasImportedData
  const showReimportLists = showReimportDetails && preview !== null
    && (preview.toAdd.length > 0 || preview.toRemove.length > 0)

  return (
    <section className="space-y-6">
      <section className="rounded border border-slate-200 bg-white p-5">
        <label htmlFor="sourceText" className="mb-2 block text-sm font-medium text-slate-700">
          Klistra in rapporten &quot;Deltagarlista, alla klasser&quot; från TT Coordinator
        </label>
        <textarea
          id="sourceText"
          data-testid="import-source"
          value={sourceText}
          onChange={event => {
            setSourceText(event.target.value)
            setPreview(null)
            setApplyResult(null)
            setClassSessionAssignments({})
            setConfirmRemovalWithAttendance(false)
            setRequestError('')
          }}
          placeholder="Klistra in deltagarlistan här"
          className="min-h-[320px] w-full rounded border border-slate-300 px-3 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-slate-500"
        />

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            data-testid="preview-import-button"
            onClick={handlePreview}
            disabled={!sourceText.trim() || isPreviewLoading || isApplyLoading}
            className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isPreviewLoading ? 'Förhandsgranskar...' : 'Förhandsgranska'}
          </button>
          <span title={applyTooltip}>
            <button
              type="button"
              data-testid="apply-import-button"
              onClick={handleApply}
              disabled={!canApply}
              className="rounded bg-emerald-700 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {isApplyLoading ? 'Importerar...' : 'Importera'}
            </button>
          </span>
        </div>

        {requestError && (
          <p data-testid="import-request-error" className="mt-4 text-sm text-red-700">
            {requestError}
          </p>
        )}
      </section>

      {applyResult && (
        <section
          data-testid="apply-success"
          className="rounded border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"
        >
          <h2 className="text-lg font-semibold">Import genomförd</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            <SummaryRow label="Anmälningar tillagda" value={applyResult.summary.registrationsAdded} testId="apply-registrations-added" />
            <SummaryRow label="Anmälningar borttagna" value={applyResult.summary.registrationsRemoved} testId="apply-registrations-removed" />
            <SummaryRow label="Spelare skapade" value={applyResult.summary.playersCreated} testId="apply-players-created" />
            <SummaryRow label="Spelare borttagna" value={applyResult.summary.playersDeleted} testId="apply-players-deleted" />
            <SummaryRow label="Pass skapade" value={applyResult.summary.sessionsCreated} testId="apply-sessions-created" />
            <SummaryRow label="Klasser skapade" value={applyResult.summary.classesCreated} testId="apply-classes-created" />
            <SummaryRow label="Klasser flyttade" value={applyResult.summary.classesUpdated} testId="apply-classes-updated" />
          </div>
        </section>
      )}

      {preview && (
        <section className="flex flex-col gap-6">
          <div className="rounded border border-slate-200 bg-white p-5">
            <div className="mb-4 flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-slate-900">Förhandsgranskning</h2>
              {preview.competitionTitleFromSource && (
                <p className="text-sm text-slate-500">Titel i källan: {preview.competitionTitleFromSource}</p>
              )}
            </div>

            <div className={`grid gap-3 ${showReimportDetails ? 'md:grid-cols-3 xl:grid-cols-7' : 'md:grid-cols-3'}`}>
              <SummaryRow label="Klasser" value={preview.summary.classesParsed} testId="summary-classes-parsed" />
              <SummaryRow label="Spelare" value={preview.summary.playersParsed} testId="summary-players-parsed" />
              <SummaryRow label="Anmälningar" value={preview.summary.registrationsParsed} testId="summary-registrations-parsed" />
              {showReimportDetails && (
                <>
                  <SummaryRow label="Tillkommer" value={preview.summary.registrationsToAdd} testId="summary-registrations-to-add" />
                  <SummaryRow label="Tas bort" value={preview.summary.registrationsToRemove} testId="summary-registrations-to-remove" />
                  <SummaryRow label="Tas bort med bekräftad närvaro" value={preview.summary.registrationsToRemoveWithConfirmedAttendance} testId="summary-registrations-to-remove-with-confirmed-attendance" />
                  <SummaryRow label="Tas bort med frånvaro" value={preview.summary.registrationsToRemoveWithAbsentAttendance} testId="summary-registrations-to-remove-with-absent-attendance" />
                </>
              )}
            </div>
          </div>

          <section data-testid="session-prompts" className="rounded border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-slate-900">Pass för importerade klasser</h2>
              <p className="text-sm text-slate-500">Systemet föreslår pass utifrån starttid. Du kan ändra förslaget innan import.</p>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              {preview.classSessionPrompts.map((prompt, index) => (
                <article key={prompt.classKey} data-testid={`class-session-card-${index}`} className="rounded border border-slate-200 p-4">
                  <div className="flex flex-col gap-1">
                    <p className="font-medium text-slate-900">{prompt.className}</p>
                    <p className="text-sm text-slate-600">{prompt.classDate} • {prompt.classTime}</p>
                    {prompt.currentSessionNumber && (
                      <p className="text-sm text-slate-500">Nuvarande pass: {sessionLabel(prompt.classDate, prompt.currentSessionNumber)}</p>
                    )}
                  </div>

                  <label className="mt-4 block text-sm font-medium text-slate-700">
                    Pass
                    <select
                      data-testid={`class-session-select-${index}`}
                      value={classSessionAssignments[prompt.classKey] ?? ''}
                      onChange={event => {
                        const nextValue = event.target.value
                        setClassSessionAssignments(current => ({ ...current, [prompt.classKey]: nextValue }))
                        setApplyResult(null)
                        setRequestError('')
                      }}
                      className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                    >
                      <option value="" disabled>Välj pass</option>
                      {prompt.options.map(option => (
                        <option key={option.sessionNumber} value={option.sessionNumber}>
                          {sessionLabel(prompt.classDate, option.sessionNumber)}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              ))}
            </div>
          </section>

          {preview.warnings.length > 0 && (
            <section data-testid="destructive-warning" className="rounded border border-amber-200 bg-amber-50 p-5 text-amber-950">
              <h2 className="text-lg font-semibold">Varning</h2>
              <ul className="mt-3 list-disc pl-5 text-sm">
                {preview.warnings.map(warning => <li key={warning}>{warning}</li>)}
              </ul>
              {preview.summary.registrationsToRemoveWithConfirmedAttendance > 0 && (
                <label className="mt-4 flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    data-testid="confirm-removal-with-attendance"
                    checked={confirmRemovalWithAttendance}
                    onChange={event => setConfirmRemovalWithAttendance(event.target.checked)}
                  />
                  Jag förstår att anmälningar med bekräftad närvaro tas bort.
                </label>
              )}
            </section>
          )}

          {preview.errors.length > 0 && (
            <section data-testid="preview-errors" className="rounded border border-red-200 bg-red-50 p-5 text-red-950">
              <h2 className="text-lg font-semibold">Det här måste rättas först</h2>
              <ul className="mt-3 list-disc pl-5 text-sm">
                {preview.errors.map(error => <li key={error}>{error}</li>)}
              </ul>
            </section>
          )}

          {showReimportLists && (
            <div className="grid gap-6 xl:grid-cols-2">
              <section data-testid="additions-list" className="rounded border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-slate-900">Tillkommande anmälningar</h2>
                <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-700">
                  {preview.toAdd.map(row => (
                    <li key={`${row.className}-${row.playerName}`} className="rounded border border-slate-200 px-3 py-2">
                      <p className="font-medium text-slate-900">{row.playerName}</p>
                      <p>{row.clubName}</p>
                      <p className="text-slate-500">{row.className} • {row.classDate} • {row.classTime}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <section data-testid="removals-list" className="rounded border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-slate-900">Anmälningar som tas bort</h2>
                <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-700">
                  {preview.toRemove.map(row => (
                    <li key={`${row.className}-${row.playerName}`} className="rounded border border-slate-200 px-3 py-2">
                      <p className="font-medium text-slate-900">{row.playerName}</p>
                      <p>{row.clubName}</p>
                      <p className="text-slate-500">{row.className} • {row.classDate} • {row.classTime}</p>
                      {row.attendanceStatus && <p className="text-slate-500">{attendanceLabel(row.attendanceStatus)}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </section>
      )}
    </section>
  )
}