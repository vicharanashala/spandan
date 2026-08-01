import { createGoogleAuthService, GoogleAuthError, normalizeGooglePayload } from '../services/googleAuthService.js'

function createFakeUserModel() {
  const records = []
  let nextId = 1

  class FakeUser {
    constructor(data) {
      Object.assign(this, data)
      this._id = String(nextId++)
      this.save = jest.fn(async () => {
        if (!records.includes(this)) records.push(this)
        return this
      })
    }

    toJSON() {
      const { password, ...safe } = this
      return safe
    }

    static async findOne(query) {
      if (query.email) return records.find((user) => user.email === query.email) || null
      const subject = query['authProviders.google.subject']
      return records.find((user) => user.authProviders?.google?.subject === subject) || null
    }
  }

  FakeUser.records = records
  return FakeUser
}

const googlePayload = (overrides = {}) => normalizeGooglePayload({
  sub: 'google-sub-1',
  email: 'Google.User@Example.com',
  email_verified: true,
  name: 'Google User',
  picture: 'https://example.com/avatar.png',
  ...overrides
})

describe('Google authentication service', () => {
  it('creates a new Google user in role-selection onboarding', async () => {
    const UserModel = createFakeUserModel()
    const service = createGoogleAuthService({
      UserModel,
      verifyCredential: jest.fn(async () => googlePayload())
    })

    const result = await service.signIn('verified-credential', 'student')

    expect(result.isNewUser).toBe(true)
    expect(result.user.email).toBe('google.user@example.com')
    expect(result.user.role).toBeNull()
    expect(result.requiresRoleSelection).toBe(true)
    expect(result.user.authProviders.google.subject).toBe('google-sub-1')
    expect(result.user.password).toMatch(/^google:/)
    expect(UserModel.records).toHaveLength(1)
  })

it('creates an authenticated incomplete account without guessing a role', async () => {
    const UserModel = createFakeUserModel()
    const service = createGoogleAuthService({ UserModel, verifyCredential: async () => googlePayload() })

    const result = await service.signIn('verified-credential', 'teacher')

    expect(result.user.role).toBeNull()
    expect(result.user.requiresRoleSelection).toBe(true)
    expect(UserModel.records).toHaveLength(1)
  })
  it('links an existing email account without changing its role or creating a duplicate', async () => {
    const UserModel = createFakeUserModel()
    const existing = new UserModel({
      name: 'Existing Teacher',
      email: 'google.user@example.com',
      password: 'bcrypt-hash',
      role: 'teacher',
      authProviders: {}
    })
    UserModel.records.push(existing)
    const service = createGoogleAuthService({ UserModel, verifyCredential: async () => googlePayload() })

    const result = await service.signIn('verified-credential', 'student')

    expect(result.isNewUser).toBe(false)
    expect(result.user._id).toBe(existing._id)
    expect(result.user.role).toBe('teacher')
    expect(result.user.authProviders.google.subject).toBe('google-sub-1')
    expect(UserModel.records).toHaveLength(1)
  })

  it('authenticates an already linked Google account', async () => {
    const UserModel = createFakeUserModel()
    const existing = new UserModel({
      name: 'Linked Student',
      email: 'google.user@example.com',
      password: 'bcrypt-hash',
      role: 'student',
      authProviders: { google: { subject: 'google-sub-1', email: 'google.user@example.com' } }
    })
    UserModel.records.push(existing)
    const service = createGoogleAuthService({ UserModel, verifyCredential: async () => googlePayload() })

    const result = await service.signIn('verified-credential', 'teacher')

    expect(result.user._id).toBe(existing._id)
    expect(result.user.role).toBe('student')
    expect(UserModel.records).toHaveLength(1)
  })

  it('rejects missing and invalid credentials', async () => {
    const UserModel = createFakeUserModel()
    const verifier = jest.fn(async () => {
      throw new GoogleAuthError('Invalid or expired Google credential', 'INVALID_CREDENTIAL')
    })
    const service = createGoogleAuthService({ UserModel, verifyCredential: verifier })

    await expect(service.signIn('')).rejects.toMatchObject({ code: 'MISSING_CREDENTIAL' })
    await expect(service.signIn('fake-credential')).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' })
    expect(verifier).toHaveBeenCalledTimes(1)
  })

  it('prevents duplicate accounts when the same verified Google identity signs in repeatedly', async () => {
    const UserModel = createFakeUserModel()
    const service = createGoogleAuthService({ UserModel, verifyCredential: async () => googlePayload() })

    const first = await service.signIn('verified-credential', 'student')
    const second = await service.signIn('verified-credential', 'teacher')

    expect(second.user._id).toBe(first.user._id)
    expect(UserModel.records).toHaveLength(1)
    expect(second.user.role).toBeNull()
    expect(second.requiresRoleSelection).toBe(true)
  })
})