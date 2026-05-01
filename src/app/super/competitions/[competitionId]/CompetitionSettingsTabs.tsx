'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'Tävling', segment: 'venue' },
  { label: 'Integration', segment: 'integration' },
  { label: 'Klasser', segment: 'classes' },
] as const

export default function CompetitionSettingsTabs({ competitionId }: { competitionId: string }) {
  const pathname = usePathname()

  return (
    <nav data-testid="settings-tabs" className="flex gap-1 border-t border-line pt-3">
      {tabs.map(tab => {
        const href = `/super/competitions/${competitionId}/${tab.segment}`
        const isActive = pathname.endsWith(`/${tab.segment}`)

        return (
          <Link
            key={tab.segment}
            href={href}
            data-testid={`tab-${tab.segment}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-brand text-white'
                : 'text-muted hover:bg-brand-soft/50 hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
