import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const ONDATA_API_TOKEN_PREFIX = 'tta_ondata_'

export function extractBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null
  }

  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim())
  return match?.[1]?.trim() || null
}

export function generateOnDataApiToken(): string {
  return `${ONDATA_API_TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`
}

export function hashOnDataApiToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function verifyOnDataApiToken(token: string, expectedHash: string | null | undefined): boolean {
  if (!token || !expectedHash) {
    return false
  }

  const actualBuffer = Buffer.from(hashOnDataApiToken(token), 'hex')
  const expectedBuffer = Buffer.from(expectedHash, 'hex')

  if (actualBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(actualBuffer, expectedBuffer)
}

export function maskOnDataApiTokenLast4(token: string): string {
  return token.slice(-4)
}
