import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

// TEMPORARY debug endpoint — remove after diagnosis
export async function GET() {
  const hash = process.env.SUPERADMIN_PIN_HASH ?? '(not set)'
  const secret = process.env.COOKIE_SECRET ?? '(not set)'

  const testResult = hash !== '(not set)'
    ? await bcrypt.compare('8568', hash).catch(e => `bcrypt error: ${e.message}`)
    : false

  return NextResponse.json({
    hashPresent: hash !== '(not set)',
    hashLength: hash.length,
    hashPrefix: hash.substring(0, 7),
    secretPresent: secret !== '(not set)',
    secretLength: secret.length,
    pinMatchesHash: testResult,
  })
}
