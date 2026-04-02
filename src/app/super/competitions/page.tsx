import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyCookie } from '@/lib/cookie-signing'
import CompetitionsView from './CompetitionsView'

export default async function CompetitionsPage() {
  const cookieStore = cookies()
  const secret = process.env.COOKIE_SECRET
  const signed = cookieStore.get('role')?.value
  const role = signed && secret ? await verifyCookie(signed, secret) : null

  if (role !== 'superadmin') {
    redirect('/super')
  }

  return <CompetitionsView />
}
