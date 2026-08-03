// End-to-end check of GET /api/responses/leaderboard/:roomId over a real Mongo, through the real
// auth middleware. The handler used to carry its own copy of the full-room aggregation; it now calls
// the shared incremental computeRanked(). These tests pin the payload that refactor must preserve —
// the teacher's full board, the student's top-10 + own-rank view, and the authorization rules — and
// that repeated requests during a live session keep returning a board that matches the data.

import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'

import responsesRouter from '../routes/responses.js'
import { clearUserCache } from '../middleware/auth.js'
import { resetLeaderboardMemo } from '../services/leaderboardAgg.js'
import User from '../models/User.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import Question from '../models/Question.js'
import Response from '../models/Response.js'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
const app = express()
app.use(express.json())
app.use('/api/responses', responsesRouter)

const tokenFor = (user) => jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: '1h' })
const board = (user, roomId) =>
  request(app).get(`/api/responses/leaderboard/${roomId}`).set('Authorization', `Bearer ${tokenFor(user)}`)

let teacher, students, room

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URL, { dbName: 'leaderboard-route-test' })
})

afterAll(async () => {
  await mongoose.disconnect()
})

beforeEach(async () => {
  resetLeaderboardMemo()
  clearUserCache()
  await Promise.all([
    User.deleteMany({}), Room.deleteMany({}), RoomMember.deleteMany({}),
    Question.deleteMany({}), Response.deleteMany({})
  ])

  teacher = await User.create({ name: 'Teach', email: 't@test.dev', password: 'x'.repeat(20), role: 'teacher' })
  // 12 students so the top-10 truncation and the "your rank" tail are both exercised.
  students = await User.insertMany(
    Array.from({ length: 12 }, (_, i) => ({
      name: `Student ${i}`, email: `s${i}@test.dev`, password: 'x'.repeat(20), role: 'student'
    }))
  )
  room = await Room.create({ name: 'Room', teacher: teacher._id })
  await RoomMember.insertMany(students.map((s) => ({ roomId: room._id, studentId: s._id })))
})

// Launch a question, have everyone answer it, then supersede it the way setLiveQuestion does.
async function runQuestion({ close = true, pointsFor } = {}) {
  const q = await Question.create({
    roomId: room._id,
    type: 'MCQ',
    question: 'Q?',
    status: 'approved',
    options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }]
  })
  await Response.insertMany(students.map((s, i) => ({
    roomId: room._id, questionId: q._id, studentId: s._id,
    selectedOption: 0, isCorrect: pointsFor(i) > 0, points: pointsFor(i)
  })))
  await Room.updateOne({ _id: room._id }, { currentQuestion: q._id })
  if (close) await Question.updateOne({ _id: q._id }, { closeAt: new Date(Date.now() - 1) })
  return q
}

describe('GET /api/responses/leaderboard/:roomId', () => {
  it('rejects an unauthenticated request', async () => {
    await request(app).get(`/api/responses/leaderboard/${room._id}`).expect(401)
  })

  it('rejects a student who has not joined the room', async () => {
    const outsider = await User.create({ name: 'Nope', email: 'n@test.dev', password: 'x'.repeat(20), role: 'student' })
    await board(outsider, room._id).expect(403)
  })

  it('gives the teacher the full board, ranked by points', async () => {
    await runQuestion({ pointsFor: (i) => (12 - i) * 10 }) // Student 0 highest … Student 11 lowest

    const res = await board(teacher, room._id).expect(200)
    expect(res.body.isTeacher).toBe(true)
    expect(res.body.totalParticipants).toBe(12)
    expect(res.body.leaderboard).toHaveLength(12)
    expect(res.body.leaderboard[0]).toEqual({
      rank: 1,
      studentId: students[0]._id.toString(),
      studentName: 'Student 0',
      totalPoints: 120,
      correctCount: 1,
      totalAnswered: 1
    })
    expect(res.body.leaderboard.map((e) => e.rank)).toEqual([...Array(12)].map((_, i) => i + 1))
  })

  it('gives a student the top 10 plus their own row when they are below it', async () => {
    await runQuestion({ pointsFor: (i) => (12 - i) * 10 })

    const res = await board(students[11], room._id).expect(200) // last place
    expect(res.body.isTeacher).toBe(false)
    expect(res.body.userRank).toBe(12)
    expect(res.body.totalParticipants).toBe(12)
    expect(res.body.leaderboard).toHaveLength(11) // top 10 + self
    expect(res.body.leaderboard.slice(0, 10).map((e) => e.rank)).toEqual([...Array(10)].map((_, i) => i + 1))
    expect(res.body.leaderboard[10]).toMatchObject({
      rank: 12, studentId: students[11]._id.toString(), isCurrentUser: true
    })
  })

  it('does not append a duplicate row for a student already in the top 10', async () => {
    await runQuestion({ pointsFor: (i) => (12 - i) * 10 })

    const res = await board(students[2], room._id).expect(200)
    expect(res.body.userRank).toBe(3)
    expect(res.body.leaderboard).toHaveLength(10)
    expect(res.body.leaderboard.filter((e) => e.studentId === students[2]._id.toString())).toHaveLength(1)
  })

  it('accumulates over a multi-question session and stays consistent across repeat requests', async () => {
    // Three questions, each closed like a real supersede — the path where the running totals are
    // carried forward instead of re-summed.
    await runQuestion({ pointsFor: (i) => (i === 0 ? 100 : 10) })
    await runQuestion({ pointsFor: (i) => (i === 1 ? 100 : 10) })
    await runQuestion({ pointsFor: (i) => (i === 0 ? 100 : 10) })

    const first = (await board(teacher, room._id).expect(200)).body.leaderboard
    expect(first[0]).toMatchObject({ studentName: 'Student 0', totalPoints: 210, totalAnswered: 3 })
    expect(first[1]).toMatchObject({ studentName: 'Student 1', totalPoints: 120, totalAnswered: 3 })
    expect(first.at(-1)).toMatchObject({ totalPoints: 30, totalAnswered: 3 })

    // Hitting it repeatedly must not drift (the failure mode of a running total is double-counting).
    for (let i = 0; i < 3; i++) {
      expect((await board(teacher, room._id).expect(200)).body.leaderboard).toEqual(first)
    }
  })

  it('reflects answers to the still-open question immediately', async () => {
    await runQuestion({ pointsFor: () => 10 })
    const live = await runQuestion({ close: false, pointsFor: (i) => (i === 5 ? 90 : 0) })

    const before = (await board(teacher, room._id).expect(200)).body.leaderboard
    expect(before[0]).toMatchObject({ studentName: 'Student 5', totalPoints: 100 })

    // A late answer to the open poll from someone who had not answered it yet.
    await Response.deleteOne({ questionId: live._id, studentId: students[7]._id })
    await Response.create({
      roomId: room._id, questionId: live._id, studentId: students[7]._id,
      selectedOption: 0, isCorrect: true, points: 95
    })

    const after = (await board(teacher, room._id).expect(200)).body.leaderboard
    expect(after[0]).toMatchObject({ studentName: 'Student 7', totalPoints: 105 })
    expect(after.find((e) => e.studentId === students[5]._id.toString())).toMatchObject({ totalPoints: 100 })
  })

  it('returns an empty board before anyone has answered', async () => {
    const res = await board(teacher, room._id).expect(200)
    expect(res.body).toMatchObject({ leaderboard: [], totalParticipants: 0, isTeacher: true })
  })
})
