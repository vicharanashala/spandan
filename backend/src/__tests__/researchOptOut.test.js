// Research opt-out (Terms of Use, Section 8): a signed-in user can read and change only their own
// choice, the choice never appears in user JSON or ordinary queries (so no teacher/admin view can show
// it), and it cannot be set through the profile route. Runs the real routes + middleware against the
// in-memory MongoDB from the jest-mongodb preset.
import express from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import User from '../models/User.js'
import authRoutes from '../routes/auth.js'
import { generateToken, clearUserCache } from '../middleware/auth.js'
import { TERMS_VERSION } from '../config/terms.js'

const app = express()
app.use(express.json())
app.use('/api/auth', authRoutes)

const makeUser = (overrides = {}) => User.create({
  name: 'Test Student',
  email: `s${Math.random().toString(36).slice(2)}@example.com`,
  password: 'Passw0rd!',
  role: 'student',
  teacherApprovalStatus: 'approved',
  termsVersion: TERMS_VERSION,
  termsAcceptedAt: new Date(),
  ...overrides
})

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URL, { dbName: 'researchOptOutTest' })
})

afterAll(async () => {
  await mongoose.disconnect()
})

beforeEach(async () => {
  clearUserCache()
  await User.deleteMany({})
})

describe('research opt-out routes', () => {
  it('requires sign-in', async () => {
    expect((await request(app).get('/api/auth/research-opt-out')).status).toBe(401)
    expect((await request(app).put('/api/auth/research-opt-out').send({ optOut: true })).status).toBe(401)
  })

  it('starts as included (not opted out)', async () => {
    const user = await makeUser()
    const res = await request(app).get('/api/auth/research-opt-out').set('Authorization', `Bearer ${generateToken(user._id)}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ optedOut: false, optedOutAt: null })
  })

  it('opts out and back in, recording the time of opting out', async () => {
    const user = await makeUser()
    const auth = `Bearer ${generateToken(user._id)}`

    const out = await request(app).put('/api/auth/research-opt-out').set('Authorization', auth).send({ optOut: true })
    expect(out.status).toBe(200)
    expect(out.body.optedOut).toBe(true)
    expect(out.body.optedOutAt).toBeTruthy()
    let saved = await User.findById(user._id).select('+researchOptOut +researchOptOutAt')
    expect(saved.researchOptOut).toBe(true)
    expect(saved.researchOptOutAt).toBeInstanceOf(Date)
    expect((await request(app).get('/api/auth/research-opt-out').set('Authorization', auth)).body.optedOut).toBe(true)

    const back = await request(app).put('/api/auth/research-opt-out').set('Authorization', auth).send({ optOut: false })
    expect(back.status).toBe(200)
    expect(back.body).toEqual({ optedOut: false, optedOutAt: null })
    saved = await User.findById(user._id).select('+researchOptOut +researchOptOutAt')
    expect(saved.researchOptOut).toBe(false)
    expect(saved.researchOptOutAt).toBeNull()
  })

  it('rejects a non-boolean optOut', async () => {
    const user = await makeUser()
    const auth = `Bearer ${generateToken(user._id)}`
    for (const optOut of [undefined, 'true', 1, null]) {
      const res = await request(app).put('/api/auth/research-opt-out').set('Authorization', auth).send({ optOut })
      expect(res.status).toBe(400)
    }
    expect((await User.findById(user._id).select('+researchOptOut')).researchOptOut).toBe(false)
  })

  it('changes only the signed-in user', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await request(app).put('/api/auth/research-opt-out').set('Authorization', `Bearer ${generateToken(a._id)}`).send({ optOut: true })
    expect((await User.findById(b._id).select('+researchOptOut')).researchOptOut).toBe(false)
  })

  it('cannot be set through the profile route', async () => {
    const user = await makeUser()
    await request(app).put('/api/auth/profile').set('Authorization', `Bearer ${generateToken(user._id)}`)
      .send({ researchOptOut: true, name: 'Renamed' })
    const saved = await User.findById(user._id).select('+researchOptOut')
    expect(saved.name).toBe('Renamed')
    expect(saved.researchOptOut).toBe(false)
  })
})

describe('the choice is never exposed to other views', () => {
  it('is left out of user JSON, /auth/me and ordinary (incl. lean) queries', async () => {
    const user = await makeUser({ researchOptOut: true, researchOptOutAt: new Date() })
    const auth = `Bearer ${generateToken(user._id)}`

    const me = await request(app).get('/api/auth/me').set('Authorization', auth)
    expect(me.status).toBe(200)
    expect(me.body.user).not.toHaveProperty('researchOptOut')
    expect(me.body.user).not.toHaveProperty('researchOptOutAt')

    const doc = await User.findById(user._id)
    expect(doc.toJSON()).not.toHaveProperty('researchOptOut')
    const lean = await User.findById(user._id).lean()
    expect(lean).not.toHaveProperty('researchOptOut')
    expect(lean).not.toHaveProperty('researchOptOutAt')
    const listed = await User.find({}).select('-password').lean()
    expect(listed[0]).not.toHaveProperty('researchOptOut')
  })
})
