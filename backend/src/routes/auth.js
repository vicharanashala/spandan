import express from 'express'
import { register, login, getUserById, checkEmailExists, updateProfile, resetOwnPassword } from '../services/authService.js'
import { generateResetToken, verifyResetToken, resetPassword } from '../services/passwordService.js'
import { sendResetPasswordEmail } from '../services/emailService.js'
import { generateToken } from '../middleware/auth.js'
import { validate, sendOtpSchema, verifyRegistrationSchema, loginSchema } from '../middleware/validation.js'
import { requestRegistrationOtp, verifyRegistrationOtp } from '../services/otpService.js'
import { authenticate } from '../middleware/auth.js'
import {
  isGoogleOAuthConfigured,
  signState,
  verifyState,
  buildConsentUrl,
  exchangeCodeForProfile,
  findGoogleUser,
  createGoogleUser,
  signPendingRegistration,
  verifyPendingRegistration
} from '../services/googleService.js'
import { config } from '../config.js'

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
// Role is set once at registration (services/authService.js register()) and must never be
// updated via self-service afterward.
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
// GOOGLE OAUTH 2.0 — Authorization Code flow
// Browser hits /google (with the role picked on the AuthPage) -> we sign that role into a short-lived
// state and redirect to Google -> Google redirects back to /google/callback with a code -> we exchange
// the code server-side (client secret), verify the ID token, provision/link the user, and hand the
// result to the SPA's /auth/callback route. The client's own claims are never trusted.
// ==========================================

// Step 1 — begin sign-in. `role` is remembered inside the signed state (default student).
router.get('/google', (req, res) => {
  if (!isGoogleOAuthConfigured()) {
    return res.status(503).json({ error: 'Google sign-in is not configured' })
  }
  const role = req.query.role === 'teacher' ? 'teacher' : 'student'
  const state = signState(role)
  return res.redirect(buildConsentUrl(state))
})

// Step 2 — Google redirects here with ?code&state. Every outcome redirects back to the SPA's
// /auth/callback (never a raw JSON page): success carries the JWT in the URL fragment (which does
// not reach server logs); a new-but-unapproved teacher carries a pending flag; failures carry an
// error message.
router.get('/google/callback', async (req, res) => {
  const base = `${config.frontendUrl}/auth/callback`
  try {
    if (!isGoogleOAuthConfigured()) {
      return res.redirect(`${base}#error=${encodeURIComponent('Google sign-in is not configured')}`)
    }

    const { code, state, error: googleError } = req.query
    if (googleError) {
      return res.redirect(`${base}#error=${encodeURIComponent('Google sign-in was cancelled')}`)
    }
    if (!code || !state) {
      return res.redirect(`${base}#error=${encodeURIComponent('Missing authorization code')}`)
    }

    let role
    try {
      ;({ role } = verifyState(state))
    } catch {
      return res.redirect(`${base}#error=${encodeURIComponent('Sign-in session expired, please try again')}`)
    }

    const profile = await exchangeCodeForProfile(code)
    const user = await findGoogleUser(profile)

    // Brand-new user: don't guess a role. Hand a signed pending-registration token back to the SPA so
    // it can ask Student/Teacher, then finalize via POST /google/complete. `role` from the state is
    // only a preselect hint (whatever was picked on the AuthPage, defaulting to student).
    if (!user) {
      const reg = signPendingRegistration(profile, role)
      return res.redirect(`${base}#status=needs_role&reg=${encodeURIComponent(reg)}&hint=${encodeURIComponent(role)}`)
    }

    // A teacher who is not yet approved gets NO token — same as the email/password teacher flow.
    if (user.role === 'teacher' && user.teacherApprovalStatus !== 'approved') {
      return res.redirect(`${base}#status=pending_teacher`)
    }

    const token = generateToken(user._id)
    console.log(`Google sign-in: ${user.email} (${user.role})`)
    return res.redirect(`${base}#token=${encodeURIComponent(token)}`)
  } catch (error) {
    const status = error.status || 500
    if (status >= 500) console.error('Google OAuth callback error:', error.message)
    const msg = status >= 500 ? 'Google sign-in failed, please try again' : error.message
    return res.redirect(`${base}#error=${encodeURIComponent(msg)}`)
  }
})

// Finalize a first-time Google sign-up once the user has chosen a role. The `reg` token carries the
// Google-VERIFIED identity (signed by us in the callback); only the role is taken from the request.
router.post('/google/complete', async (req, res) => {
  try {
    if (!isGoogleOAuthConfigured()) {
      return res.status(503).json({ error: 'Google sign-in is not configured' })
    }
    const { reg, role } = req.body || {}
    if (!reg) return res.status(400).json({ error: 'Missing registration session' })
    if (role !== 'teacher' && role !== 'student') {
      return res.status(400).json({ error: 'Please choose a valid role' })
    }

    let profile
    try {
      profile = verifyPendingRegistration(reg)
    } catch {
      return res.status(400).json({ error: 'Your sign-up session expired, please try again' })
    }

    const user = await createGoogleUser(profile, role)

    // A new teacher is created pending admin approval and gets NO token.
    if (user.role === 'teacher' && user.teacherApprovalStatus !== 'approved') {
      return res.status(202).json({ status: 'pending_teacher' })
    }

    const token = generateToken(user._id)
    console.log(`Google sign-up completed: ${user.email} (${user.role})`)
    return res.json({ token })
  } catch (error) {
    console.error('Google /complete error:', error.message)
    return res.status(500).json({ error: 'Sign-up could not be completed, please try again' })
  }
})

export default router