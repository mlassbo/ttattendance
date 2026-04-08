import { redirect } from 'next/navigation'

export default async function PlayerSearchPage({
  params,
}: {
  params: { slug: string }
}) {
  redirect(`/${params.slug}/search`)
}