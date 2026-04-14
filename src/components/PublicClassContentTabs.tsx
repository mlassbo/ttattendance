'use client'

import { useState } from 'react'
import type { ClassLiveData, PublicSearchClass } from '@/lib/public-competition'
import ClassLiveView from '@/components/ClassLiveView'
import PublicClassRosterView from '@/components/PublicClassRosterView'

type PublicClassContentTabsProps = {
  classDetails: PublicSearchClass
  liveData: ClassLiveData | null
  showRosterSummaryPills?: boolean
}

type ClassTab = 'players' | 'pools'

export default function PublicClassContentTabs({
  classDetails,
  liveData,
  showRosterSummaryPills = true,
}: PublicClassContentTabsProps) {
  const hasPools = Boolean(liveData)
  const [activeTab, setActiveTab] = useState<ClassTab>(hasPools ? 'pools' : 'players')

  return (
    <section className="app-card space-y-4">
      <div
        role="tablist"
        aria-label={`Visa innehall for ${classDetails.name}`}
        className="flex items-center gap-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'players'}
          onClick={() => setActiveTab('players')}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
            activeTab === 'players'
              ? 'bg-brand text-white'
              : 'border border-line/80 bg-white text-ink shadow-sm hover:border-brand/30 hover:bg-brand-soft/40'
          }`}
        >
          Spelare
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pools'}
          aria-disabled={!hasPools}
          disabled={!hasPools}
          onClick={() => setActiveTab('pools')}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
            activeTab === 'pools'
              ? 'bg-brand text-white'
              : 'border border-line/80 bg-white text-ink shadow-sm hover:border-brand/30 hover:bg-brand-soft/40'
          } disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-muted disabled:shadow-none disabled:hover:bg-stone-100`}
        >
          Pooler
        </button>
      </div>

      {activeTab === 'pools' && liveData ? (
        <ClassLiveView pools={liveData.pools} />
      ) : (
        <PublicClassRosterView
          classDetails={classDetails}
          showSummaryPills={showRosterSummaryPills}
        />
      )}
    </section>
  )
}
