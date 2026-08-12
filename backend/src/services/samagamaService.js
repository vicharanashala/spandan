import User from '../models/User.js'

const SAMAGAMA_ME_URL = 'https://samagama.in/api/auth/me'

/**
 * Verify a Samagama session token SERVER-SIDE and return the authoritative
 * user identity that Samagama reports for it. This is the trust boundary:
 * callers must never be believed about who they are — only Samagama is.
 *
 * @param {string} token - the Samagama session token supplied by the client
 * @param {typeof fetch} [fetchImpl] - injectable for testing
 * @returns {Promise<{email:string,name:string,isAdmin:boolean,isSuperAdmin:boolean}>}
 * @throws {Error} with a `.status` (401 bad/absent token, 502 Samagama unreachable)
 */
export async function verifySamagamaToken(token, fetchImpl = fetch) {
  if (!token || typeof token !== 'string') {
    const e = new Error('Missing Samagama token')
    e.status = 401
    throw e
  }

  let resp
  try {
    resp = await fetchImpl(SAMAGAMA_ME_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
  } catch (err) {
    const e = new Error('Could not reach Samagama to verify token')
    e.status = 502
    throw e
  }

  if (!resp.ok) {
    const e = new Error('Invalid or expired Samagama token')
    e.status = 401
    throw e
  }

  const data = await resp.json()
  const user = data && data.user
  if (!user || !user.email) {
    const e = new Error('Samagama token did not resolve to a user')
    e.status = 401
    throw e
  }

  // Only these server-verified fields are trusted; anything the client sent is ignored.
  return {
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin || false,
    isSuperAdmin: user.isSuperAdmin || false
  }
}

/**
 * Determine Spandan role from Samagama admin flags
 * @param {boolean} isAdmin
 * @param {boolean} isSuperAdmin
 * @returns {'teacher' | 'student'}
 */
export function determineSpandanRole(isAdmin, isSuperAdmin) {
  return (isAdmin || isSuperAdmin) ? 'teacher' : 'student'
}

/**
 * Find or create a Spandan user from Samagama user data.
 * Role is set on first provision and NEVER updated on subsequent logins.
 * This prevents role elevation attacks.
 *
 * @param {object} samagamaUser - User object from Samagama (response.user)
 * @returns {Promise<User>}
 */
export async function findOrCreateSamagamaUser(samagamaUser) {
  const email = samagamaUser.email
  const name = samagamaUser.name
  const isAdmin = samagamaUser.isAdmin || false
  const isSuperAdmin = samagamaUser.isSuperAdmin || false

  const role = determineSpandanRole(isAdmin, isSuperAdmin)

  // Check if user already exists in Spandan
  let user = await User.findOne({ email: email.toLowerCase() })

  if (user) {
    // Returning user — update name if changed, keep existing role
    let updated = false

    if (user.name !== name) {
      user.name = name
      updated = true
    }

    // Only set role if it was never set before (first provision)
    if (!user.role) {
      user.role = role
      updated = true
    }

    if (updated) {
      await user.save()
      console.log(`Samagama user updated: ${email}, role: ${user.role}`)
    } else {
      console.log(`Samagama user recognized: ${email}, role: ${user.role}`)
    }

    return user
  }

  // New user — create in Spandan
  user = new User({
    name,
    email: email.toLowerCase(),
    role,
    password: 'samagama-sso-placeholder' // User cannot log in standalone without setting a password
  })

  await user.save()
  console.log(`Samagama user created: ${email}, role: ${role}`)

  return user
}
