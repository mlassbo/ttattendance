import { NextRequest, NextResponse } from 'next/server'
import { verifyCookie } from '@/lib/cookie-signing'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Login page is always accessible
  if (pathname === '/super') return NextResponse.next()

  const signed = req.cookies.get('role')?.value
  const secret = process.env.COOKIE_SECRET

  const role = signed && secret ? await verifyCookie(signed, secret) : null

  if (role !== 'superadmin') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/super', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/super/:path*', '/api/super/:path*'],
}
