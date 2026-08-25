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

async function createUser(name, email, role = 'student') {
  return User.create({
    name,
    email,
    password: 'password123',
    role,
    ...(role === 'teacher' ? { teacherApprovalStatus: 'approved' } : {})
  })
}

async function createFixture() {
  const owner = await createUser('Owner Teacher', `owner-${Date.now()}-${Math.random()}@example.com`, 'teacher')
  const otherTeacher = await createUser('Other Teacher', `other-${Date.now()}-${Math.random()}@example.com`, 'teacher')
  const student = await createUser('Rahul Sharma', 'rahul.sharma@gmail.com')
  const room = await Room.create({ name: 'Feedback Export Room', teacher: owner._id, endedAt: new Date() })
  await RoomMember.create({ roomId: room._id, studentId: student._id })
  await Feedback.create({
    roomId: room._id,
    studentId: student._id,
    rating: 4,
    sessionSummary: 'A session about better problem solving.',
    whatWorkedWell: 'The live examples worked well.',
    whatUnclear: 'More time on the final topic would help.',
    facilitators: ['Rohit', 'Sakshi']
  })
  return { owner, otherTeacher, student, room }
}

describe('Teacher feedback views', () => {
  beforeAll(async () => {
    // Jest runs test files concurrently; use a private database so this suite's collection cleanup
    // cannot delete another suite's authenticated test user between token creation and request.
    await mongoose.connect(process.env.MONGO_URL, { dbName: 'feedback-teacher-views-tests' })
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

  it('returns masked, never raw, student emails to the owning teacher', async () => {
    const { owner, room } = await createFixture()
    const response = await request(app)
      .get(`/api/feedback/room/${room._id}`)
      .set('Authorization', `Bearer ${generateToken(owner._id)}`)
      .expect(200)

    expect(response.body).toMatchObject({ success: true, count: 1 })
    expect(response.body.feedback[0]).toMatchObject({
      name: 'Rahul Sharma',
      maskedEmail: 'ra***a@gmail.com',
      rating: 4,
      facilitators: ['Rohit', 'Sakshi']
    })
    expect(JSON.stringify(response.body)).not.toContain('rahul.sharma@gmail.com')
  })

  it('blocks a non-owning teacher from the list endpoint', async () => {
    const { otherTeacher, room } = await createFixture()
    await request(app)
      .get(`/api/feedback/room/${room._id}`)
      .set('Authorization', `Bearer ${generateToken(otherTeacher._id)}`)
      .expect(403)
  })

  it('blocks students from the teacher-only list endpoint', async () => {
    const { student, room } = await createFixture()
    await request(app)
      .get(`/api/feedback/room/${room._id}`)
      .set('Authorization', `Bearer ${generateToken(student._id)}`)
      .expect(403)
  })

  it('exports a non-empty XLSX workbook for the owning teacher', async () => {
    const { owner, room } = await createFixture()
    const response = await request(app)
      .get(`/api/feedback/room/${room._id}/export`)
      .set('Authorization', `Bearer ${generateToken(owner._id)}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
      .expect(200)
      .expect('Content-Type', /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/)

    expect(response.body.length).toBeGreaterThan(0)
    expect(response.headers['content-disposition']).toMatch(/\.xlsx"$/)
  })

  it('blocks a non-owning teacher from exporting feedback', async () => {
    const { otherTeacher, room } = await createFixture()
    await request(app)
      .get(`/api/feedback/room/${room._id}/export`)
      .set('Authorization', `Bearer ${generateToken(otherTeacher._id)}`)
      .expect(403)
  })
})
