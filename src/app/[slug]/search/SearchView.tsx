'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Player {
  id: string
  name: string
  club: string | null
}

export default function SearchView({ slug, competitionName }: { slug: string; competitionName: string }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)
  // Tracks the query value for which the last fetch completed. "No results"
  // is only shown when this matches the current query, preventing flicker
  // during the debounce window and the one-frame gap before effects fire.
  const [fetchedQuery, setFetchedQuery] = useState('')

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)

    // 500 ms debounce — reduces server load during peak event usage.
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/players/search?q=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data = await res.json()
        setResults(data.players ?? [])
      }
      setFetchedQuery(query)
      setLoading(false)
    }, 500)

    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{competitionName}</h1>
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Sök spelare</h2>
        <input
          data-testid="search-input"
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Skriv ditt namn..."
          className="w-full border border-gray-300 rounded-md px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
          autoFocus
        />
        {loading && (
          <p className="text-gray-500 text-sm mb-2">Söker...</p>
        )}
        {!loading && fetchedQuery === query && query.length >= 2 && results.length === 0 && (
          <p data-testid="no-results" className="text-gray-500 text-sm mb-2">
            Inga spelare hittades.
          </p>
        )}
        <ul data-testid="search-results" className="space-y-2">
          {results.map(player => (
            <li key={player.id}>
              <button
                data-testid={`player-result-${player.id}`}
                onClick={() => router.push(`/${slug}/players/${player.id}`)}
                className="w-full text-left bg-white rounded-md shadow-sm px-4 py-3 hover:bg-blue-50 transition-colors border border-gray-100"
              >
                <span className="font-medium text-gray-900">{player.name}</span>
                {player.club && (
                  <span className="text-gray-500 text-sm ml-2">— {player.club}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
