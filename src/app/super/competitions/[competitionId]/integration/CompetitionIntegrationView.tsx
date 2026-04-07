'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type IntegrationViewData = {
  competitionId: string
  competitionName: string
  competitionSlug: string
  ingestPath: string
  schemaVersion: number
  hasApiKey: boolean
  apiKeyLast4: string | null
  apiKeyGeneratedAt: string | null
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

type CompetitionIntegrationViewProps = {
  competitionId: string
  competitionName: string
  competitionSlug: string
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
  competitionName,
  competitionSlug,
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
    <main className="app-shell">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="app-card space-y-3">
          <Link
            href="/super/competitions"
            data-testid="back-to-competitions"
            className="inline-flex items-center gap-2 text-sm text-muted underline-offset-2 hover:underline"
          >
            <span aria-hidden="true">&larr;</span>
            Tillbaka till tävlingar
          </Link>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">OnData-integration</p>
            <h1 className="text-3xl font-semibold tracking-tight text-ink">{competitionName}</h1>
            <p className="text-sm text-muted">{competitionSlug}</p>
          </div>
        </section>

        {loadError && <p data-testid="integration-load-error" className="app-banner-error">{loadError}</p>}
        {actionError && <p data-testid="integration-action-error" className="app-banner-error">{actionError}</p>}

        <section className="app-card space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">Anslutning</h2>
              <p className="text-sm text-muted">Klistra in endpoint och API-nyckel i integrationsappen.</p>
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
              schemaVersion: {data?.schemaVersion ?? 1}
            </p>
          </div>
        </section>

        <section data-testid="integration-status-card" className="app-card space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Status</h2>
            <p className="text-sm text-muted">Senaste mottagna snapshot för tävlingen.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <SummaryValue
              label="Klasser"
              value={data?.latestSummary.classes ?? 0}
              testId="integration-summary-classes"
            />
            <SummaryValue
              label="Pooler"
              value={data?.latestSummary.pools ?? 0}
              testId="integration-summary-pools"
            />
            <SummaryValue
              label="Färdiga matcher"
              value={data?.latestSummary.completedMatches ?? 0}
              testId="integration-summary-matches"
            />
          </div>

          <dl className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.18em] text-muted">Senast mottagen</dt>
              <dd data-testid="integration-latest-received" className="mt-1 text-sm text-ink">
                {formatDateTime(data?.latestSnapshotReceivedAt ?? null)}
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.18em] text-muted">Senast bearbetad</dt>
              <dd data-testid="integration-latest-processed" className="mt-1 text-sm text-ink">
                {formatDateTime(data?.latestSnapshotProcessedAt ?? null)}
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.18em] text-muted">Källfil ändrad</dt>
              <dd data-testid="integration-source-modified" className="mt-1 text-sm text-ink">
                {formatDateTime(data?.latestSourceFileModifiedAt ?? null)}
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <dt className="text-xs uppercase tracking-[0.18em] text-muted">Källa bearbetad</dt>
              <dd data-testid="integration-source-processed" className="mt-1 text-sm text-ink">
                {formatDateTime(data?.latestSourceProcessedAt ?? null)}
              </dd>
            </div>
          </dl>

          <div className="rounded-xl border border-line bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Källa</p>
            <p data-testid="integration-source-path" className="mt-1 break-all font-mono text-sm text-ink">
              {data?.latestSourceFilePath ?? 'Ingen källa sparad än'}
            </p>
          </div>

          {data?.apiKeyGeneratedAt && (
            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Nyckel skapad</p>
              <p data-testid="integration-api-key-generated-at" className="mt-1 text-sm text-ink">
                {formatDateTime(data.apiKeyGeneratedAt)}
              </p>
            </div>
          )}

          {data?.lastError ? (
            <div data-testid="integration-last-error" className="app-banner-error">{data.lastError}</div>
          ) : (
            <div data-testid="integration-no-error" className="app-banner-success">Ingen aktuell felstatus.</div>
          )}
        </section>
      </div>
    </main>
  )
}
