import express from 'express'
import { register, login, getUserById, checkEmailExists, updateProfile, resetOwnPassword } from '../services/authService.js'
import { generateResetToken, verifyResetToken, resetPassword } from '../services/passwordService.js'
import { sendResetPasswordEmail } from '../services/emailService.js'
import { generateToken } from '../middleware/auth.js'
import { validate, sendOtpSchema, verifyRegistrationSchema, loginSchema } from '../middleware/validation.js'
import { requestRegistrationOtp, verifyRegistrationOtp } from '../services/otpService.js'
import { authenticate } from '../middleware/auth.js'
import { findOrCreateSamagamaUser, verifySamagamaToken } from '../services/samagamaService.js'

const router = express.Router()

// Strong password: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char
const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/

// Registration is email-OTP verified (two steps). There is intentionally NO single-step /register:
// an account is created only after the emailed 6-digit code is verified, so the email is proven to
// belong to the registrant (blocks fake/typo/bot signups).

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

    // Teacher accounts are NOT auto-logged-in: they require admin approval first. We issue
    // no token and return a pendingApproval flag so the client sends the registrant back to
    // the login screen with an "admin approval pending" message. Students log in immediately.
    if (user.role === 'teacher') {
      return res.status(202).json({
        pendingApproval: true,
        message: 'Registration successful. Your teacher account is pending admin approval. You will be able to sign in once an administrator approves it.'
      })
    }

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

    // A teacher who is not yet approved (or was rejected) is refused a token and bounced back
    // to the login screen with a clear message, rather than landing in the teacher dashboard.
    if (user.role === 'teacher' && user.teacherApprovalStatus !== 'approved') {
      const message = user.teacherApprovalStatus === 'rejected'
        ? 'Your teacher account request was not approved. Please contact the administrator.'
        : 'Your teacher account is awaiting admin approval. Please try signing in again once it is approved.'
      return res.status(403).json({ error: message, code: 'TEACHER_NOT_APPROVED', status: user.teacherApprovalStatus })
    }

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

// SECURITY FIX: Disabled endpoint to prevent role escalation.
// Role is set once at registration (services/authService.js register()) or derived from
// Samagama SSO (services/samagamaService.js), and must never be updated via self-service afterward.
// Verified that there is no legitimate frontend caller (frontend authStore.js updateRole() only
// mutates local Zustand state and never calls /api/auth/role).
router.put('/role', authenticate, (req, res) => {
  return res.status(403).json({ error: 'Role modification is disabled' })
})

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    res.json({ user: req.user })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /check-email/:email removed: it was an unauthenticated account-enumeration oracle (returned
// whether an email is registered) with no callers. Email availability is covered by POST /register
// (returns "email already registered") and the OTP signup flow.

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
// The client sends its Samagama session token; the server verifies that token
// with Samagama and provisions the Spandan account from the identity Samagama
// returns. The client's own claims about email/name/admin are never trusted.
// ==========================================

router.post('/samagama-auto-login', async (req, res) => {
  try {
    // Accept the Samagama token from the Authorization header or the body.
    const authHeader = req.headers.authorization || ''
    const samagamaToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : (req.body && req.body.samagamaToken)

    // Verify the token with Samagama and use ONLY the identity it returns.
    const verifiedUser = await verifySamagamaToken(samagamaToken)

    // Find or create the Spandan user from the verified identity.
    const user = await findOrCreateSamagamaUser(verifiedUser)

    // Generate Spandan JWT
    const token = generateToken(user._id)

    console.log(`Samagama auto-login: ${verifiedUser.email} (${user.role})`)

    res.json({
      message: 'Auto-login successful',
      user: user.toJSON(),
      token
    })
  } catch (error) {
    const status = error.status || 500
    if (status >= 500) console.error('Samagama auto-login error:', error.message)
    res.status(status).json({
      error: status >= 500 ? 'Auto-login failed' : error.message
    })
  }
})

export default router