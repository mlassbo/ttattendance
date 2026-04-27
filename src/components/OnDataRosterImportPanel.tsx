'use client'

import { useEffect, useState } from 'react'
import type {
  CompetitionImportApplyResult,
  CompetitionImportClassSessionPrompt,
  CompetitionImportPreview,
} from '@/lib/import/competition-import'

type PreviewResponse = CompetitionImportPreview & { snapshotId: string }
type ApplyResponse = CompetitionImportApplyResult & { snapshotId: string }

function requestFailedMessage() {
  return 'Kunde inte nå servern. Försök igen.'
}

function isPreviewResponse(value: unknown): value is PreviewResponse {
  return typeof value === 'object'
    && value !== null
    && 'snapshotId' in value
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

function SummaryRow({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm text-slate-600">{label}</p>
      <p data-testid={testId} className="text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}

export default function OnDataRosterImportPanel({
  competitionId,
  hasExistingImport,
  latestSnapshotId,
  onApplied,
}: {
  competitionId: string
  hasExistingImport: boolean
  latestSnapshotId: string | null
  onApplied?: () => Promise<void> | void
}) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null)
  const [classSessionAssignments, setClassSessionAssignments] = useState<Record<string, string>>({})
  const [confirmRemovalWithAttendance, setConfirmRemovalWithAttendance] = useState(false)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isApplyLoading, setIsApplyLoading] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [hasImportedData, setHasImportedData] = useState(hasExistingImport)
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(latestSnapshotId)

  useEffect(() => {
    setSelectedSnapshotId(latestSnapshotId)
    setHasImportedData(current => current || hasExistingImport)
  }, [hasExistingImport, latestSnapshotId])

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

  async function fetchPreview(snapshotId: string | null): Promise<PreviewResponse | null> {
    let res: Response
    try {
      res = await fetch(`/api/super/competitions/${competitionId}/integration/registration-import/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshotId ? { snapshotId } : {}),
      })
    } catch {
      setRequestError(requestFailedMessage())
      return null
    }

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setRequestError(data?.error ?? 'Kunde inte förhandsgranska anmälningsimporten.')
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
      const nextPreview = await fetchPreview(selectedSnapshotId)
      if (!nextPreview) return

      setSelectedSnapshotId(nextPreview.snapshotId)
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
        res = await fetch(`/api/super/competitions/${competitionId}/integration/registration-import/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            snapshotId: preview?.snapshotId ?? selectedSnapshotId,
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
          setSelectedSnapshotId(data.snapshotId)
          if (res.status === 409) {
            setRequestError('Bekräfta att anmälningar med bekräftad närvaro får tas bort innan du importerar.')
          }
          return
        }

        setRequestError(data?.error ?? 'Kunde inte genomföra anmälningsimporten.')
        return
      }

      setApplyResult(data as ApplyResponse)
      setHasImportedData(true)
      if (typeof onApplied === 'function') {
        await onApplied()
      }

      if (wasInitialImport) {
        setPreview(null)
        return
      }

      const refreshedPreview = await fetchPreview(preview?.snapshotId ?? selectedSnapshotId)
      if (refreshedPreview) {
        setSelectedSnapshotId(refreshedPreview.snapshotId)
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

  const showReimportDetails = hasImportedData
  const showReimportLists = showReimportDetails && preview !== null
    && (preview.toAdd.length > 0 || preview.toRemove.length > 0)

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="preview-ondata-registration-import-button"
          onClick={handlePreview}
          disabled={!latestSnapshotId || isPreviewLoading || isApplyLoading}
          className="app-button-primary"
        >
          {isPreviewLoading ? 'Förhandsgranskar...' : 'Förhandsgranska import'}
        </button>
        <button
          type="button"
          data-testid="apply-ondata-registration-import-button"
          onClick={handleApply}
          disabled={!canApply}
          className="app-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isApplyLoading ? 'Importerar...' : 'Importera anmälningar'}
        </button>
      </div>

      {requestError && <p data-testid="ondata-registration-import-error" className="app-banner-error">{requestError}</p>}

      {!latestSnapshotId && (
        <p data-testid="ondata-registration-import-empty" className="text-sm text-muted">
          Ingen OnData-anmälningssnapshot är mottagen än.
        </p>
      )}

      {applyResult && (
        <section data-testid="ondata-registration-apply-success" className="rounded border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
          <h2 className="text-lg font-semibold">Anmälningsimport genomförd</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            <SummaryRow label="Anmälningar tillagda" value={applyResult.summary.registrationsAdded} testId="ondata-apply-registrations-added" />
            <SummaryRow label="Anmälningar borttagna" value={applyResult.summary.registrationsRemoved} testId="ondata-apply-registrations-removed" />
            <SummaryRow label="Spelare skapade" value={applyResult.summary.playersCreated} testId="ondata-apply-players-created" />
            <SummaryRow label="Spelare borttagna" value={applyResult.summary.playersDeleted} testId="ondata-apply-players-deleted" />
            <SummaryRow label="Pass skapade" value={applyResult.summary.sessionsCreated} testId="ondata-apply-sessions-created" />
            <SummaryRow label="Klasser skapade" value={applyResult.summary.classesCreated} testId="ondata-apply-classes-created" />
            <SummaryRow label="Klasser flyttade" value={applyResult.summary.classesUpdated} testId="ondata-apply-classes-updated" />
          </div>
        </section>
      )}

      {preview && (
        <section className="space-y-6">
          <div className="rounded border border-slate-200 bg-white p-5">
            <div className={`grid gap-3 ${showReimportDetails ? 'md:grid-cols-3 xl:grid-cols-7' : 'md:grid-cols-3'}`}>
              <SummaryRow label="Klasser" value={preview.summary.classesParsed} testId="ondata-summary-classes-parsed" />
              <SummaryRow label="Spelare" value={preview.summary.playersParsed} testId="ondata-summary-players-parsed" />
              <SummaryRow label="Anmälningar" value={preview.summary.registrationsParsed} testId="ondata-summary-registrations-parsed" />
              {showReimportDetails && (
                <>
                  <SummaryRow label="Tillkommer" value={preview.summary.registrationsToAdd} testId="ondata-summary-registrations-to-add" />
                  <SummaryRow label="Tas bort" value={preview.summary.registrationsToRemove} testId="ondata-summary-registrations-to-remove" />
                  <SummaryRow label="Tas bort med bekräftad närvaro" value={preview.summary.registrationsToRemoveWithConfirmedAttendance} testId="ondata-summary-registrations-to-remove-with-confirmed-attendance" />
                  <SummaryRow label="Tas bort med frånvaro" value={preview.summary.registrationsToRemoveWithAbsentAttendance} testId="ondata-summary-registrations-to-remove-with-absent-attendance" />
                </>
              )}
            </div>
          </div>

          <section data-testid="ondata-session-prompts" className="rounded border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-slate-900">Pass för importerade klasser</h2>
              <p className="text-sm text-slate-500">Systemet föreslår pass utifrån starttid. Du kan ändra förslaget innan import.</p>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              {preview.classSessionPrompts.map((prompt, index) => (
                <article key={prompt.classKey} data-testid={`ondata-class-session-card-${index}`} className="rounded border border-slate-200 p-4">
                  <div className="flex flex-col gap-1">
                    <p className="font-medium text-slate-900">{prompt.className}</p>
                    <p className="text-sm text-slate-600">{prompt.classDate} • {prompt.classTime}</p>
                    {prompt.currentSessionNumber && <p className="text-sm text-slate-500">Nuvarande pass: {sessionLabel(prompt.classDate, prompt.currentSessionNumber)}</p>}
                  </div>

                  <label className="mt-4 block text-sm font-medium text-slate-700">
                    Pass
                    <select
                      data-testid={`ondata-class-session-select-${index}`}
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
            <section data-testid="ondata-destructive-warning" className="rounded border border-amber-200 bg-amber-50 p-5 text-amber-950">
              <h2 className="text-lg font-semibold">Varning</h2>
              <ul className="mt-3 list-disc pl-5 text-sm">
                {preview.warnings.map(warning => <li key={warning}>{warning}</li>)}
              </ul>
              {preview.summary.registrationsToRemoveWithConfirmedAttendance > 0 && (
                <label className="mt-4 flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    data-testid="ondata-confirm-removal-with-attendance"
                    checked={confirmRemovalWithAttendance}
                    onChange={event => setConfirmRemovalWithAttendance(event.target.checked)}
                  />
                  Jag förstår att anmälningar med bekräftad närvaro tas bort.
                </label>
              )}
            </section>
          )}

          {preview.errors.length > 0 && (
            <section data-testid="ondata-preview-errors" className="rounded border border-red-200 bg-red-50 p-5 text-red-950">
              <h2 className="text-lg font-semibold">Det här måste rättas först</h2>
              <ul className="mt-3 list-disc pl-5 text-sm">
                {preview.errors.map(error => <li key={error}>{error}</li>)}
              </ul>
            </section>
          )}

          {showReimportLists && (
            <div className="grid gap-6 xl:grid-cols-2">
              <section data-testid="ondata-additions-list" className="rounded border border-slate-200 bg-white p-5">
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

              <section data-testid="ondata-removals-list" className="rounded border border-slate-200 bg-white p-5">
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