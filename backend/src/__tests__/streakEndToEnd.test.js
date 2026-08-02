/**
 * Streak Fire end-to-end harness.
 *
 * Boots the routes we need via supertest against the in-memory MongoDB
 * provided by @shelf/jest-mongodb, walks through:
 *   1. Register a teacher
 *   2. Teacher creates a room
 *   3. Register a student
 *   4. Student joins the room by code
 *   5. Teacher creates 3 questions (MCQ with option 0 correct)
 *   6. Student submits 3 correct answers in a row
 *   7. GET /api/responses/leaderboard/:roomId  -> print raw JSON
 *
 * Then asserts currentStreak / bestStreak are present and currentStreak
 * reads the expected value.
 */
import request from 'supertest'
import mongoose from 'mongoose'
import { buildTestApp } from './testApp.js'

// Ensure env vars are set BEFORE the app boots (JWT_SECRET etc.)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-streak-suite'
process.env.NODE_ENV  = 'test'

let app

beforeAll(async () => {
  app = await buildTestApp()
})

afterAll(async () => {
  try { await mongoose.connection.close() } catch (_) { /* noop */ }
})

describe('Streak Fire - end-to-end', () => {
  let teacherToken, teacherId
  let studentToken, studentId
  let roomId, roomCode
  const questionIds = []

  test('1) register teacher', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Streak Teacher',
        email: `teacher+${Date.now()}@streak.test`,
        password: 'StrongPass!1',
        role: 'teacher'
      })
    expect(res.status).toBe(201)
    expect(res.body.token).toBeTruthy()
    teacherToken = res.body.token
    teacherId = res.body.user._id
  })

  test('2) create room', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'Streak Room', settings: { timePerQuestion: 30 } })
    expect(res.status).toBe(201)
    expect(res.body.room).toBeTruthy()
    roomId = res.body.room._id
    roomCode = res.body.room.code
  })

  test('3) register student', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Streak Student',
        email: `student+${Date.now()}@streak.test`,
        password: 'StrongPass!1',
        role: 'student'
      })
    expect(res.status).toBe(201)
    expect(res.body.token).toBeTruthy()
    studentToken = res.body.token
    studentId = res.body.user._id
  })

  test('4) student joins room by code', async () => {
    const res = await request(app)
      .get(`/api/rooms/join/${roomCode}`)
      .set('Authorization', `Bearer ${studentToken}`)
    expect(res.status).toBe(200)
  })

  test('5) teacher creates 3 MCQ questions (option 0 is correct)', async () => {
    for (let i = 0; i < 3; i++) {
      // Stagger createdAt so the missed-question sweep can distinguish order.
      const res = await request(app)
        .post('/api/questions')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          roomId,
          type: 'MCQ',
          question: `Streak Q${i + 1}?`,
          options: [
            { text: 'Correct', isCorrect: true },
            { text: 'Wrong',  isCorrect: false }
          ],
          status: 'approved',
          timeToAnswer: 30,
          points: 100
        })
      expect([200, 201]).toContain(res.status)
      const id = res.body.question?._id || res.body._id || res.body.question?.id
      expect(id).toBeTruthy()
      questionIds.push(id)
      // Tiny sleep so createdAt ordering is reliable on fast machines
      await new Promise(r => setTimeout(r, 5))
    }
  })

  test('6) student submits 3 correct answers in a row', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/responses')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          roomId,
          questionId: questionIds[i],
          selectedOptions: [0],   // option 0 is correct
          responseTime: 1
        })
      expect([200, 201]).toContain(res.status)
      expect(res.body.response?.isCorrect).toBe(true)
      // The handler now returns a `streak` block; verify it
      expect(res.body.streak).toBeTruthy()
      // currentStreak should equal 2*(i+1) under the +2-on-correct rule
      expect(res.body.streak.currentStreak).toBe(2 * (i + 1))
      expect(res.body.streak.bestStreak).toBe(2 * (i + 1))
    }
  })

  test('7) GET /api/responses/leaderboard/:roomId - print RAW JSON', async () => {
    const res = await request(app)
      .get(`/api/responses/leaderboard/${roomId}`)
      .set('Authorization', `Bearer ${studentToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // Print the raw JSON
    // eslint-disable-next-line no-console
    console.log('\n========== RAW LEADERBOARD JSON ==========')
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(res.body, null, 2))
    // eslint-disable-next-line no-console
    console.log('========== /RAW LEADERBOARD JSON ==========\n')

    const entry = res.body.leaderboard?.[0]
    expect(entry).toBeTruthy()

    // eslint-disable-next-line no-console
    console.log('First leaderboard entry keys:', Object.keys(entry))
    // eslint-disable-next-line no-console
    console.log('currentStreak =', entry.currentStreak)
    // eslint-disable-next-line no-console
    console.log('bestStreak    =', entry.bestStreak)

    // The student just answered 3 in a row with no missed questions,
    // and the streak spec is +2 per correct answer, so currentStreak
    // must be 6 (3 * 2) and bestStreak must be 6.
    expect(entry.currentStreak).toBe(6)
    expect(entry.bestStreak).toBe(6)
  })
})