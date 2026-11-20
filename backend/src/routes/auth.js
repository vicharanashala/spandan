
import express from 'express'
import {
  register,
  login,
  getUserById,
  checkEmailExists,
  updateProfile,
  resetOwnPassword
} from '../services/authService.js'
import {
  generateResetToken,
  verifyResetToken,
  resetPassword
} from '../services/passwordService.js'
import { sendResetPasswordEmail } from '../services/emailService.js'
import { generateToken } from '../middleware/auth.js'
import {
  validate,
  sendOtpSchema,
  verifyRegistrationSchema,
  loginSchema
} from '../middleware/validation.js'
import {
  requestRegistrationOtp,
  verifyRegistrationOtp
} from '../services/otpService.js'
import {
  authenticate,
  authenticateAllowPendingTerms,
  invalidateUserCache
} from '../middleware/auth.js'
import { TERMS_VERSION } from '../config/terms.js'
import User from '../models/User.js'
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

// Strong password: minimum 8 characters, with uppercase, lowercase,
// digit, and special character.
const passwordRegex =
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/

// Registration is email-OTP verified. An account is created only after
// the emailed verification code is verified.

// Step 1: Request a verification code.
router.post('/register/send-otp', validate(sendOtpSchema), async (req, res) => {
  try {
    const { email, name } = req.validatedBody

    if (await checkEmailExists(email)) {
      return res.status(400).json({ error: 'Email already registered' })
    }

    const { expiresInSec } = await requestRegistrationOtp(email, name)

    return res.json({
      message: 'Verification code sent to your email',
      expiresInSec
    })
  } catch (error) {
    console.error('[send-otp] ERROR:', error.code, '-', error.message)
    console.error(error)

    const status =
      error.code === 'COOLDOWN' || error.code === 'SEND_CAP' ? 429 : 500

    return res.status(status).json({
      error: status === 500
        ? 'Failed to send verification code'
        : error.message
    })
  }
})

// Step 2: Verify the code and create the account.
router.post('/register/verify', validate(verifyRegistrationSchema), async (req, res) => {
  try {
    const { name, email, password, role, otp } = req.validatedBody

    await verifyRegistrationOtp(email, otp)
    const user = await register(name, email, password, role)

    // Teachers must wait for admin approval.
    if (user.role === 'teacher') {
      return res.status(202).json({
        pendingApproval: true,
        message:
          'Registration successful. Your teacher account is pending admin approval. You will be able to sign in once an administrator approves it.'
      })
    }

    const token = generateToken(user._id)

    return res.status(201).json({
      message: 'Registration successful',
      user: user.toJSON(),
      token
    })
  } catch (error) {
    console.error('[register/verify] ERROR:', error.code, '-', error.message)

    let status

    if (error.code === 'ATTEMPTS') status = 429
    else if (error.code === 'INVALID' || error.code === 'MISMATCH') status = 400
    else status = error.message === 'Email already registered' ? 400 : 500

    return res.status(status).json({
      error: status === 500 ? 'Registration failed' : error.message
    })
  }
})

// Login.
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.validatedBody
    const user = await login(email, password)

    // Teachers cannot log in until approved.
    if (user.role === 'teacher' && user.teacherApprovalStatus !== 'approved') {
      const message = user.teacherApprovalStatus === 'rejected'
        ? 'Your teacher account request was not approved. Please contact the administrator.'
        : 'Your teacher account is awaiting admin approval. Please try signing in again once it is approved.'

      return res.status(403).json({
        error: message,
        code: 'TEACHER_NOT_APPROVED',
        status: user.teacherApprovalStatus
      })
    }

    const token = generateToken(user._id)

    return res.json({
      message: 'Login successful',
      user: user.toJSON(),
      token
    })
  } catch (error) {
    return res.status(401).json({ error: error.message })
  }
})

// Prevent users from changing their own role.
router.put('/role', authenticate, (req, res) => {
  return res.status(403).json({ error: 'Role modification is disabled' })
})

// Get the current user, including users who must accept updated terms.
router.get('/me', authenticateAllowPendingTerms, async (req, res) => {
  try {
    return res.json({ user: req.user })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

// Record acceptance of the current Terms of Use.
router.post('/accept-terms', authenticateAllowPendingTerms, async (req, res) => {
  try {
    if (req.body?.acceptTerms !== true) {
      return res.status(400).json({
        error: 'You must accept the Terms of Use to continue'
      })
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          termsVersion: TERMS_VERSION,
          termsAcceptedAt: new Date()
        }
      },
      { new: true }
    ).select('-password')

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    invalidateUserCache(user._id)

    return res.json({ user })
  } catch (error) {
    console.error('Accept terms error:', error.message)

    return res.status(500).json({
      error: 'Could not record acceptance, please try again'
    })
  }
})

// The unauthenticated GET /check-email/:email endpoint is intentionally removed
// to prevent account enumeration.

// Forgot password.
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const userExists = await checkEmailExists(email)

    // Do not reveal whether the email exists.
    if (!userExists) {
      return res.json({
        message: 'If an account exists with this email, a reset link has been sent.'
      })
    }

    const { getUserByEmail } = await import('../services/authService.js')
    await getUserByEmail(email)

    const token = await generateResetToken(email)
    await sendResetPasswordEmail(email, token)

    return res.json({
      message: 'If an account exists with this email, a reset link has been sent.'
    })
  } catch (error) {
    console.error('Forgot password error:', error)

    return res.status(500).json({ error: 'Failed to process request' })
  }
})

// Reset password with token.
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body

    if (!token || !password) {
      return res.status(400).json({
        error: 'Token and new password are required'
      })
    }

    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        error:
          'Password must contain: 1 uppercase, 1 lowercase, 1 digit, 1 special character (min 8 chars)'
      })
    }

    await resetPassword(token, password)

    return res.json({
      message:
        'Password has been reset successfully. You can now login with your new password.'
    })
  } catch (error) {
    return res.status(400).json({
      error: error.message || 'Invalid or expired token'
    })
  }
})

// Update user profile.
router.put('/profile', authenticate, async (req, res) => {
  try {
    const updatedUser = await updateProfile(req.user._id, req.body)

    return res.json({
      message: 'Profile updated successfully',
      user: updatedUser.toJSON()
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

// Reset own password after verifying the old password.
router.put('/password', authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        error: 'All password fields are required'
      })
    }

    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        error:
          'Password must contain: 1 uppercase, 1 lowercase, 1 digit, 1 special character (min 8 chars)'
      })
    }

    if (oldPassword === newPassword) {
      return res.status(400).json({
        error: 'New password cannot be the same as current password'
      })
    }

    await resetOwnPassword(req.user._id, oldPassword, newPassword)

    return res.json({ message: 'Password updated successfully' })
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

// Google OAuth: start authorization.
router.get('/google', (req, res) => {
  if (!isGoogleOAuthConfigured()) {
    return res.status(503).json({
      error: 'Google sign-in is not configured'
    })
  }

  const role = req.query.role === 'teacher' ? 'teacher' : 'student'
  const state = signState(role)

  return res.redirect(buildConsentUrl(state))
})

// Google OAuth callback.
router.get('/google/callback', async (req, res) => {
  const base = `${config.frontendUrl}/auth/callback`

  try {
    if (!isGoogleOAuthConfigured()) {
      return res.redirect(
        `${base}#error=${encodeURIComponent('Google sign-in is not configured')}`
      )
    }

    const { code, state, error: googleError } = req.query

    if (googleError) {
      return res.redirect(
        `${base}#error=${encodeURIComponent('Google sign-in was cancelled')}`
      )
    }

    if (!code || !state) {
      return res.redirect(
        `${base}#error=${encodeURIComponent('Missing authorization code')}`
      )
    }

    let role

    try {
      ;({ role } = verifyState(state))
    } catch {
      return res.redirect(
        `${base}#error=${encodeURIComponent('Sign-in session expired, please try again')}`
      )
    }

    const profile = await exchangeCodeForProfile(code)
    const user = await findGoogleUser(profile)

    // A new Google user must choose a role before registration is finalized.
    if (!user) {
      const reg = signPendingRegistration(profile, role)

      return res.redirect(
        `${base}#status=needs_role&reg=${encodeURIComponent(reg)}&hint=${encodeURIComponent(role)}`
      )
    }

    // Pending or rejected teachers receive no token.
    if (user.role === 'teacher' && user.teacherApprovalStatus !== 'approved') {
      return res.redirect(`${base}#status=pending_teacher`)
    }

    const token = generateToken(user._id)

    console.log(`Google sign-in: ${user.email} (${user.role})`)

    return res.redirect(`${base}#token=${encodeURIComponent(token)}`)
  } catch (error) {
    const status = error.status || 500

    if (status >= 500) {
      console.error('Google OAuth callback error:', error.message)
    }

    const message =
      status >= 500
        ? 'Google sign-in failed, please try again'
        : error.message

    return res.redirect(
      `${base}#error=${encodeURIComponent(message)}`
    )
  }
})

// Complete first-time Google registration after role and terms acceptance.
router.post('/google/complete', async (req, res) => {
  try {
    if (!isGoogleOAuthConfigured()) {
      return res.status(503).json({
        error: 'Google sign-in is not configured'
      })
    }

    const { reg, role, acceptTerms } = req.body || {}

    if (!reg) {
      return res.status(400).json({ error: 'Missing registration session' })
    }

    if (role !== 'teacher' && role !== 'student') {
      return res.status(400).json({ error: 'Please choose a valid role' })
    }

    // A first-time Google account must accept the Terms of Use.
    if (acceptTerms !== true) {
      return res.status(400).json({
        error: 'You must accept the Terms of Use to register'
      })
    }

    let profile

    try {
      profile = verifyPendingRegistration(reg)
    } catch {
      return res.status(400).json({
        error: 'Your sign-up session expired, please try again'
      })
    }

    const user = await createGoogleUser(profile, role)

    // A new teacher is created pending admin approval and receives no token.
    if (user.role === 'teacher' && user.teacherApprovalStatus !== 'approved') {
      return res.status(202).json({ status: 'pending_teacher' })
    }

    const token = generateToken(user._id)

    console.log(`Google sign-up completed: ${user.email} (${user.role})`)

    return res.json({ token })
  } catch (error) {
    console.error('Google /complete error:', error.message)

    return res.status(500).json({
      error: 'Sign-up could not be completed, please try again'
    })
  }
})

export default router
