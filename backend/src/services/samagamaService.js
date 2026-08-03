import User from '../models/User.js'

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
