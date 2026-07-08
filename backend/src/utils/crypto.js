import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

function getMasterSecret() {
  const secret = process.env.AI_CONFIG_MASTER_SECRET || process.env.JWT_SECRET
  if (!secret) {
    throw new Error('AI_CONFIG_MASTER_SECRET is required to encrypt AI provider keys')
  }
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptString(value) {
  if (!value || typeof value !== 'string') return null

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterSecret(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: encrypted.toString('base64')
  }
}

export function decryptString(payload) {
  if (!payload?.iv || !payload?.authTag || !payload?.ciphertext) return ''

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getMasterSecret(),
    Buffer.from(payload.iv, 'base64')
  )
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final()
  ])

  return decrypted.toString('utf8')
}
