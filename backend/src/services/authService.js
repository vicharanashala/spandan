import User from '../models/User.js'
import { sendWelcomeEmail } from './emailService.js'

// Every Samagama-SSO account provisioned before samagamaService switched to a random password was
// created with this exact literal, hashed like a real password. The string is public (it is in this
// repository's history), so those accounts are all logged-in-able by anyone who knows the email.
// New accounts no longer use it, but the old hashes remain in the database, so the credential is
// refused here — for every account, unconditionally. It was never a password anyone chose.
const LEGACY_SSO_PLACEHOLDER_PASSWORD = 'samagama-sso-placeholder'

export const register = async (name, email, password, role) => {
  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() })
  if (existingUser) {
    throw new Error('Email already registered')
  }

  // Create new user
  const user = new User({
    name,
    email: email.toLowerCase(),
    password,
    role
  })

  await user.save()
  
  // Send welcome email asynchronously (don't block the response)
  sendWelcomeEmail(email, name, role).catch(err => {
    console.error('Failed to send welcome email:', err.message)
  })
  
  return user
}

export const login = async (email, password) => {
  if (password === LEGACY_SSO_PLACEHOLDER_PASSWORD) {
    throw new Error('Invalid email or password')
  }

  const user = await User.findOne({ email: email.toLowerCase() })
  if (!user) {
    throw new Error('Invalid email or password')
  }

  const isMatch = await user.comparePassword(password)
  if (!isMatch) {
    throw new Error('Invalid email or password')
  }

  return user
}

export const getUserById = async (id) => {
  const user = await User.findById(id).select('-password')
  if (!user) {
    throw new Error('User not found')
  }
  return user
}

export const getUserByEmail = async (email) => {
  return User.findOne({ email: email.toLowerCase() }).select('-password')
}

export const updatePassword = async (userId, newPassword) => {
  const user = await User.findById(userId)
  if (!user) {
    throw new Error('User not found')
  }

  user.password = newPassword
  await user.save()
  return true
}

export const checkEmailExists = async (email) => {
  const user = await User.findOne({ email: email.toLowerCase() })
  return !!user
}

export const resetOwnPassword = async (userId, oldPassword, newPassword) => {
  const user = await User.findById(userId)
  if (!user) {
    throw new Error('User not found')
  }

  const isMatch = await user.comparePassword(oldPassword)
  if (!isMatch) {
    throw new Error('Current password is incorrect')
  }

  user.password = newPassword
  await user.save()
  return true
}

export const updateUserRole = async (userId, role) => {
  const user = await User.findById(userId)
  if (!user) {
    throw new Error('User not found')
  }
  
  user.role = role
  await user.save()
  return user
}

export const updateProfile = async (userId, profileData) => {
  const user = await User.findById(userId)
  if (!user) {
    throw new Error('User not found')
  }

  // Allowed fields to update
  const allowedFields = [
    'name', 'profileImage', 'phone', 'bio', 'dateOfBirth', 'gender',
    'address', 'socialLinks', 'enrollmentNumber', 'class',
    'department', 'employeeId', 'qualifications'
  ]

  for (const field of allowedFields) {
    if (profileData[field] !== undefined) {
      user[field] = profileData[field]
    }
  }

  // Handle nested address object
  if (profileData.address) {
    user.address = { ...user.address.toObject(), ...profileData.address }
  }

  // Handle nested socialLinks object
  if (profileData.socialLinks) {
    user.socialLinks = { ...user.socialLinks.toObject(), ...profileData.socialLinks }
  }

  await user.save()
  return user
}
