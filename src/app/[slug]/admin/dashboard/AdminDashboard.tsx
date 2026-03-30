'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatTime } from '../format'

interface ClassCounts {
  confirmed: number
  absent: number
  noResponse: number
  total: number
}

interface ClassSummary {
  id: string
  name: string
  startTime: string
  attendanceDeadline: string
  counts: ClassCounts
}

interface Session {
  id: string
  name: string
  date: string
  sessionOrder: number
  classes: ClassSummary[]
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('sv-SE', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export default function AdminDashboard({ slug }: { slug: string }) {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/sessions')
      if (res.status === 401) {
        router.push(`/${slug}/admin`)
        return
      }
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions)
        setUpdatedAt(new Date())
        setError(null)
      } else {
        setError('Kunde inte hämta data')
      }
    } catch {
      setError('Nätverksfel')
    } finally {
      setLoading(false)
    }
  }, [slug, router])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30_000)
    return () => clearInterval(interval)
  }, [fetchData])

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Sekretariat</p>
            <h1 className="text-lg font-bold text-gray-900">Närvaro</h1>
          </div>
          <div className="text-right">
            {updatedAt && (
              <p className="text-xs text-gray-400">
                Senast uppdaterad: {updatedAt.toLocaleTimeString('sv-SE')}
              </p>
            )}
            <button
              data-testid="refresh-button"
              onClick={fetchData}
              className="text-xs text-indigo-600 hover:underline mt-0.5"
            >
              Uppdatera nu
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {loading && (
          <p className="text-gray-500 text-sm">Laddar...</p>
        )}

        {error && (
          <p className="text-red-600 text-sm mb-4">{error}</p>
        )}

        {!loading && sessions.length === 0 && !error && (
          <p className="text-gray-500 text-sm">Inga pass hittades.</p>
        )}

        <div className="space-y-8">
          {sessions.map(session => (
            <div key={session.id}>
              <h2 className="text-base font-semibold text-gray-700 mb-2">
                {session.name}
                <span className="ml-2 text-sm font-normal text-gray-400">
                  {formatDate(session.date)}
                </span>
              </h2>
              <div className="bg-white rounded-lg shadow-sm divide-y">
                {session.classes.map(cls => {
                  const isPastDeadline = new Date() > new Date(cls.attendanceDeadline)
                  return (
                    <div
                      key={cls.id}
                      data-testid={`class-row-${cls.id}`}
                      className="flex items-center px-4 py-3 gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{cls.name}</p>
                        <p className="text-xs text-gray-400">
                          Start {formatTime(cls.startTime)}
                          {' · '}
                          <span className={isPastDeadline ? 'text-red-400' : ''}>
                            Deadline {formatTime(cls.attendanceDeadline)}
                          </span>
                        </p>
                      </div>

                      {/* Counts */}
                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          data-testid={`count-confirmed-${cls.id}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full"
                          title="Bekräftade"
                        >
                          <span>✓</span> {cls.counts.confirmed}
                        </span>
                        <span
                          data-testid={`count-absent-${cls.id}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full"
                          title="Frånvaro"
                        >
                          <span>✗</span> {cls.counts.absent}
                        </span>
                        <span
                          data-testid={`count-no-response-${cls.id}`}
                          className={`inline-flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded-full ${
                            cls.counts.noResponse > 0 && isPastDeadline
                              ? 'text-orange-700 bg-orange-50'
                              : 'text-gray-500 bg-gray-100'
                          }`}
                          title="Ej rapporterat"
                        >
                          <span>?</span> {cls.counts.noResponse}
                        </span>
                      </div>

                      <Link
                        data-testid={`class-detail-link-${cls.id}`}
                        href={`/${slug}/admin/classes/${cls.id}`}
                        className="shrink-0 text-sm text-indigo-600 hover:underline font-medium"
                      >
                        Visa →
                      </Link>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
