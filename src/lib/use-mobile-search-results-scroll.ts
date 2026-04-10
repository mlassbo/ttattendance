'use client'

import { useEffect, useRef, type RefObject } from 'react'
import type { PublicSearchMode } from '@/lib/public-competition'

const MOBILE_RESULTS_MEDIA_QUERY = '(max-width: 767px)'

export function useMobileSearchResultsScroll({
  hasResults,
  mode,
  query,
  summaryRef,
  resultsRef,
}: {
  hasResults: boolean
  mode: PublicSearchMode
  query: string
  summaryRef: RefObject<HTMLElement | null>
  resultsRef: RefObject<HTMLElement | null>
}) {
  const lastScrolledSearchRef = useRef<string | null>(null)

  useEffect(() => {
    const trimmedQuery = query.trim()

    if (!trimmedQuery || !hasResults) {
      return
    }

    if (!window.matchMedia(MOBILE_RESULTS_MEDIA_QUERY).matches) {
      return
    }

    const searchKey = `${mode}:${trimmedQuery}`

    if (lastScrolledSearchRef.current === searchKey) {
      return
    }

    const target = summaryRef.current ?? resultsRef.current

    if (!target) {
      return
    }

    lastScrolledSearchRef.current = searchKey

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const frameId = window.requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [hasResults, mode, query, resultsRef, summaryRef])
}