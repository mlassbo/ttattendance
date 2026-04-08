import { redirect } from 'next/navigation'

export default async function PrivatePlayerClassesPage({
  params,
}: {
  params: { slug: string; playerId: string }
}) {
  redirect(`/${params.slug}/players/${params.playerId}`)
}