import crypto from 'crypto'

const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16

function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error('ENCRYPTION_KEY is required to encrypt AI provider keys')
  }

  if (Buffer.byteLength(key, 'utf8') !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes')
  }

  return Buffer.from(key, 'utf8')
}

export function encrypt(value) {
  if (!value || typeof value !== 'string') return null

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])

  return `${iv.toString('base64')}:${encrypted.toString('base64')}`
}

export function decrypt(hash) {
  if (!hash || typeof hash !== 'string') return ''

  const [ivBase64, ciphertextBase64] = hash.split(':')
  if (!ivBase64 || !ciphertextBase64) {
    throw new Error('Malformed encrypted value')
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivBase64, 'base64')
  )

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, 'base64')),
    decipher.final()
  ])

  return decrypted.toString('utf8')
}

export const encryptString = encrypt
export const decryptString = decrypt
