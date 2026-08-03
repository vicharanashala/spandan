// StudentRoomPage no longer refetches the question list when a student's own answering timer
// expires, on the grounds that the refetch is redundant for anyone who already answered: the poll is
// STILL the room's live one at expiry, so the endpoint withholds exactly what it withheld on the
// post-submit fetch, and the result is revealed only when the NEXT launch supersedes the poll.
//
// That premise is load-bearing — if it were wrong, students would silently lose their results — and
// it lives in the server, not the client. So assert it here, against the real route.

import express from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import responsesRouter from '../routes/responses.js'
import Response from '../models/Response.js'
import Question from '../models/Question.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import User from '../models/User.js'
import { clearUserCache } from '../middleware/auth.js'

const app = express()
app.use(express.json())
app.use('/api/responses', responsesRouter)

const SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

let teacher, student, room, q1, q2, token

const get = () => request(app)
  .get(`/api/responses/room/${room._id}/student/${student._id}`)
  .set('Authorization', `Bearer ${token}`)

const mkQuestion = (text) => Question.create({
  roomId: room._id,
  type: 'MCQ',
  question: text,
  options: [{ text: 'right', isCorrect: true }, { text: 'wrong', isCorrect: false }],
  status: 'approved',
  points: 100,
  timeToAnswer: 30
})

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URL, { dbName: 'live-reveal-test' })
})

afterAll(async () => { await mongoose.disconnect() })

beforeEach(async () => {
  await Promise.all([
    Response.deleteMany({}), Question.deleteMany({}),
    Room.deleteMany({}), RoomMember.deleteMany({}), User.deleteMany({})
  ])
  clearUserCache() // the auth middleware caches resolved users for 60s across tests

  teacher = await User.create({ name: 'Prof', email: 'prof@t.local', password: 'test-password', role: 'teacher' })
  student = await User.create({ name: 'Ada', email: 'ada@t.local', password: 'test-password', role: 'student' })
  room = await Room.create({ name: 'Live Room', code: 'REVEAL', teacher: teacher._id, isActive: true })
  await RoomMember.create({ roomId: room._id, studentId: student._id })
  q1 = await mkQuestion('Q1?')
  q2 = await mkQuestion('Q2?')
  token = jwt.sign({ userId: String(student._id) }, SECRET, { expiresIn: '1h' })

  // q1 is the live poll and the student has answered it — the state at the moment their timer expires.
  await Room.updateOne({ _id: room._id }, { currentQuestion: q1._id })
  await Response.create({
    roomId: room._id, questionId: q1._id, studentId: student._id,
    selectedOption: 0, selectedOptions: [0], isCorrect: true, responseTime: 4, points: 87
  })
})

describe('what the poll-timer refetch would have returned', () => {
  test('is byte-identical to the post-submit fetch while the poll is still live', async () => {
    const postSubmit = await get().expect(200)
    const atTimerExpiry = await get().expect(200) // the request we now skip
    expect(atTimerExpiry.body).toEqual(postSubmit.body)
  })

  test('withholds the answer from the answerer while the poll is live', async () => {
    const { body } = await get().expect(200)
    const answered = body.questions.find((q) => q._id === String(q1._id))

    expect(answered.resultPending).toBe(true)
    expect(answered.answered).toBe(true)
    expect(answered.selectedOptions).toEqual([0])
    // The three things that would leak the answer if a second account read this response.
    expect(answered.isCorrect).toBeUndefined()
    expect(answered.pointsEarned).toBeUndefined()
    expect(answered.options.every((o) => o.isCorrect === undefined)).toBe(true)
  })

  test('the reveal happens when the NEXT launch supersedes the poll, not at timer expiry', async () => {
    // This is why skipping the expiry refetch loses nothing: the data the student is waiting for
    // does not exist yet at expiry. It appears here, and the client picks it up on its next fetch.
    await Room.updateOne({ _id: room._id }, { currentQuestion: q2._id })

    const { body } = await get().expect(200)
    const revealed = body.questions.find((q) => q._id === String(q1._id))

    expect(revealed.resultPending).toBeUndefined()
    expect(revealed.isCorrect).toBe(true)
    expect(revealed.pointsEarned).toBe(87)
    expect(revealed.options.some((o) => o.isCorrect === true)).toBe(true)
  })

  test('a student who did NOT answer still needs the fetch — it is their only path to the question', async () => {
    // The non-answerer branch is the one we kept (jittered). Without it, a missed poll would not
    // appear in their list until they answer some later one.
    const other = await User.create({ name: 'Bob', email: 'bob@t.local', password: 'test-password', role: 'student' })
    await RoomMember.create({ roomId: room._id, studentId: other._id })
    const otherToken = jwt.sign({ userId: String(other._id) }, SECRET, { expiresIn: '1h' })

    const { body } = await request(app)
      .get(`/api/responses/room/${room._id}/student/${other._id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200)

    const seen = body.questions.find((q) => q._id === String(q1._id))
    expect(seen).toBeDefined()
    expect(seen.answered).toBe(false)
    expect(seen.resultPending).toBe(true)
  })

  test('membership is still enforced after switching to the cached check', async () => {
    const intruder = await User.create({ name: 'Eve', email: 'eve@t.local', password: 'test-password', role: 'student' })
    const intruderToken = jwt.sign({ userId: String(intruder._id) }, SECRET, { expiresIn: '1h' })

    await request(app)
      .get(`/api/responses/room/${room._id}/student/${intruder._id}`)
      .set('Authorization', `Bearer ${intruderToken}`)
      .expect(403)
  })
})
