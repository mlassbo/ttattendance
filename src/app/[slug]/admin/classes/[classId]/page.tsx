import { requireAdminAuth } from '../../auth'
import ClassAttendanceView from './ClassAttendanceView'

export default async function AdminClassPage({
  params,
}: {
  params: { slug: string; classId: string }
}) {
  const { slug, classId } = params
  await requireAdminAuth(slug)
  return <ClassAttendanceView slug={slug} classId={classId} />
}
