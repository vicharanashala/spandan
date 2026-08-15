import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { sendWelcomeEmail } from './emailService.js'

// Read config at call-time (not module load) so it never depends on dotenv import ordering.
const cfg = () => ({
  clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || '',
  allowedHd: (process.env.GOOGLE_ALLOWED_HD || '').trim(),
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production'
})

// Google OAuth is only usable once the client id/secret/redirect are all set. Routes check this
// and return a clear 503 rather than throwing an opaque error when the feature is unconfigured.
export const isGoogleOAuthConfigured = () => {
  const c = cfg()
  return Boolean(c.clientId && c.clientSecret && c.redirectUri)
}

const client = () => {
  const c = cfg()
  return new OAuth2Client(c.clientId, c.clientSecret, c.redirectUri)
}

// The OAuth `state` is a short-lived signed JWT: unforgeable (HMAC over JWT_SECRET), self-expiring,
// and it carries the role the user picked on the AuthPage. Because it needs no server-side store, it
// works across multiple backend instances. `purpose` pins it to this flow so an ordinary app token
// cannot be replayed here.
const STATE_TTL = '10m'

export const signState = (role) =>
  jwt.sign({ role, purpose: 'google_oauth' }, cfg().jwtSecret, { expiresIn: STATE_TTL })

export const verifyState = (state) => {
  const decoded = jwt.verify(state, cfg().jwtSecret) // throws on tamper/expiry
  if (decoded.purpose !== 'google_oauth') {
    const e = new Error('Invalid OAuth state')
    e.status = 400
    throw e
  }
  return { role: decoded.role }
}

export const buildConsentUrl = (state) => {
  const c = cfg()
  return client().generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
    redirect_uri: c.redirectUri
  })
}

/**
 * Exchange the authorization code for tokens (server-side, using the client secret) and return the
 * SERVER-VERIFIED Google identity. This is the trust boundary — nothing the browser sent is believed.
 * @throws {Error} with a `.status` (401 unverified/no email, 403 disallowed domain, 502 no id token)
 */
export const exchangeCodeForProfile = async (code) => {
  const c = cfg()
  const { tokens } = await client().getToken(code)
  if (!tokens || !tokens.id_token) {
    const e = new Error('Google did not return an ID token')
    e.status = 502
    throw e
  }
  const ticket = await client().verifyIdToken({ idToken: tokens.id_token, audience: c.clientId })
  const p = ticket.getPayload()
  if (!p || !p.email) {
    const e = new Error('Google token did not resolve to an email')
    e.status = 401
    throw e
  }
  if (!p.email_verified) {
    const e = new Error('Your Google email address is not verified')
    e.status = 401
    throw e
  }
  if (c.allowedHd && p.hd !== c.allowedHd) {
    const e = new Error('This Google account is not permitted to sign in')
    e.status = 403
    throw e
  }
  return {
    sub: p.sub,
    email: p.email.toLowerCase(),
    emailVerified: p.email_verified,
    name: (p.name && p.name.trim()) || p.email.split('@')[0],
    picture: p.picture || ''
  }
}

/**
 * Resolve an EXISTING Spandan user for a verified Google identity, or return null if brand-new.
 * A returning Google user (matched by googleId) or an existing email/password user (matched by the
 * Google-verified email, then linked) is returned as-is — role is never changed for existing users.
 * We deliberately DO NOT create an account here: a first-time Google user is asked to pick their role
 * before the account is created (see createGoogleUser + the /google/complete route).
 * @returns {Promise<import('mongoose').Document | null>}
 */
export const findGoogleUser = async (profile) => {
  // 1. Already linked to this Google account.
  let user = await User.findOne({ googleId: profile.sub })
  if (user) return user

  // 2. An existing account with the same (verified) email — link Google to it so the user can use
  //    either method. We only reach here with a Google-verified email, so linking is safe.
  user = await User.findOne({ email: profile.email })
  if (user) {
    if (!user.googleId) {
      user.googleId = profile.sub
      await user.save()
    }
    return user
  }

  // 3. Brand-new — caller must ask for a role, then call createGoogleUser.
  return null
}

/**
 * Create a brand-new Spandan account for a verified Google identity with an explicitly chosen role.
 * A teacher pick is safe because a new teacher is created 'pending' (admin-approval gate), granting no
 * teacher privileges until approved. Idempotent against a double-submit: if the account was created in
 * the meantime (same googleId/email), the existing one is returned instead of erroring on the unique index.
 * @returns {Promise<import('mongoose').Document>}
 */
export const createGoogleUser = async (profile, requestedRole) => {
  // Guard a double-submit / race — if it now exists, reuse it (never create a duplicate).
  const existing = await findGoogleUser(profile)
  if (existing) return existing

  const role = requestedRole === 'teacher' ? 'teacher' : 'student'
  const user = new User({
    name: profile.name,
    email: profile.email,
    googleId: profile.sub,
    authProvider: 'google',
    role,
    teacherApprovalStatus: role === 'teacher' ? 'pending' : 'approved'
  })
  await user.save()

  // Welcome email is best-effort — never block or fail the sign-in on it.
  sendWelcomeEmail(user.email, user.name, role).catch(err =>
    console.error('Failed to send welcome email (google signup):', err.message)
  )

  return user
}

// A first-time Google user is handed back to the SPA to pick a role. We cannot re-verify with Google
// (the authorization code is single-use), so the SERVER-VERIFIED identity is carried in a short-lived
// signed token — HMAC over JWT_SECRET, so the browser cannot forge or alter the email/sub. `purpose`
// pins it to this step. The chosen role in /google/complete is trusted; everything else comes from here.
const PENDING_TTL = '15m'

export const signPendingRegistration = (profile, hintedRole) =>
  jwt.sign(
    { purpose: 'google_signup_pending', sub: profile.sub, email: profile.email, name: profile.name, hintedRole },
    cfg().jwtSecret,
    { expiresIn: PENDING_TTL }
  )

export const verifyPendingRegistration = (token) => {
  const decoded = jwt.verify(token, cfg().jwtSecret) // throws on tamper/expiry
  if (decoded.purpose !== 'google_signup_pending') {
    const e = new Error('Invalid registration session')
    e.status = 400
    throw e
  }
  return { sub: decoded.sub, email: decoded.email, name: decoded.name }
}
