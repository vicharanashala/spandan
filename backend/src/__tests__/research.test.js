import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import Room from '../models/Room.js'
import Question from '../models/Question.js'
import Response from '../models/Response.js'
import RoomPresence from '../models/RoomPresence.js'
import RoomMember from '../models/RoomMember.js'
import User from '../models/User.js'
import researchRoutes from '../routes/research.js'

// research.js reads only these two things from Express (req.header / req.query) and does its own
// dynamic model imports, so a minimal app mounting just this router is enough — no need to boot
// the full index.js (which starts a real HTTP/Socket.IO server + Mongo connection at import time,
// see roomPresence.test.js).
const RESEARCH_KEY = 'test-research-key'
process.env.RESEARCH_API_KEY = RESEARCH_KEY

const app = express()
app.use(express.json())
app.use('/api/research', researchRoutes)

const get = () => request(app).get('/api/research/sessions').set('X-Research-Key', RESEARCH_KEY)

describe('GET /api/research/sessions — presence export', () => {
  let teacher
  const HOUR_MS = 60 * 60 * 1000

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URL)
  })

  afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  })

  beforeEach(async () => {
    await Promise.all([
      Room.deleteMany({}),
      Question.deleteMany({}),
      Response.deleteMany({}),
      RoomPresence.deleteMany({}),
      RoomMember.deleteMany({}),
      User.deleteMany({})
    ])
    teacher = await User.create({ name: 'Teacher', email: 't@test.com', password: 'password123', role: 'teacher' })
  })

  it('includes a student who joined and left before the room ended, with real presence (regression: roster undercount)', async () => {
    const ghost = await User.create({ name: 'Ghost', email: 'ghost@test.com', password: 'password123', role: 'student' })
    const room = await Room.create({ name: 'Room A', teacher: teacher._id })

    // Present for 15 of the session's 60 minutes, then left — RoomMember row is NOT created,
    // mirroring the real behavior where it is deleted on leave.
    await RoomPresence.create({
      roomId: room._id,
      studentId: ghost._id,
      joinedAt: new Date(room.createdAt.getTime() + 5 * 60 * 1000),
      leftAt: new Date(room.createdAt.getTime() + 20 * 60 * 1000)
    })
    await Room.updateOne({ _id: room._id }, { endedAt: new Date(room.createdAt.getTime() + HOUR_MS) })

    const res = await get()
    expect(res.status).toBe(200)
    expect(res.body.sessions[0].students).toHaveLength(1)
    const row = res.body.sessions[0].students[0]
    expect(row.rank).toBeNull()
    expect(row.studentEmail).toBe('ghost@test.com')
    expect(row.presentSeconds).toBe(900) // 15 min
    expect(row.presentPercent).toBe(25)  // 900 / 3600 * 100
  })

  it('clamps a still-open presence interval to the room end, not left unbounded', async () => {
    const student = await User.create({ name: 'Crash', email: 'crash@test.com', password: 'password123', role: 'student' })
    const room = await Room.create({ name: 'Room B', teacher: teacher._id })

    // Joined 50 min in, no leave/disconnect ever fired (crash / uncleaned test).
    await RoomPresence.create({
      roomId: room._id,
      studentId: student._id,
      joinedAt: new Date(room.createdAt.getTime() + 50 * 60 * 1000),
      leftAt: null
    })
    await Room.updateOne({ _id: room._id }, { endedAt: new Date(room.createdAt.getTime() + HOUR_MS) })

    const res = await get()
    const row = res.body.sessions[0].students[0]
    expect(row.presentSeconds).toBe(600) // clamped to endedAt: 60min - 50min = 10min
    expect(row.presentPercent).toBe(17)  // round(600 / 3600 * 100)
  })

  it('rounds presentPercent and guards the zero-duration room against divide-by-zero', async () => {
    const student = await User.create({ name: 'Third', email: 'third@test.com', password: 'password123', role: 'student' })
    const room = await Room.create({ name: 'Room C', teacher: teacher._id })
    await RoomPresence.create({
      roomId: room._id,
      studentId: student._id,
      joinedAt: room.createdAt,
      leftAt: new Date(room.createdAt.getTime() + 20 * 60 * 1000) // 1200s present
    })
    await Room.updateOne({ _id: room._id }, { endedAt: new Date(room.createdAt.getTime() + HOUR_MS) })

    const res = await get()
    const row = res.body.sessions[0].students[0]
    expect(row.presentSeconds).toBe(1200)
    expect(row.presentPercent).toBe(33) // 1200 / 3600 * 100 = 33.33... -> rounds to 33

    // A separate, zero-duration room (endedAt === createdAt) must report 0%, not NaN/Infinity.
    const zeroRoom = await Room.create({ name: 'Room Zero', teacher: teacher._id })
    await RoomPresence.create({
      roomId: zeroRoom._id,
      studentId: student._id,
      joinedAt: zeroRoom.createdAt,
      leftAt: zeroRoom.createdAt
    })
    await Room.updateOne({ _id: zeroRoom._id }, { endedAt: zeroRoom.createdAt })

    const res2 = await get()
    const zeroSession = res2.body.sessions.find((s) => s.roomId === String(zeroRoom._id))
    expect(zeroSession.students[0].presentPercent).toBe(0)
  })

  it('sums a rejoining student across two RoomPresence intervals without double-counting', async () => {
    const student = await User.create({ name: 'Rejoiner', email: 'rejoin@test.com', password: 'password123', role: 'student' })
    const room = await Room.create({ name: 'Room D', teacher: teacher._id })

    await RoomPresence.create([
      {
        roomId: room._id,
        studentId: student._id,
        joinedAt: new Date(room.createdAt.getTime() + 5 * 60 * 1000),
        leftAt: new Date(room.createdAt.getTime() + 10 * 60 * 1000) // 300s
      },
      {
        roomId: room._id,
        studentId: student._id,
        joinedAt: new Date(room.createdAt.getTime() + 15 * 60 * 1000),
        leftAt: new Date(room.createdAt.getTime() + 25 * 60 * 1000) // 600s
      }
    ])
    await Room.updateOne({ _id: room._id }, { endedAt: new Date(room.createdAt.getTime() + HOUR_MS) })

    const res = await get()
    expect(res.body.sessions[0].students).toHaveLength(1) // one row, not two
    expect(res.body.sessions[0].students[0].presentSeconds).toBe(900) // 300 + 600
  })

  it('leaves existing fields, responder/no-show ordering, and nextCursor unchanged', async () => {
    const room = await Room.create({ name: 'Room E', teacher: teacher._id })
    const responder = await User.create({ name: 'Responder', email: 'responder@test.com', password: 'password123', role: 'student' })
    const noShow = await User.create({ name: 'Silent', email: 'silent@test.com', password: 'password123', role: 'student' })

    const question = await Question.create({
      roomId: room._id,
      type: 'MCQ',
      question: 'What is 2+2?',
      options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }],
      status: 'approved',
      points: 100
    })
    await Response.create({
      roomId: room._id,
      questionId: question._id,
      studentId: responder._id,
      selectedOption: 0,
      isCorrect: true,
      responseTime: 5,
      points: 100
    })

    const endedAt = new Date(room.createdAt.getTime() + HOUR_MS)
    await RoomPresence.create([
      { roomId: room._id, studentId: responder._id, joinedAt: room.createdAt, leftAt: endedAt },
      { roomId: room._id, studentId: noShow._id, joinedAt: room.createdAt, leftAt: endedAt }
    ])
    await Room.updateOne({ _id: room._id }, { endedAt })

    const res = await get()
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(1)
    expect(res.body.nextCursor).toBe(endedAt.toISOString())

    const session = res.body.sessions[0]
    expect(session.students).toHaveLength(2)

    const [first, second] = session.students
    expect(first.rank).toBe(1)
    expect(first.studentEmail).toBe('responder@test.com')
    expect(first.points).toBe(100)
    expect(first.correct).toBe('1/1')
    expect(first.answers.Q1).toBe('correct')

    expect(second.rank).toBeNull()
    expect(second.studentEmail).toBe('silent@test.com')
    expect(second.points).toBe(0)
    expect(second.correct).toBe('0/0')
    expect(second.answers.Q1).toBeNull()
  })
})
