import express from 'express'
import { register, login, getUserById, checkEmailExists, updateProfile, resetOwnPassword } from '../services/authService.js'
import { generateResetToken, verifyResetToken, resetPassword } from '../services/passwordService.js'
import { sendResetPasswordEmail } from '../services/emailService.js'
import { generateToken } from '../middleware/auth.js'
import { validate, sendOtpSchema, verifyRegistrationSchema, loginSchema } from '../middleware/validation.js'
import { requestRegistrationOtp, verifyRegistrationOtp } from '../services/otpService.js'
import { authenticate } from '../middleware/auth.js'
import { publicRoute } from '../middleware/routePolicy.js'
import { findOrCreateSamagamaUser, verifySamagamaToken } from '../services/samagamaService.js'

const router = express.Router()

// Strong password: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char
const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/

// Registration is email-OTP verified (two steps). There is intentionally NO single-step /register:
// an account is created only after the emailed 6-digit code is verified, so the email is proven to
// belong to the registrant (blocks fake/typo/bot signups).

// Step 1 — request a verification code for a not-yet-registered email.
router.post('/register/send-otp', publicRoute, validate(sendOtpSchema), async (req, res) => {
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
router.post('/register/verify', publicRoute, validate(verifyRegistrationSchema), async (req, res) => {
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
router.post('/login', publicRoute, validate(loginSchema), async (req, res) => {
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

// NOTE: there is deliberately no endpoint for changing a user's own role. Role is decided once, at
// the point of provisioning — by the registrant in /register/verify, or by Samagama's admin flags in
// /samagama-auto-login (which never re-evaluates it on later logins, to prevent elevation). A
// self-service PUT /role existed here and let any student promote itself to teacher, which is the
// key to every `role === 'teacher'` gate in the codebase. Role changes belong in an admin path with
// its own authorization, not in a route the subject of the change can call.

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    res.json({ user: req.user })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// NOTE: there is deliberately no public "is this email registered?" endpoint. One existed here and
// answered for any address, unauthenticated and unmetered — a clean account-enumeration oracle, and
// the first step of the SSO-placeholder takeover reported in August. Registration does not need it:
// /register/send-otp performs the same check internally and is the only place the answer is given,
// behind otpLimiter and only to someone who can trigger a mail to that address.

// Forgot password - send reset email
router.post('/forgot-password', publicRoute, async (req, res) => {
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
router.post('/reset-password', publicRoute, async (req, res) => {
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

router.post('/samagama-auto-login', publicRoute, async (req, res) => {
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