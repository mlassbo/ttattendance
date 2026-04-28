import { NextRequest, NextResponse } from 'next/server'
import { verifyCookie } from '@/lib/cookie-signing'
import { verifyCompetitionCookie } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const secret = process.env.COOKIE_SECRET

  // ── Super admin routes ────────────────────────────────────────────────────
  // Login page is always accessible.
  if (pathname === '/super') return NextResponse.next()

  if (pathname.startsWith('/super/') || pathname.startsWith('/api/super/')) {
    const signed = req.cookies.get('role')?.value
    const role = signed && secret ? await verifyCookie(signed, secret) : null
    if (role !== 'superadmin') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/super', req.url))
    }
    return NextResponse.next()
  }

  // ── Admin API routes ──────────────────────────────────────────────────────
  // /api/admin/* require a valid competition cookie with role=admin.
  if (pathname.startsWith('/api/admin/')) {
    const signed = req.cookies.get('role')?.value
    const auth = signed && secret ? await verifyCompetitionCookie(signed, secret) : null
    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/super/:path*',
    '/api/super/:path*',
    '/api/admin/:path*',
  ],
}
