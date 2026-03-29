import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { signCookie } from '@/lib/cookie-signing'

export async function POST(req: NextRequest) {
  const { pin } = await req.json()

  const hash = process.env.SUPERADMIN_PIN_HASH
  const secret = process.env.COOKIE_SECRET
  if (!hash || !secret) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const valid = await bcrypt.compare(String(pin), hash)
  if (!valid) {
    return NextResponse.json({ error: 'Felaktig PIN' }, { status: 401 })
  }

  const signed = await signCookie('superadmin', secret)
  const response = NextResponse.json({ ok: true })
  response.cookies.set('role', signed, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  })
  return response
}
