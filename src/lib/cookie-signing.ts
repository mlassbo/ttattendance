// Edge-compatible HMAC signing for role cookies.
// Uses Web Crypto API only — works in both Edge Middleware and Node.js (18+).

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const pairs = hex.match(/.{2}/g)
  if (!pairs) return new Uint8Array(0)
  return new Uint8Array(pairs.map(h => parseInt(h, 16)))
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

/** Returns `"<value>.<hex-signature>"`. */
export async function signCookie(value: string, secret: string): Promise<string> {
  const key = await importKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return `${value}.${toHex(sig)}`
}

/**
 * Verifies a signed cookie produced by `signCookie`.
 * Returns the original value on success, or `null` if tampered / malformed.
 * Uses `crypto.subtle.verify` for constant-time comparison.
 */
export async function verifyCookie(signed: string, secret: string): Promise<string | null> {
  const dot = signed.lastIndexOf('.')
  if (dot === -1) return null

  const value = signed.substring(0, dot)
  const sig = fromHex(signed.substring(dot + 1))
  if (sig.length === 0) return null

  const key = await importKey(secret)
  const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(value))
  return valid ? value : null
}
