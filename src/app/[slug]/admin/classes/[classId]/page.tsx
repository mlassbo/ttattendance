import { getAdminCompetition } from '../../auth'
import ClassAttendanceView from './ClassAttendanceView'

export default async function AdminClassPage({
  params,
}: {
  params: { slug: string; classId: string }
}) {
  const { slug, classId } = params
  const competition = await getAdminCompetition(slug)
  return (
    <ClassAttendanceView
      slug={slug}
      classId={classId}
      competitionName={competition.name}
    />
  )
}
