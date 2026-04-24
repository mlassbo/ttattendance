import type { ClassLiveStatus } from '@/lib/public-competition'
import { getClassLiveStatusLabel, getClassLiveStatusPillClass } from '@/lib/public-competition'

type ClassLiveStatusPillProps = {
  status: ClassLiveStatus
  testId?: string
}

export default function ClassLiveStatusPill({ status, testId }: ClassLiveStatusPillProps) {
  return (
    <span data-testid={testId} className={getClassLiveStatusPillClass(status)}>
      {status === 'pool_play_started' ? (
        <span className="relative mr-1.5 flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
        </span>
      ) : null}
      {getClassLiveStatusLabel(status)}
    </span>
  )
}
