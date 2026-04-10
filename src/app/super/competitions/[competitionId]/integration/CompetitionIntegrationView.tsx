'use client'

import { useEffect, useMemo, useState } from 'react'
import OnDataRosterImportPanel from '@/components/OnDataRosterImportPanel'
import TTCoordinatorImportPanel from '@/components/TTCoordinatorImportPanel'

type IntegrationViewData = {
  competitionId: string
  competitionName: string
  competitionSlug: string
  ingestPath: string
  schemaVersions: {
    liveSync: number
    registrationImport: number
  }
  hasApiKey: boolean
  apiKeyLast4: string | null
  apiKeyGeneratedAt: string | null
  hasExistingImport: boolean
  liveSync: {
    latestSnapshotReceivedAt: string | null
    latestSnapshotProcessedAt: string | null
    latestSourceFileModifiedAt: string | null
    latestSourceProcessedAt: string | null
    latestSourceFilePath: string | null
    lastError: string | null
    latestSummary: {
      classes: number
      pools: number
      completedMatches: number
    }
  }
  registrationImport: {
    latestSnapshotId: string | null
    latestSnapshotReceivedAt: string | null
    latestSnapshotProcessedAt: string | null
    latestSourceFilePath: string | null
    lastError: string | null
    lastAppliedSnapshotId: string | null
    lastAppliedAt: string | null
    latestSummary: {
      classes: number
      players: number
      registrations: number
    }
  }
}

type CompetitionIntegrationViewProps = {
  competitionId: string
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Ingen data än'
  }

  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function SummaryValue({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">{label}</p>
      <p data-testid={testId} className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  )
}

export default function CompetitionIntegrationView({
  competitionId,
}: CompetitionIntegrationViewProps) {
  const [data, setData] = useState<IntegrationViewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')

  async function load() {
    setLoading(true)
    setLoadError('')

    try {
      const res = await fetch(`/api/super/competitions/${competitionId}/integration`)
      const nextData = await res.json().catch(() => null)

      if (!res.ok || !nextData) {
        setLoadError(nextData?.error ?? 'Kunde inte hämta integrationsstatus.')
        return
      }

      setData(nextData as IntegrationViewData)
    } catch {
      setLoadError('Nätverksfel när integrationsstatus hämtades.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setOrigin(window.location.origin)
    void load()
  }, [competitionId])

  useEffect(() => {
    if (!copiedField) {
      return
    }

    const timer = window.setTimeout(() => setCopiedField(null), 1600)
    return () => window.clearTimeout(timer)
  }, [copiedField])

  const endpointUrl = useMemo(() => {
    if (!data) {
      return ''
    }

    return origin ? `${origin}${data.ingestPath}` : data.ingestPath
  }, [data, origin])

  async function copyValue(value: string, field: string) {
    setActionError('')

    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
    } catch {
      setActionError('Kunde inte kopiera till urklipp.')
    }
  }

  async function generateApiKey() {
    setActionError('')
    setIsGenerating(true)

    try {
      const res = await fetch(`/api/super/competitions/${competitionId}/integration/api-key`, {
        method: 'POST',
      })
      const payload = await res.json().catch(() => null)

      if (!res.ok || !payload) {
        setActionError(payload?.error ?? 'Kunde inte skapa API-nyckeln.')
        return
      }

      setGeneratedApiKey(payload.apiKey as string)
      await load()
    } catch {
      setActionError('Nätverksfel när API-nyckeln skapades.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <>
        {loadError && <p data-testid="integration-load-error" className="app-banner-error">{loadError}</p>}
        {actionError && <p data-testid="integration-action-error" className="app-banner-error">{actionError}</p>}

        <section className="app-card space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">Anslutning</h2>
              <p className="text-sm text-muted">Klistra in rätt endpoint och samma API-nyckel i integrationsappen.</p>
            </div>
            <button
              type="button"
              data-testid="refresh-integration-status"
              onClick={() => void load()}
              disabled={loading}
              className="app-button-secondary w-full sm:w-auto"
            >
              {loading ? 'Laddar...' : 'Uppdatera status'}
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="integration-endpoint" className="text-sm font-medium text-ink">Endpoint</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="integration-endpoint"
                  readOnly
                  value={endpointUrl}
                  data-testid="integration-endpoint-input"
                  className="app-input font-mono text-sm"
                />
                <button
                  type="button"
                  data-testid="copy-endpoint-button"
                  onClick={() => void copyValue(endpointUrl, 'endpoint')}
                  disabled={!endpointUrl}
                  className="app-button-secondary w-full sm:w-auto"
                >
                  {copiedField === 'endpoint' ? 'Kopierad' : 'Kopiera'}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">API-nyckel</p>

            <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1">
                {generatedApiKey ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      readOnly
                      value={generatedApiKey}
                      data-testid="generated-api-key-input"
                      className="app-input min-w-0 flex-1 font-mono text-sm"
                    />
                    <button
                      type="button"
                      data-testid="copy-api-key-button"
                      onClick={() => void copyValue(generatedApiKey, 'api-key')}
                      className="app-button-secondary w-full sm:w-auto"
                    >
                      {copiedField === 'api-key' ? 'Kopierad' : 'Kopiera'}
                    </button>
                  </div>
                ) : (
                  <p data-testid="api-key-placeholder" className="text-sm text-muted">
                    Ingen nyckel visad. Skapa eller ersätt nyckeln nedan.
                  </p>
                )}
              </div>

              <button
                type="button"
                data-testid="generate-api-key-button"
                onClick={() => void generateApiKey()}
                disabled={isGenerating}
                className="app-button-primary w-full lg:w-auto"
              >
                {isGenerating ? 'Skapar...' : data?.hasApiKey ? 'Skapa ny nyckel' : 'Skapa API-nyckel'}
              </button>
            </div>

            {data?.hasApiKey && !generatedApiKey && (
              <p data-testid="existing-api-key-status" className="text-sm text-muted">
                Aktiv nyckel finns redan{data.apiKeyLast4 ? `, slutar på ${data.apiKeyLast4}` : ''}.
              </p>
            )}

            <p data-testid="schema-version" className="text-sm text-muted">
              schemaVersion: live {data?.schemaVersions.liveSync ?? 1} • anmälningar {data?.schemaVersions.registrationImport ?? 1}
            </p>
          </div>
        </section>

        <section className="app-card space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Anmälningsimport</h2>
            <p className="text-sm text-muted">OnData stage 1 lagras som snapshot och måste förhandsgranskas innan den appliceras.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <SummaryValue label="Klasser" value={data?.registrationImport.latestSummary.classes ?? 0} testId="registration-summary-classes" />
            <SummaryValue label="Spelare" value={data?.registrationImport.latestSummary.players ?? 0} testId="registration-summary-players" />
            <SummaryValue label="Anmälningar" value={data?.registrationImport.latestSummary.registrations ?? 0} testId="registration-summary-registrations" />
          </div>

          <dl className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.18em] text-muted">Senast mottagen</dt>
              <dd data-testid="registration-latest-received" className="mt-1 text-sm text-ink">{formatDateTime(data?.registrationImport.latestSnapshotReceivedAt ?? null)}</dd>
            </div>
            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.18em] text-muted">Senast bearbetad</dt>
              <dd data-testid="registration-latest-processed" className="mt-1 text-sm text-ink">{formatDateTime(data?.registrationImport.latestSnapshotProcessedAt ?? null)}</dd>
            </div>
            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.18em] text-muted">Senast applicerad</dt>
              <dd data-testid="registration-latest-applied" className="mt-1 text-sm text-ink">{formatDateTime(data?.registrationImport.lastAppliedAt ?? null)}</dd>
            </div>
          </dl>

          <div className="rounded-xl border border-line bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Källa</p>
            <p data-testid="registration-source-path" className="mt-1 break-all font-mono text-sm text-ink">
              {data?.registrationImport.latestSourceFilePath ?? 'Ingen källa sparad än'}
            </p>
          </div>

          {data?.registrationImport.lastError && (
            <div data-testid="registration-last-error" className="app-banner-error">{data.registrationImport.lastError}</div>
          )}

          <OnDataRosterImportPanel
            competitionId={competitionId}
            hasExistingImport={data?.hasExistingImport ?? false}
            latestSnapshotId={data?.registrationImport.latestSnapshotId ?? null}
            onApplied={load}
          />
        </section>

        <section data-testid="integration-status-card" className="app-card space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Live-synk</h2>
            <p className="text-sm text-muted">Senaste mottagna live-snapshot för tävlingen.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <SummaryValue label="Klasser" value={data?.liveSync.latestSummary.classes ?? 0} testId="integration-summary-classes" />
            <SummaryValue label="Pooler" value={data?.liveSync.latestSummary.pools ?? 0} testId="integration-summary-pools" />
            <SummaryValue label="Färdiga matcher" value={data?.liveSync.latestSummary.completedMatches ?? 0} testId="integration-summary-matches" />
          </div>

          <dl className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.18em] text-muted">Senast mottagen</dt>
              <dd data-testid="integration-latest-received" className="mt-1 text-sm text-ink">{formatDateTime(data?.liveSync.latestSnapshotReceivedAt ?? null)}</dd>
            </div>
            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.18em] text-muted">Senast bearbetad</dt>
              <dd data-testid="integration-latest-processed" className="mt-1 text-sm text-ink">{formatDateTime(data?.liveSync.latestSnapshotProcessedAt ?? null)}</dd>
            </div>
            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.18em] text-muted">Källfil ändrad</dt>
              <dd data-testid="integration-source-modified" className="mt-1 text-sm text-ink">{formatDateTime(data?.liveSync.latestSourceFileModifiedAt ?? null)}</dd>
            </div>
            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.18em] text-muted">Källa bearbetad</dt>
              <dd data-testid="integration-source-processed" className="mt-1 text-sm text-ink">{formatDateTime(data?.liveSync.latestSourceProcessedAt ?? null)}</dd>
            </div>
          </dl>

          <div className="rounded-xl border border-line bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Källa</p>
            <p data-testid="integration-source-path" className="mt-1 break-all font-mono text-sm text-ink">
              {data?.liveSync.latestSourceFilePath ?? 'Ingen källa sparad än'}
            </p>
          </div>

          {data?.apiKeyGeneratedAt && (
            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Nyckel skapad</p>
              <p data-testid="integration-api-key-generated-at" className="mt-1 text-sm text-ink">{formatDateTime(data.apiKeyGeneratedAt)}</p>
            </div>
          )}

          {data?.liveSync.lastError && (
            <div data-testid="integration-last-error" className="app-banner-error">{data.liveSync.lastError}</div>
          )}
        </section>

        <section className="app-card space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Reservlösning: TT Coordinator-import</h2>
            <p className="text-sm text-muted">Använd bara detta om OnData-anmälningsimporten inte är tillgänglig eller innehåller fel.</p>
          </div>

          <TTCoordinatorImportPanel competitionId={competitionId} hasExistingImport={data?.hasExistingImport ?? false} />
        </section>
    </>
  )
}