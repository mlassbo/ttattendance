import { requireAdminAuth } from '../auth'
import AdminDashboard from './AdminDashboard'

export default async function AdminDashboardPage({
  params,
}: {
  params: { slug: string }
}) {
  const { slug } = params
  await requireAdminAuth(slug)
  return <AdminDashboard slug={slug} />
}
