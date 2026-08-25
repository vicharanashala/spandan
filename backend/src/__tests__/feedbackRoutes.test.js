import express from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import Feedback from '../models/Feedback.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import User from '../models/User.js'
import feedbackRouter from '../routes/feedback.js'
import { clearUserCache, generateToken } from '../middleware/auth.js'

const app = express()
app.use(express.json())
app.use('/api/feedback', feedbackRouter)

const validBody = (roomId) => ({
  roomId: String(roomId),
  rating: 5,
  sessionSummary: 'A useful and engaging session.',
  whatWorkedWell: 'The examples and discussion were clear.',
  whatUnclear: '',
  facilitators: ['Jinal', 'Rohit']
})

async function createUser(name, email, role = 'student') {
  return User.create({
    name,
    email,
    password: 'password123',
    role,
    ...(role === 'teacher' ? { teacherApprovalStatus: 'approved' } : {})
  })
}

async function createFixture({ ended = true } = {}) {
  const teacher = await createUser('Teacher User', `teacher-${Date.now()}-${Math.random()}@example.com`, 'teacher')
  const student = await createUser('Student User', `student-${Date.now()}-${Math.random()}@example.com`)
  const room = await Room.create({
    name: 'Feedback Room',
    teacher: teacher._id,
    ...(ended ? { endedAt: new Date() } : {})
  })
  await RoomMember.create({ roomId: room._id, studentId: student._id })
  return { teacher, student, room }
}

describe('Feedback API routes', () => {
  beforeAll(async () => {
    // Jest runs test files concurrently; use a private database so this suite's collection cleanup
    // cannot delete another suite's authenticated test user between token creation and request.
    await mongoose.connect(process.env.MONGO_URL, { dbName: 'feedback-routes-tests' })
    await Feedback.init()
  }, 30000)

  beforeEach(async () => {
    clearUserCache()
    await Promise.all([
      Feedback.deleteMany({}),
      RoomMember.deleteMany({}),
      Room.deleteMany({}),
      User.deleteMany({})
    ])
  }, 30000)

  afterAll(async () => {
    await mongoose.disconnect()
  })

  it('accepts a valid student submission with permitted facilitators', async () => {
    const { student, room } = await createFixture()

    const response = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${generateToken(student._id)}`)
      .send(validBody(room._id))
      .expect(201)

    expect(response.body.success).toBe(true)
    expect(response.body.feedback).toMatchObject({
      rating: 5,
      facilitators: ['Jinal', 'Rohit']
    })
  })

  it('rejects facilitators outside the fixed enum', async () => {
    const { student, room } = await createFixture()

    const response = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${generateToken(student._id)}`)
      .send({ ...validBody(room._id), facilitators: ['Unknown Facilitator'] })
      .expect(400)

    expect(response.body.error).toBe('Select at least one valid facilitator')
  })

  it('rejects an empty facilitators array', async () => {
    const { student, room } = await createFixture()

    const response = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${generateToken(student._id)}`)
      .send({ ...validBody(room._id), facilitators: [] })
      .expect(400)

    expect(response.body.error).toBe('Select at least one valid facilitator')
  })

  it('returns 409 for a duplicate submission', async () => {
    const { student, room } = await createFixture()
    const token = generateToken(student._id)

    await request(app).post('/api/feedback').set('Authorization', `Bearer ${token}`).send(validBody(room._id)).expect(201)
    const response = await request(app).post('/api/feedback').set('Authorization', `Bearer ${token}`).send(validBody(room._id)).expect(409)

    expect(response.body.error).toBe("You've already submitted feedback for this room")
  })

  it('rejects feedback while the room is still active', async () => {
    const { student, room } = await createFixture({ ended: false })

    const response = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${generateToken(student._id)}`)
      .send(validBody(room._id))
      .expect(400)

    expect(response.body.error).toBe('Room must be ended to submit feedback')
  })

  it('rejects a rating outside the range 1 to 5', async () => {
    const { student, room } = await createFixture()

    const response = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${generateToken(student._id)}`)
      .send({ ...validBody(room._id), rating: 6 })
      .expect(400)

    expect(response.body.error).toBe('Rating must be an integer between 1 and 5')
  })

  it('returns status false before submission and true afterwards', async () => {
    const { student, room } = await createFixture()
    const token = generateToken(student._id)

    await request(app)
      .get(`/api/feedback/room/${room._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200, { submitted: false })

    await request(app).post('/api/feedback').set('Authorization', `Bearer ${token}`).send(validBody(room._id)).expect(201)

    await request(app)
      .get(`/api/feedback/room/${room._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200, { submitted: true })
  })

  it('does not allow a teacher account to submit feedback', async () => {
    const { teacher, room } = await createFixture()

    await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${generateToken(teacher._id)}`)
      .send(validBody(room._id))
      .expect(403)
  })
})
