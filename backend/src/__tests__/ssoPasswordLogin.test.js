// Samagama-SSO accounts must not be loggable-into with a password.
//
// They used to be created with the literal 'samagama-sso-placeholder' as their password, which is
// public in this repository — knowing an SSO account's email was enough to take it over. These
// tests run against a real database so they exercise the actual hashing/compare path.
import mongoose from 'mongoose'
import User from '../models/User.js'
import { findOrCreateSamagamaUser } from '../services/samagamaService.js'
import { login } from '../services/authService.js'

const PLACEHOLDER = 'samagama-sso-placeholder'

describe('Samagama SSO account passwords', () => {
  beforeAll(async () => {
    // Jest runs suites in parallel against ONE mongod, so every suite that writes takes its own
    // database — otherwise a beforeEach in a sibling suite deletes this one's fixtures mid-run.
    await mongoose.connect(process.env.MONGO_URL, { dbName: 'sso-password-login' })
  })

  afterAll(async () => {
    await mongoose.disconnect()
  })

  beforeEach(async () => {
    await User.deleteMany({})
  })

  it('does not provision new SSO accounts with the shared placeholder', async () => {
    const email = 'new-sso-user@example.com'
    await findOrCreateSamagamaUser({ email, name: 'New SSO User', isAdmin: false })

    await expect(login(email, PLACEHOLDER)).rejects.toThrow('Invalid email or password')
  })

  it('refuses the placeholder on accounts provisioned before the fix', async () => {
    // Reproduces a legacy row: the hash of the placeholder is still in the database.
    const email = 'legacy-sso-user@example.com'
    await new User({ name: 'Legacy SSO User', email, role: 'student', password: PLACEHOLDER }).save()

    await expect(login(email, PLACEHOLDER)).rejects.toThrow('Invalid email or password')
  })

  it('still lets an account with a real password log in', async () => {
    const email = 'normal-user@example.com'
    await new User({ name: 'Normal User', email, role: 'teacher', password: 'a-real-password' }).save()

    const user = await login(email, 'a-real-password')
    expect(user.email).toBe(email)
  })
})
