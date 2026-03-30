import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyCompetitionCookie } from '@/lib/auth'

/**
 * Server-component auth guard for admin pages.
 * Redirects to the admin PIN page if the cookie is missing, invalid,
 * belongs to a different competition, or has the wrong role.
 */
export async function requireAdminAuth(slug: string): Promise<void> {
  const cookieStore = cookies()
  const secret = process.env.COOKIE_SECRET
  const signed = cookieStore.get('role')?.value

  if (!signed || !secret) {
    redirect(`/${slug}/admin`)
  }

  const auth = await verifyCompetitionCookie(signed, secret)
  if (!auth || auth.slug !== slug || auth.role !== 'admin') {
    redirect(`/${slug}/admin`)
  }
}
