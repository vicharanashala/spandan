import mongoose from 'mongoose'
import request from 'supertest'
import express from 'express'
import User from '../models/User.js'
import Room from '../models/Room.js'
import Question from '../models/Question.js'
import Response from '../models/Response.js'
import RoomMember from '../models/RoomMember.js'
import Doubt from '../models/Doubt.js'
import { generateToken } from '../middleware/auth.js'
import roomsRouter from '../routes/rooms.js'
import doubtsRouter from '../routes/doubts.js'
import responsesRouter from '../routes/responses.js'
import { deleteRoom } from '../services/roomService.js'

describe('New Features Audit & Regression Suite', () => {
  let app
  let teacher
  let teacherToken
  let student1
  let student1Token
  let student2
  let student2Token
  let outsider
  let outsiderToken
  let room

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URL)
    app = express()
    app.use(express.json())
    app.use('/api/rooms', roomsRouter)
    app.use('/api/doubts', doubtsRouter)
    app.use('/api/responses', responsesRouter)
  })

  beforeEach(async () => {
    await Room.deleteMany({})
    await Question.deleteMany({})
    await Response.deleteMany({})
    await RoomMember.deleteMany({})
    await Doubt.deleteMany({})

    // Setup teacher
    teacher = await User.create({
      name: 'Audit Teacher',
      email: `teacher_${Date.now()}_${Math.random()}@spandan.test`,
      password: 'HashedPassword123!',
      role: 'teacher',
      teacherApprovalStatus: 'approved',
      termsVersion: '1.0'
    })
    teacherToken = generateToken(teacher._id)

    // Setup student1
    student1 = await User.create({
      name: 'Student One',
      email: `student1_${Date.now()}_${Math.random()}@spandan.test`,
      password: 'HashedPassword123!',
      role: 'student',
      termsVersion: '1.0'
    })
    student1Token = generateToken(student1._id)

    // Setup student2
    student2 = await User.create({
      name: 'Student Two',
      email: `student2_${Date.now()}_${Math.random()}@spandan.test`,
      password: 'HashedPassword123!',
      role: 'student',
      termsVersion: '1.0'
    })
    student2Token = generateToken(student2._id)

    // Setup outsider (not joined room)
    outsider = await User.create({
      name: 'Outsider Student',
      email: `outsider_${Date.now()}_${Math.random()}@spandan.test`,
      password: 'HashedPassword123!',
      role: 'student',
      termsVersion: '1.0'
    })
    outsiderToken = generateToken(outsider._id)

    room = await Room.create({
      name: 'Physics 101',
      teacher: teacher._id,
      settings: { mode: 'normal', timeToAnswer: 30 }
    })

    await RoomMember.create({ roomId: room._id, studentId: student1._id })
    await RoomMember.create({ roomId: room._id, studentId: student2._id })
  })

  afterAll(async () => {
    await User.deleteMany({})
    await Room.deleteMany({})
    await Question.deleteMany({})
    await Response.deleteMany({})
    await RoomMember.deleteMany({})
    await Doubt.deleteMany({})
    await mongoose.disconnect()
  })

  // -----------------------------------------------------------------------------
  // Feature A: Streaks - Correctness Withholding while Poll is Live
  // -----------------------------------------------------------------------------
  describe('Streaks & Correctness Withholding', () => {
    it('withholds correctness on student response query while question is live', async () => {
      const q = await Question.create({
        roomId: room._id,
        type: 'MCQ',
        question: 'What is Newton second law?',
        options: [
          { text: 'F=ma', isCorrect: true },
          { text: 'F=mv', isCorrect: false }
        ],
        status: 'approved',
        points: 100,
        timeToAnswer: 30
      })

      // Set as live question
      room.currentQuestion = q._id
      await room.save()

      // Student answers correctly
      await Response.create({
        roomId: room._id,
        questionId: q._id,
        studentId: student1._id,
        selectedOption: 0,
        selectedOptions: [0],
        isCorrect: true,
        points: 100,
        responseTime: 5
      })

      // Student fetches responses while question is still current
      const res = await request(app)
        .get(`/api/responses/room/${room._id}/student/${student1._id}`)
        .set('Authorization', `Bearer ${student1Token}`)

      expect(res.status).toBe(200)
      const returnedQ = res.body.questions.find((item) => item._id === q._id.toString())
      expect(returnedQ).toBeDefined()
      expect(returnedQ.resultPending).toBe(true)
      expect(returnedQ.isCorrect).toBeUndefined() // CRITICAL: must not leak correctness while live
      expect(returnedQ.pointsEarned).toBeUndefined()

      // Now poll closes (currentQuestion becomes null or room ends)
      room.currentQuestion = null
      await room.save()

      const resAfterClose = await request(app)
        .get(`/api/responses/room/${room._id}/student/${student1._id}`)
        .set('Authorization', `Bearer ${student1Token}`)

      const revealedQ = resAfterClose.body.questions.find((item) => item._id === q._id.toString())
      expect(revealedQ.resultPending).toBeUndefined()
      expect(revealedQ.isCorrect).toBe(true) // Now revealed after poll close
      expect(revealedQ.pointsEarned).toBe(100)
    })
  })

  // -----------------------------------------------------------------------------
  // Feature B: Questions to Revise
  // -----------------------------------------------------------------------------
  describe('Questions to Revise logic', () => {
    it('identifies 5 lowest accuracy questions with responses and excludes zero-response questions', () => {
      const questionList = [
        { id: 'q1', n: 1, responses: 10, correctRate: 80, correct: 8 },
        { id: 'q2', n: 2, responses: 15, correctRate: 20, correct: 3 },
        { id: 'q3', n: 3, responses: 0, correctRate: null, correct: 0 }, // zero responses -> must NOT appear
        { id: 'q4', n: 4, responses: 12, correctRate: 10, correct: 1 },
        { id: 'q5', n: 5, responses: 8, correctRate: 35, correct: 3 },
        { id: 'q6', n: 6, responses: 20, correctRate: 50, correct: 10 },
        { id: 'q7', n: 7, responses: 14, correctRate: 25, correct: 4 }
      ]

      // Filter and sort per specification
      const questionsToRevise = [...questionList]
        .filter((q) => q.responses > 0 && q.correctRate !== null)
        .sort((a, b) => (a.correctRate - b.correctRate) || (b.responses - a.responses))
        .slice(0, 5)

      expect(questionsToRevise).toHaveLength(5)
      expect(questionsToRevise.map((q) => q.id)).toEqual(['q4', 'q2', 'q7', 'q5', 'q6'])
      // Zero-response question q3 is excluded
      expect(questionsToRevise.find((q) => q.id === 'q3')).toBeUndefined()
      // Lowest accuracy is first
      expect(questionsToRevise[0].correctRate).toBe(10)
    })
  })

  // -----------------------------------------------------------------------------
  // Feature C: Duplicate Room
  // -----------------------------------------------------------------------------
  describe('Duplicate Room API', () => {
    it('allows owner to duplicate room and clones approved questions cleanly', async () => {
      await Question.create({
        roomId: room._id,
        type: 'MCQ',
        question: 'Approved Q1',
        options: [{ text: 'Yes', isCorrect: true }, { text: 'No', isCorrect: false }],
        status: 'approved',
        points: 100
      })

      await Question.create({
        roomId: room._id,
        type: 'MCQ',
        question: 'Pending Q2',
        options: [{ text: 'A', isCorrect: true }],
        status: 'pending' // Should not be cloned
      })

      const res = await request(app)
        .post(`/api/rooms/${room._id}/duplicate`)
        .set('Authorization', `Bearer ${teacherToken}`)

      expect(res.status).toBe(201)
      expect(res.body.room.name).toBe('Physics 101 (Copy)')
      expect(res.body.room.code).toBeDefined()
      expect(res.body.room.code).not.toBe(room.code)
      expect(res.body.room.questionCount).toBe(1) // Only approved questions

      // Check clean slate: 0 members in new room
      const newRoomMembers = await RoomMember.countDocuments({ roomId: res.body.room._id })
      expect(newRoomMembers).toBe(0)
    })

    it('rejects duplication by unauthorized teacher', async () => {
      const otherTeacher = await User.create({
        name: 'Other Teacher',
        email: 'other.teacher@spandan.test',
        password: 'Password123!',
        role: 'teacher',
        teacherApprovalStatus: 'approved',
        termsVersion: '1.0'
      })
      const otherToken = generateToken(otherTeacher._id)

      const res = await request(app)
        .post(`/api/rooms/${room._id}/duplicate`)
        .set('Authorization', `Bearer ${otherToken}`)

      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/authorized/)
    })
  })

  // -----------------------------------------------------------------------------
  // Feature D: Anonymous Doubt Box
  // -----------------------------------------------------------------------------
  describe('Anonymous Doubt Box API', () => {
    it('allows room member to post doubt (<= 500 chars) and sanitizes author id', async () => {
      const res = await request(app)
        .post('/api/doubts')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          roomId: room._id,
          text: 'Can we re-explain rotational inertia?'
        })

      expect(res.status).toBe(201)
      expect(res.body.doubt.text).toBe('Can we re-explain rotational inertia?')
      expect(res.body.doubt.studentId).toBeUndefined()
      expect(res.body.doubt.authorId).toBeUndefined()
      expect(res.body.doubt.upvotes).toBeUndefined()
    })

    it('rejects non-members from posting doubts', async () => {
      const res = await request(app)
        .post('/api/doubts')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({
          roomId: room._id,
          text: 'I am not enrolled here!'
        })

      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/members/)
    })

    it('rejects doubts exceeding 500 characters', async () => {
      const longText = 'A'.repeat(501)
      const res = await request(app)
        .post('/api/doubts')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          roomId: room._id,
          text: longText
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/500/)
    })

    it('blocks doubt posting after room has ended', async () => {
      room.endedAt = new Date()
      await room.save()

      const res = await request(app)
        .post('/api/doubts')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          roomId: room._id,
          text: 'Is class still open?'
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/ended/)
    })

    it('enforces idempotent upvoting: second tap does not raise count', async () => {
      const doubt = await Doubt.create({
        roomId: room._id,
        studentId: student1._id,
        text: 'What is angular momentum?'
      })

      // First upvote
      const res1 = await request(app)
        .post(`/api/doubts/${doubt._id}/upvote`)
        .set('Authorization', `Bearer ${student2Token}`)

      expect(res1.status).toBe(200)
      expect(res1.body.upvoteCount).toBe(1)
      expect(res1.body.hasUpvoted).toBe(true)

      // Second tap (idempotent)
      const res2 = await request(app)
        .post(`/api/doubts/${doubt._id}/upvote`)
        .set('Authorization', `Bearer ${student2Token}`)

      expect(res2.status).toBe(200)
      expect(res2.body.upvoteCount).toBe(1) // Still 1, does not raise count
      expect(res2.body.hasUpvoted).toBe(true)
    })

    it('sorts doubts by most upvoted first with oldest-first on ties', async () => {
      const t1 = new Date('2026-10-31T10:00:00Z')
      const t2 = new Date('2026-10-31T10:05:00Z')
      const t3 = new Date('2026-10-31T10:10:00Z')

      const d1 = await Doubt.create({ roomId: room._id, studentId: student1._id, text: 'Doubt Older 5 votes', upvoteCount: 5, createdAt: t1 })
      const d2 = await Doubt.create({ roomId: room._id, studentId: student1._id, text: 'Doubt Newer 5 votes', upvoteCount: 5, createdAt: t2 })
      const d3 = await Doubt.create({ roomId: room._id, studentId: student1._id, text: 'Doubt Top 10 votes', upvoteCount: 10, createdAt: t3 })

      const res = await request(app)
        .get(`/api/doubts/${room._id}`)
        .set('Authorization', `Bearer ${student1Token}`)

      expect(res.status).toBe(200)
      expect(res.body.doubts[0]._id).toBe(d3._id.toString()) // 10 votes first
      expect(res.body.doubts[1]._id).toBe(d1._id.toString()) // 5 votes (older, t1)
      expect(res.body.doubts[2]._id).toBe(d2._id.toString()) // 5 votes (newer, t2)
    })

    it('cascade deletes doubts when a room is deleted', async () => {
      await Doubt.create({
        roomId: room._id,
        studentId: student1._id,
        text: 'To be cascade deleted'
      })

      const countBefore = await Doubt.countDocuments({ roomId: room._id })
      expect(countBefore).toBe(1)

      await deleteRoom(room._id)

      const countAfter = await Doubt.countDocuments({ roomId: room._id })
      expect(countAfter).toBe(0) // Cleaned up cleanly
    })

    it('exposes authorName and authorEmail to room teacher for harassment prevention, but conceals from peers', async () => {
      const doubt = await Doubt.create({
        roomId: room._id,
        studentId: student1._id,
        text: 'Anonymous to peers, accountable to teacher'
      })

      // Student fetch: authorName, authorEmail, studentId MUST BE UNDEFINED
      const studentRes = await request(app)
        .get(`/api/doubts/${room._id}`)
        .set('Authorization', `Bearer ${student2Token}`)
      expect(studentRes.status).toBe(200)
      const studentDoubt = studentRes.body.doubts.find(d => d._id === doubt._id.toString())
      expect(studentDoubt.authorName).toBeUndefined()
      expect(studentDoubt.authorEmail).toBeUndefined()
      expect(studentDoubt.studentId).toBeUndefined()

      // Teacher fetch: authorName and authorEmail MUST BE PRESENT for anti-abuse accountability
      const teacherRes = await request(app)
        .get(`/api/doubts/${room._id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
      expect(teacherRes.status).toBe(200)
      const teacherDoubt = teacherRes.body.doubts.find(d => d._id === doubt._id.toString())
      expect(teacherDoubt.authorName).toBe(student1.name)
      expect(teacherDoubt.authorEmail).toBe(student1.email)
    })

    it('allows teacher to delete an abusive doubt, but rejects non-owner or student deletion', async () => {
      const doubt = await Doubt.create({
        roomId: room._id,
        studentId: student1._id,
        text: 'Abusive trolling post to be moderated'
      })

      // Student attempts delete -> 403
      const studentDel = await request(app)
        .delete(`/api/doubts/${doubt._id}`)
        .set('Authorization', `Bearer ${student1Token}`)
      expect(studentDel.status).toBe(403)

      // Teacher deletes -> 200
      const teacherDel = await request(app)
        .delete(`/api/doubts/${doubt._id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
      expect(teacherDel.status).toBe(200)

      const found = await Doubt.findById(doubt._id)
      expect(found).toBeNull()
    })

    it('stores optional confusedReason on response and provides it to room teacher', async () => {
      const q = await Question.create({
        roomId: room._id,
        question: 'Explain quantum superposition',
        type: 'MCQ',
        options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
        status: 'approved'
      })

      // Set as live question in room
      room.currentQuestion = q._id
      await room.save()

      // Student submits response with isConfused: true and a specific reason
      const submitRes = await request(app)
        .post('/api/responses')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          roomId: room._id,
          questionId: q._id,
          studentId: student1._id,
          selectedOptions: [0],
          isConfused: true,
          confusedReason: 'Step 2 derivation is mathematically unclear to me'
        })
      expect(submitRes.status).toBe(201)

      // Teacher retrieves confused reasons
      const reasonsRes = await request(app)
        .get(`/api/responses/confused-reasons/${room._id}/${q._id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
      expect(reasonsRes.status).toBe(200)
      expect(reasonsRes.body.reasons).toContain('Step 2 derivation is mathematically unclear to me')
    })
  })
})
