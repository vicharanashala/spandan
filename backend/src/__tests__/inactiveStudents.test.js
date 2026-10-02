import express from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import Response from '../models/Response.js'
import Question from '../models/Question.js'
import User from '../models/User.js'
import responsesRouter from '../routes/responses.js'
import { generateToken, clearUserCache } from '../middleware/auth.js'

const app = express()
app.use(express.json())
app.use('/api/responses', responsesRouter)

const at = (hour, minute = 0) => new Date(Date.UTC(2025, 0, 1, hour, minute))

async function createUser(name, email, role = 'student') {
  return User.create({
    name,
    email,
    password: 'password123',
    role,
    ...(role === 'teacher' ? { teacherApprovalStatus: 'approved' } : {})
  })
}

async function createEndedRoom(teacher) {
  return Room.create({ name: 'Participation report', teacher: teacher._id, endedAt: at(12) })
}

async function createQuestions(room) {
  return Promise.all([1, 2, 3, 4, 5].map((hour) => Question.create({
    roomId: room._id,
    type: 'MCQ',
    question: `Question ${hour}`,
    options: [{ text: 'Correct', isCorrect: true }, { text: 'Wrong', isCorrect: false }],
    status: 'approved',
    createdAt: at(hour)
  })))
}

async function answer(room, student, question, { wrong = false } = {}) {
  return Response.create({
    roomId: room._id,
    questionId: question._id,
    studentId: student._id,
    selectedOption: wrong ? 1 : 0,
    isCorrect: !wrong
  })
}

describe('Inactive students report', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URL)
  })

  afterAll(async () => {
    await mongoose.disconnect()
  })

  beforeEach(async () => {
    clearUserCache()
    await Promise.all([
      Response.deleteMany({}),
      RoomMember.deleteMany({}),
      Question.deleteMany({}),
      Room.deleteMany({}),
      User.deleteMany({})
    ])
  }, 30000)

  it('counts eligible polls by joined time and treats wrong answers as answered', async () => {
    const teacher = await createUser('Teacher', 'teacher@example.com', 'teacher')
    const room = await createEndedRoom(teacher)
    const questions = await createQuestions(room)
    const allAnswered = await createUser('All Answered', 'all@example.com')
    const wrongButTouched = await createUser('Wrong But Touched', 'wrong@example.com')
    const thresholdMissed = await createUser('Threshold Missed', 'threshold@example.com')
    const lateJoiner = await createUser('Late Joiner', 'late@example.com')

    await RoomMember.create([
      { roomId: room._id, studentId: allAnswered._id, joinedAt: at(0) },
      { roomId: room._id, studentId: wrongButTouched._id, joinedAt: at(0) },
      { roomId: room._id, studentId: thresholdMissed._id, joinedAt: at(0) },
      { roomId: room._id, studentId: lateJoiner._id, joinedAt: at(3, 30) }
    ])

    for (const question of questions) {
      await answer(room, allAnswered, question)
      await answer(room, wrongButTouched, question, { wrong: true })
    }
    await answer(room, lateJoiner, questions[3])

    const response = await request(app)
      .get(`/api/responses/stats/room/${room._id}/inactive-students`)
      .set('Authorization', `Bearer ${generateToken(teacher._id)}`)
      .expect(200)

    expect(response.body).toMatchObject({ success: true, threshold: 5 })
    const byEmail = new Map(response.body.students.map((student) => [student.email, student]))
    expect(byEmail.get('all@example.com')).toMatchObject({
      totalEligible: 5, totalAnswered: 5, totalMissed: 0, flagged: false
    })
    expect(byEmail.get('wrong@example.com')).toMatchObject({
      totalEligible: 5, totalAnswered: 5, totalMissed: 0, flagged: false
    })
    expect(byEmail.get('threshold@example.com')).toMatchObject({
      totalEligible: 5, totalAnswered: 0, totalMissed: 5, flagged: true
    })
    expect(byEmail.get('late@example.com')).toMatchObject({
      totalEligible: 2, totalAnswered: 1, totalMissed: 1, flagged: false
    })
  })

  it('rejects report generation until the room has ended', async () => {
    const teacher = await createUser('Teacher', 'live-teacher@example.com', 'teacher')
    const room = await Room.create({ name: 'Live room', teacher: teacher._id })

    const response = await request(app)
      .get(`/api/responses/stats/room/${room._id}/inactive-students`)
      .set('Authorization', `Bearer ${generateToken(teacher._id)}`)
      .expect(400)

    expect(response.body.error).toBe('Room must be ended to generate this report')
  })
})
