import express from 'express'
import { register, login, getUserById, checkEmailExists, updateUserRole, updateProfile, resetOwnPassword } from '../services/authService.js'
import { generateResetToken, verifyResetToken, resetPassword } from '../services/passwordService.js'
import { sendResetPasswordEmail } from '../services/emailService.js'
import { generateToken } from '../middleware/auth.js'
import { validate, sendOtpSchema, verifyRegistrationSchema, loginSchema } from '../middleware/validation.js'
import { requestRegistrationOtp, verifyRegistrationOtp } from '../services/otpService.js'
import { authenticate } from '../middleware/auth.js'
import { findOrCreateSamagamaUser } from '../services/samagamaService.js'

const router = express.Router()

// Strong password: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char
const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/

// Direct Registration (Single-Step)
// Validates password complexity: must contain uppercase, lowercase, number, and special character.
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body
    
    // Password Validation
    if (!password || !passwordRegex.test(password)) {
      return res.status(400).json({ 
        error: 'Invalid password. Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.' 
      })
    }

    if (await checkEmailExists(email)) {
      return res.status(400).json({ error: 'Email already registered' })
    }

    const user = await register(name, email, password, role)
    const token = generateToken(user._id)
    
    res.status(201).json({
      message: 'Registration successful',
      user: user.toJSON(),
      token
    })
  } catch (error) {
    res.status(500).json({ error: 'Registration failed: ' + error.message })
  }
})

// Step 1 — request a verification code for a not-yet-registered email.
router.post('/register/send-otp', validate(sendOtpSchema), async (req, res) => {
  try {
    const { email, name } = req.validatedBody
    if (await checkEmailExists(email)) {
      return res.status(400).json({ error: 'Email already registered' })
    }
    const { expiresInSec } = await requestRegistrationOtp(email, name)
    res.json({ message: 'Verification code sent to your email', expiresInSec })
  } catch (error) {
    // COOLDOWN / SEND_CAP are client-actionable (429 with the real message); anything else is a
    // server/email failure (500, generic message — don't leak internals).
    const status = (error.code === 'COOLDOWN' || error.code === 'SEND_CAP') ? 429 : 500
    res.status(status).json({ error: status === 500 ? 'Failed to send verification code' : error.message })
  }
})

// Step 2 — verify the code and create the account.
router.post('/register/verify', validate(verifyRegistrationSchema), async (req, res) => {
  try {
    const { name, email, password, role, otp } = req.validatedBody
    await verifyRegistrationOtp(email, otp) // throws on invalid/expired/too-many-attempts
    const user = await register(name, email, password, role) // creates the (now email-verified) account
    const token = generateToken(user._id)
    res.status(201).json({
      message: 'Registration successful',
      user: user.toJSON(),
      token
    })
  } catch (error) {
    let status
    if (error.code === 'ATTEMPTS') status = 429
    else if (error.code === 'INVALID' || error.code === 'MISMATCH') status = 400
    else status = error.message === 'Email already registered' ? 400 : 500
    res.status(status).json({ error: status === 500 ? 'Registration failed' : error.message })
  }
})

// Login
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.validatedBody
    const user = await login(email, password)
    const token = generateToken(user._id)

    res.json({
      message: 'Login successful',
      user: user.toJSON(),
      token
    })
  } catch (error) {
    res.status(401).json({ error: error.message })
  }
})

// Update user role (called after registration role selection)
router.put('/role', authenticate, async (req, res) => {
  try {
    const { role } = req.body
    if (!['teacher', 'student'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' })
    }
    
    const user = await updateUserRole(req.user._id, role)
    res.json({ 
      message: 'Role updated successfully',
      user 
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    res.json({ user: req.user })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Check email availability
router.get('/check-email/:email', async (req, res) => {
  try {
    const exists = await checkEmailExists(req.params.email)
    res.json({ available: !exists })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Forgot password - send reset email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }
    
    // Check if user exists
    const user = await checkEmailExists(email)
    if (!user) {
      // Don't reveal whether email exists for security
      return res.json({ message: 'If an account exists with this email, a reset link has been sent.' })
    }
    
    // Get user object for the email
    const { getUserByEmail } = await import('../services/authService.js')
    const userObj = await getUserByEmail(email)
    
    // Generate reset token
    const token = await generateResetToken(email)
    
    // Send reset email
    await sendResetPasswordEmail(email, token)
    
    res.json({ message: 'If an account exists with this email, a reset link has been sent.' })
  } catch (error) {
    console.error('Forgot password error:', error)
    res.status(500).json({ error: 'Failed to process request' })
  }
})

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body
    
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' })
    }
    
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ error: 'Password must contain: 1 uppercase, 1 lowercase, 1 digit, 1 special character (min 8 chars)' })
    }
    
    // Verify token and reset password
    await resetPassword(token, password)
    
    res.json({ message: 'Password has been reset successfully. You can now login with your new password.' })
  } catch (error) {
    res.status(400).json({ error: error.message || 'Invalid or expired token' })
  }
})

// Update user profile
router.put('/profile', authenticate, async (req, res) => {
  try {
    const updatedUser = await updateProfile(req.user._id, req.body)
    res.json({ 
      message: 'Profile updated successfully',
      user: updatedUser.toJSON()
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Reset own password (requires old password verification)
router.put('/password', authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body
    
    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All password fields are required' })
    }
    
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain: 1 uppercase, 1 lowercase, 1 digit, 1 special character (min 8 chars)' })
    }
    
    if (oldPassword === newPassword) {
      return res.status(400).json({ error: 'New password cannot be the same as current password' })
    }
    
    await resetOwnPassword(req.user._id, oldPassword, newPassword)
    
    res.json({ message: 'Password updated successfully' })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// ==========================================
// SAMAGAMA SEAMLESS SSO
// User visits https://samagama.in/spandan/ while logged into Samagama.
// Frontend calls Samagama API, then sends user data here for auto-provisioning.
// ==========================================

router.post('/samagama-auto-login', async (req, res) => {
  try {
    const { email, name, isAdmin, isSuperAdmin } = req.body

    if (!email || !name) {
      return res.status(400).json({ error: 'Missing required user data from Samagama' })
    }

    // Build Samagama user object from the data frontend sent
    const samagamaUser = {
      email,
      name,
      isAdmin: isAdmin || false,
      isSuperAdmin: isSuperAdmin || false
    }

    // Find or create user in Spandan
    const user = await findOrCreateSamagamaUser(samagamaUser)

    // Generate Spandan JWT
    const token = generateToken(user._id)

    console.log(`Samagama auto-login: ${email} (${user.role})`)

    res.json({
      message: 'Auto-login successful',
      user: user.toJSON(),
      token
    })
  } catch (error) {
    console.error('Samagama auto-login error:', error.message)
    res.status(500).json({ error: error.message || 'Auto-login failed' })
  }
})

export default router