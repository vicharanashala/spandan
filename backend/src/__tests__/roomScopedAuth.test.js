// Room-scoped authorization on the routes that were missing it: a teacher role alone must not grant
// access to another teacher's room, and room membership alone must not grant access to the whole
// room's answers. Real routers, real JWTs, real database — no mocked middleware.
import express from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import User from '../models/User.js'
import Room from '../models/Room.js'
import Question from '../models/Question.js'
import Response from '../models/Response.js'
import RoomMember from '../models/RoomMember.js'
import questionRoutes from '../routes/questions.js'
import responseRoutes from '../routes/responses.js'
import transcriptionRoutes from '../routes/transcription.js'
import { generateToken, clearUserCache } from '../middleware/auth.js'

const app = express()
app.use(express.json())
app.use('/api/questions', questionRoutes)
app.use('/api/responses', responseRoutes)
app.use('/api/transcription', transcriptionRoutes)

const makeUser = (name, role) =>
  new User({ name, email: `${name}@example.com`, role, password: 'a-real-password' }).save()

describe('Room-scoped authorization', () => {
  let owner, otherTeacher, student, room, auth

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URL)
  })

  afterAll(async () => {
    await mongoose.disconnect()
  })

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Room.deleteMany({}), Response.deleteMany({}), RoomMember.deleteMany({})])
    clearUserCache()

    owner = await makeUser('owner', 'teacher')
    otherTeacher = await makeUser('intruder', 'teacher')
    student = await makeUser('student', 'student')
    room = await new Room({ name: 'Owned Room', teacher: owner._id }).save()
    await new RoomMember({ roomId: room._id, studentId: student._id }).save()

    auth = (user) => `Bearer ${generateToken(user._id.toString())}`
  })

  describe('POST /api/questions', () => {
    const body = {
      type: 'MCQ',
      question: 'Injected?',
      options: [{ text: 'yes', isCorrect: true }, { text: 'no', isCorrect: false }],
      status: 'approved'
    }

    it('lets the owning teacher add a question to their room', async () => {
      const res = await request(app)
        .post('/api/questions')
        .set('Authorization', auth(owner))
        .send({ ...body, roomId: room._id.toString() })

      expect(res.status).toBe(201)
    })

    it('rejects a teacher who does not own the room', async () => {
      const res = await request(app)
        .post('/api/questions')
        .set('Authorization', auth(otherTeacher))
        .send({ ...body, roomId: room._id.toString() })

      expect(res.status).toBe(403)
      expect(await Question.countDocuments({ roomId: room._id })).toBe(0)
    })

    it('returns 404 for a room that does not exist', async () => {
      const res = await request(app)
        .post('/api/questions')
        .set('Authorization', auth(owner))
        .send({ ...body, roomId: new mongoose.Types.ObjectId().toString() })

      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/responses', () => {
    it('returns the room\'s responses to the owning teacher', async () => {
      const res = await request(app)
        .get(`/api/responses?roomId=${room._id}`)
        .set('Authorization', auth(owner))

      expect(res.status).toBe(200)
    })

    it('rejects a student member asking for the whole room', async () => {
      const res = await request(app)
        .get(`/api/responses?roomId=${room._id}`)
        .set('Authorization', auth(student))

      expect(res.status).toBe(403)
    })

    it('rejects a teacher who does not own the room', async () => {
      const res = await request(app)
        .get(`/api/responses?roomId=${room._id}`)
        .set('Authorization', auth(otherTeacher))

      expect(res.status).toBe(403)
    })
  })

  describe('/api/transcription', () => {
    it('rejects an unauthenticated request', async () => {
      const res = await request(app).post('/api/transcription/transcribe').send({})
      expect(res.status).toBe(401)
    })

    it('rejects an authenticated student', async () => {
      const res = await request(app)
        .post('/api/transcription/transcribe')
        .set('Authorization', auth(student))
        .send({})

      expect(res.status).toBe(403)
    })

    it('lets a teacher through to the handler', async () => {
      // 400 = the route's own body validation, i.e. auth passed.
      const res = await request(app)
        .post('/api/transcription/transcribe')
        .set('Authorization', auth(owner))
        .send({})

      expect(res.status).toBe(400)
    })
  })
})
