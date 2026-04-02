import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function buildKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

export function encryptStoredPin(pin: string, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', buildKey(secret), iv)
  const ciphertext = Buffer.concat([cipher.update(pin, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}.${authTag.toString('hex')}.${ciphertext.toString('hex')}`
}

export function decryptStoredPin(ciphertext: string | null | undefined, secret: string): string | null {
  if (!ciphertext) return null

  const [ivHex, authTagHex, encryptedHex] = ciphertext.split('.')
  if (!ivHex || !authTagHex || !encryptedHex) {
    return null
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      buildKey(secret),
      Buffer.from(ivHex, 'hex'),
    )
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ])

    return plaintext.toString('utf8')
  } catch {
    return null
  }
}