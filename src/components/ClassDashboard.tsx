import ClassDashboardClient from '@/components/ClassDashboardClient'
import type {
  ClassDashboardSession,
  ClassLiveStatus,
} from '@/lib/public-competition'

type ClassDashboardProps = {
  sessions: ClassDashboardSession[]
  slug: string
  liveStatus: Map<string, ClassLiveStatus>
}

export default function ClassDashboard({
  sessions,
  slug,
  liveStatus,
}: ClassDashboardProps) {
  return (
    <ClassDashboardClient
      sessions={sessions}
      slug={slug}
      liveStatusByClassId={Object.fromEntries(liveStatus)}
    />
  )
}
