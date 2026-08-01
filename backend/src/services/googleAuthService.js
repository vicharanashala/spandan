import crypto from 'crypto'
import { OAuth2Client } from 'google-auth-library'
import User from '../models/User.js'
import { config } from '../config.js'

const googleClient = new OAuth2Client(config.googleClientId || undefined)

export class GoogleAuthError extends Error {
  constructor(message, code = 'GOOGLE_AUTH_FAILED') {
    super(message)
    this.name = 'GoogleAuthError'
    this.code = code
  }
}

function createUnusablePassword() {
  return `google:${crypto.randomBytes(32).toString('base64url')}`
}

export function normalizeGooglePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new GoogleAuthError('Invalid Google credential', 'INVALID_CREDENTIAL')
  }

  const subject = typeof payload.sub === 'string' ? payload.sub.trim() : ''
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  const emailVerified = payload.email_verified === true

  if (!subject || !email || !emailVerified) {
    throw new GoogleAuthError('Google account email is not verified', 'INVALID_CREDENTIAL')
  }

  const name = String(payload.name || payload.given_name || 'Google User').trim().slice(0, 100) || 'Google User'
  return {
    subject,
    email,
    name: name.length >= 2 ? name : `${name} User`,
    picture: typeof payload.picture === 'string' ? payload.picture : ''
  }
}

async function verifyGoogleCredential(credential) {
  if (!config.googleClientId) {
    throw new GoogleAuthError('Google authentication is not configured', 'GOOGLE_NOT_CONFIGURED')
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.googleClientId
    })
    return normalizeGooglePayload(ticket.getPayload())
  } catch (error) {
    if (error instanceof GoogleAuthError) throw error
    throw new GoogleAuthError('Invalid or expired Google credential', 'INVALID_CREDENTIAL')
  }
}

export function createGoogleAuthService({ verifyCredential = verifyGoogleCredential, UserModel = User } = {}) {
  return {
    async signIn(credential, role) {
      if (typeof credential !== 'string' || !credential.trim()) {
        throw new GoogleAuthError('Google credential is required', 'MISSING_CREDENTIAL')
      }

      const googleUser = await verifyCredential(credential)
      const linkedUser = await UserModel.findOne({ 'authProviders.google.subject': googleUser.subject })
      const emailUser = await UserModel.findOne({ email: googleUser.email })

      if (linkedUser && emailUser && String(linkedUser._id) !== String(emailUser._id)) {
        throw new GoogleAuthError('Google account is linked to a different Spandan account', 'ACCOUNT_CONFLICT')
      }

      let user = linkedUser || emailUser
      let isNewUser = false

      if (!user) {
        if (!['teacher', 'student'].includes(role)) {
          throw new GoogleAuthError('Role selection is required for a new Google account', 'ROLE_REQUIRED')
        }

        user = new UserModel({
          name: googleUser.name,
          email: googleUser.email,
          role,
          profileImage: googleUser.picture,
          password: createUnusablePassword(),
          authProviders: {
            google: {
              subject: googleUser.subject,
              email: googleUser.email,
              linkedAt: new Date()
            }
          }
        })
        isNewUser = true
      } else {
        const existingSubject = user.authProviders?.google?.subject
        if (existingSubject && existingSubject !== googleUser.subject) {
          throw new GoogleAuthError('Google account identity mismatch', 'ACCOUNT_CONFLICT')
        }

        if (!user.authProviders) user.authProviders = {}
        if (!user.authProviders.google) user.authProviders.google = {}
        user.authProviders.google.subject = googleUser.subject
        user.authProviders.google.email = googleUser.email
        user.authProviders.google.linkedAt = user.authProviders.google.linkedAt || new Date()

        if (!user.profileImage && googleUser.picture) user.profileImage = googleUser.picture
      }

      try {
        await user.save()
      } catch (error) {
        if (error?.code === 11000) {
          const concurrentUser = await UserModel.findOne({ 'authProviders.google.subject': googleUser.subject })
          if (concurrentUser) return { user: concurrentUser, isNewUser: false }
        }
        throw error
      }

      return { user, isNewUser }
    }
  }
}

export const signInWithGoogle = createGoogleAuthService().signIn