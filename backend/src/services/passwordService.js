import crypto from 'crypto'

// In-memory store for reset tokens (in production, use Redis or DB)
const resetTokens = new Map()

// In-memory store for email verification (in production, use DB)
const verificationTokens = new Map()

export const generateResetToken = (email) => {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = Date.now() + 3600000 // 1 hour
  
  resetTokens.set(token, { email, expires })
  
  // Clean up expired tokens
  for (const [key, value] of resetTokens.entries()) {
    if (value.expires < Date.now()) {
      resetTokens.delete(key)
    }
  }
  
  return token
}

export const verifyResetToken = (token) => {
  const data = resetTokens.get(token)
  
  if (!data) {
    return { valid: false, message: 'Invalid or expired token' }
  }
  
  if (data.expires < Date.now()) {
    resetTokens.delete(token)
    return { valid: false, message: 'Token has expired' }
  }
  
  return { valid: true, email: data.email }
}

export const resetPassword = async (token, newPassword) => {
  const { valid, email, message } = verifyResetToken(token)
  
  if (!valid) {
    throw new Error(message)
  }
  
  // Import User model
  const User = (await import('../models/User.js')).default
  
  const user = await User.findOne({ email })
  
  if (!user) {
    throw new Error('User not found')
  }
  
  user.password = newPassword
  await user.save()
  
  // Delete the used token
  resetTokens.delete(token)
  
  return true
}

export const generateVerificationToken = (userId) => {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = Date.now() + 86400000 // 24 hours
  
  verificationTokens.set(token, { userId, expires })
  
  return token
}

export const verifyEmail = async (token) => {
  const data = verificationTokens.get(token)
  
  if (!data) {
    return { valid: false, message: 'Invalid or expired token' }
  }
  
  if (data.expires < Date.now()) {
    verificationTokens.delete(token)
    return { valid: false, message: 'Token has expired' }
  }
  
  const User = (await import('../models/User.js')).default
  const user = await User.findById(data.userId)
  
  if (!user) {
    return { valid: false, message: 'User not found' }
  }
  
  user.isVerified = true
  await user.save()
  
  verificationTokens.delete(token)
  
  return { valid: true, user }
}