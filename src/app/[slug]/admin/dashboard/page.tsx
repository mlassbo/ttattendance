import { getAdminCompetition } from '../auth'
import AdminDashboard from './AdminDashboard'

export default async function AdminDashboardPage({
  params,
}: {
  params: { slug: string }
}) {
  const { slug } = params
  const competition = await getAdminCompetition(slug)
  return <AdminDashboard slug={slug} competitionName={competition.name} />
}
