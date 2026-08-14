import crypto from 'crypto'
import PasswordResetToken from '../models/PasswordResetToken.js'

const TOKEN_EXPIRY_MS = 3600000 // 1 hour
const hashToken = (rawToken) => crypto.createHash('sha256').update(String(rawToken)).digest('hex')

export const generateResetToken = async (email) => {
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expires = new Date(Date.now() + TOKEN_EXPIRY_MS)
  
  await PasswordResetToken.findOneAndDelete({ email: email.toLowerCase() })
  
  const resetToken = new PasswordResetToken({
    email: email.toLowerCase(),
    token: tokenHash,
    expires
  })
  
  await resetToken.save()
  
  // Clean up all expired tokens
  await PasswordResetToken.deleteMany({ expires: { $lt: new Date() } })
  
  return token
}

export const verifyResetToken = async (token) => {
  const tokenHash = hashToken(token)
  const resetToken = await PasswordResetToken.findOne({ token: tokenHash })
  
  if (!resetToken) {
    return { valid: false, message: 'Invalid or expired token' }
  }
  
  if (resetToken.expires < new Date()) {
    await PasswordResetToken.findByIdAndDelete(resetToken._id)
    return { valid: false, message: 'Token has expired' }
  }
  
  if (resetToken.used) {
    return { valid: false, message: 'Token has already been used' }
  }
  
  return { valid: true, email: resetToken.email }
}

export const resetPassword = async (token, newPassword) => {
  const { valid, email, message } = await verifyResetToken(token)
  
  if (!valid) {
    throw new Error(message)
  }
  
  const User = (await import('../models/User.js')).default
  
  const user = await User.findOne({ email })
  
  if (!user) {
    throw new Error('User not found')
  }
  
  user.password = newPassword
  await user.save()
  
  // Mark token as used
  const tokenHash = hashToken(token)
  await PasswordResetToken.findOneAndUpdate({ token: tokenHash }, { used: true })
  
  return true
}

// Periodic cleanup for expired tokens (call this periodically)
export const cleanupExpiredTokens = async () => {
  const result = await PasswordResetToken.deleteMany({ expires: { $lt: new Date() } })
  return result.deletedCount
}