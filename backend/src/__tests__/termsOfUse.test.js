// Terms of Use enforcement: registration requires acceptance, accounts that have not accepted the
// current version are refused (403 TERMS_REQUIRED) everywhere except /auth/me and /auth/accept-terms,
// and accepting lifts the block immediately (no auth-cache delay). Runs the real routes + middleware
// against the in-memory MongoDB from the jest-mongodb preset.
import fs from 'fs'
import path from 'path'
import express from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import User from '../models/User.js'
import authRoutes from '../routes/auth.js'
import { authenticate, generateToken, clearUserCache } from '../middleware/auth.js'
import { TERMS_VERSION, hasAcceptedCurrentTerms } from '../config/terms.js'
import { verifyRegistrationSchema } from '../middleware/validation.js'

const app = express()
app.use(express.json())
app.use('/api/auth', authRoutes)
app.get('/api/protected', authenticate, (req, res) => res.json({ ok: true }))

const makeUser = (overrides = {}) => User.create({
  name: 'Test Student',
  email: `s${Math.random().toString(36).slice(2)}@example.com`,
  password: 'Passw0rd!',
  role: 'student',
  teacherApprovalStatus: 'approved',
  ...overrides
})

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URL)
})

afterAll(async () => {
  await mongoose.disconnect()
})

beforeEach(async () => {
  clearUserCache()
  await User.deleteMany({})
})

describe('Terms of Use version', () => {
  it('backend and frontend declare the same current version', () => {
    const frontend = fs.readFileSync(
      path.resolve(process.cwd(), '../frontend/src/content/terms.js'), 'utf8'
    )
    const m = frontend.match(/export const TERMS_VERSION = '([^']+)'/)
    expect(m).not.toBeNull()
    expect(m[1]).toBe(TERMS_VERSION)
  })

  it('only the current version counts as accepted', () => {
    expect(hasAcceptedCurrentTerms({ termsVersion: TERMS_VERSION })).toBe(true)
    expect(hasAcceptedCurrentTerms({ termsVersion: '0.9' })).toBe(false)
    expect(hasAcceptedCurrentTerms({ termsVersion: null })).toBe(false)
    expect(hasAcceptedCurrentTerms({})).toBe(false)
    expect(hasAcceptedCurrentTerms(null)).toBe(false)
  })

  it('User JSON exposes termsAccepted', () => {
    expect(new User({ termsVersion: TERMS_VERSION }).toJSON().termsAccepted).toBe(true)
    expect(new User({}).toJSON().termsAccepted).toBe(false)
  })
})

describe('registration requires acceptance', () => {
  const body = { name: 'New User', email: 'new@example.com', password: 'Passw0rd!', role: 'student', otp: '123456' }

  it('rejects a missing or false acceptTerms', () => {
    expect(verifyRegistrationSchema.safeParse(body).success).toBe(false)
    expect(verifyRegistrationSchema.safeParse({ ...body, acceptTerms: false }).success).toBe(false)
    expect(verifyRegistrationSchema.safeParse({ ...body, acceptTerms: 'true' }).success).toBe(false)
  })

  it('accepts acceptTerms: true', () => {
    expect(verifyRegistrationSchema.safeParse({ ...body, acceptTerms: true }).success).toBe(true)
  })

  it('POST /register/verify returns 400 without acceptance, before any OTP check', async () => {
    const res = await request(app).post('/api/auth/register/verify').send(body)
    expect(res.status).toBe(400)
    expect(await User.countDocuments({})).toBe(0)
  })

  it('POST /google/complete refuses without acceptance', async () => {
    const res = await request(app).post('/api/auth/google/complete').send({ reg: 'x', role: 'student' })
    // 503 when Google OAuth is not configured in the test env; otherwise the terms check answers 400.
    expect([400, 503]).toContain(res.status)
    expect(await User.countDocuments({})).toBe(0)
  })
})

describe('existing accounts must accept before using Spandan', () => {
  it('blocks a protected route with 403 TERMS_REQUIRED', async () => {
    const user = await makeUser() // created without terms, like every pre-existing account
    const res = await request(app).get('/api/protected').set('Authorization', `Bearer ${generateToken(user._id)}`)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('TERMS_REQUIRED')
  })

  it('also blocks an account that accepted an older version', async () => {
    const user = await makeUser({ termsVersion: '0.1', termsAcceptedAt: new Date() })
    const res = await request(app).get('/api/protected').set('Authorization', `Bearer ${generateToken(user._id)}`)
    expect(res.status).toBe(403)
  })

  it('still allows GET /auth/me, reporting termsAccepted: false', async () => {
    const user = await makeUser()
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${generateToken(user._id)}`)
    expect(res.status).toBe(200)
    expect(res.body.user.termsAccepted).toBe(false)
  })

  it('accept-terms requires acceptTerms: true', async () => {
    const user = await makeUser()
    const res = await request(app).post('/api/auth/accept-terms')
      .set('Authorization', `Bearer ${generateToken(user._id)}`).send({})
    expect(res.status).toBe(400)
    expect((await User.findById(user._id)).termsVersion).toBeNull()
  })

  it('accepting records the version and unblocks the very next request (cache invalidated)', async () => {
    const user = await makeUser()
    const auth = `Bearer ${generateToken(user._id)}`

    // Prime the auth cache with the not-yet-accepted user.
    expect((await request(app).get('/api/protected').set('Authorization', auth)).status).toBe(403)

    const accept = await request(app).post('/api/auth/accept-terms').set('Authorization', auth).send({ acceptTerms: true })
    expect(accept.status).toBe(200)
    expect(accept.body.user.termsAccepted).toBe(true)
    expect(accept.body.user.password).toBeUndefined()

    const saved = await User.findById(user._id)
    expect(saved.termsVersion).toBe(TERMS_VERSION)
    expect(saved.termsAcceptedAt).toBeInstanceOf(Date)

    expect((await request(app).get('/api/protected').set('Authorization', auth)).status).toBe(200)
  })

  it('sees an acceptance recorded by another backend instance despite this instance\'s cache', async () => {
    const user = await makeUser()
    const auth = `Bearer ${generateToken(user._id)}`
    expect((await request(app).get('/api/protected').set('Authorization', auth)).status).toBe(403) // cached here
    // Simulate the other instance handling accept-terms: the DB changes, this instance's cache is NOT cleared.
    await User.updateOne({ _id: user._id }, { $set: { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() } })
    expect((await request(app).get('/api/protected').set('Authorization', auth)).status).toBe(200)
  })

  it('keeps teacher-approval behaviour: pending teacher still gets TEACHER_NOT_APPROVED, approved teacher gets the terms gate', async () => {
    const pending = await makeUser({ role: 'teacher', teacherApprovalStatus: 'pending' })
    const r1 = await request(app).get('/api/protected').set('Authorization', `Bearer ${generateToken(pending._id)}`)
    expect(r1.status).toBe(401)
    expect(r1.body.code).toBe('TEACHER_NOT_APPROVED')

    const approved = await makeUser({ role: 'teacher', teacherApprovalStatus: 'approved' })
    const auth = `Bearer ${generateToken(approved._id)}`
    const r2 = await request(app).get('/api/protected').set('Authorization', auth)
    expect(r2.status).toBe(403)
    expect(r2.body.code).toBe('TERMS_REQUIRED')
    await request(app).post('/api/auth/accept-terms').set('Authorization', auth).send({ acceptTerms: true })
    expect((await request(app).get('/api/protected').set('Authorization', auth)).status).toBe(200)
  })

  it('lets an account that accepted the current version straight through', async () => {
    const user = await makeUser({ termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() })
    const res = await request(app).get('/api/protected').set('Authorization', `Bearer ${generateToken(user._id)}`)
    expect(res.status).toBe(200)
  })

  it('cannot set termsVersion through the profile update route', async () => {
    const user = await makeUser({ termsVersion: TERMS_VERSION })
    const auth = `Bearer ${generateToken(user._id)}`
    await request(app).put('/api/auth/profile').set('Authorization', auth).send({ termsVersion: '0.0', name: 'Renamed' })
    const saved = await User.findById(user._id)
    expect(saved.name).toBe('Renamed')
    expect(saved.termsVersion).toBe(TERMS_VERSION)
  })
})
