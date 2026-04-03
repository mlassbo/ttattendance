import { revalidatePath } from 'next/cache'

export function revalidateCompetitionPaths(slug?: string) {
  revalidatePath('/')

  if (!slug) {
    return
  }

  revalidatePath(`/${slug}`)
  revalidatePath(`/${slug}/player`)
  revalidatePath(`/${slug}/admin`)
}