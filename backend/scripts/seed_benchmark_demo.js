import 'dotenv/config'
import mongoose from 'mongoose'
import User from '../src/models/User.js'
import Room from '../src/models/Room.js'
import Question from '../src/models/Question.js'
import Response from '../src/models/Response.js'
import RoomMember from '../src/models/RoomMember.js'

await mongoose.connect(process.env.MONGODB_URI)

const student = await User.findOne({ email: 'sree@gmail.com' })
if (!student) throw new Error('Student account sree@gmail.com was not found')

const oldRooms = await Room.find({ name: /^Benchmark Demo/ }).select('_id')
const oldRoomIds = oldRooms.map(room => room._id)
await Promise.all([
  Response.deleteMany({ roomId: { $in: oldRoomIds } }),
  Question.deleteMany({ roomId: { $in: oldRoomIds } }),
  RoomMember.deleteMany({ roomId: { $in: oldRoomIds } }),
  Room.deleteMany({ _id: { $in: oldRoomIds } })
])

const teacher = await User.findOneAndUpdate(
  { email: 'benchmark.demo@spandan.local' },
  {
    $setOnInsert: {
      name: 'Benchmark Demo Teacher',
      email: 'benchmark.demo@spandan.local',
      password: 'benchmark-demo-password',
      role: 'teacher',
      teacherApprovalStatus: 'approved'
    }
  },
  { upsert: true, new: true }
)

const cohort = []
for (const [index, name] of ['Aarav', 'Mira', 'Kabir'].entries()) {
  cohort.push(await User.findOneAndUpdate(
    { email: `benchmark.student${index}@spandan.local` },
    {
      $setOnInsert: {
        name,
        email: `benchmark.student${index}@spandan.local`,
        password: 'benchmark-demo-password',
        role: 'student'
      }
    },
    { upsert: true, new: true }
  ))
}

const rooms = await Room.create([
  { name: 'Benchmark Demo - Algebra', teacher: teacher._id, endedAt: new Date(), isActive: false },
  { name: 'Benchmark Demo - Biology', teacher: teacher._id, endedAt: new Date(), isActive: false }
])

const questions = []
for (const [roomIndex, room] of rooms.entries()) {
  for (const questionIndex of [0, 1]) {
    questions.push(await Question.create({
      roomId: room._id,
      type: 'MCQ',
      question: `Demo benchmark question ${roomIndex * 2 + questionIndex + 1}`,
      options: [{ text: 'Correct', isCorrect: true }, { text: 'Other', isCorrect: false }],
      status: 'approved',
      createdBy: teacher._id
    }))
  }
}

await RoomMember.insertMany(rooms.map(room => ({ roomId: room._id, studentId: student._id })))

const studentResponses = [
  [0, true], [1, false], [2, true], [3, true]
].map(([questionIndex, isCorrect]) => ({
  roomId: questions[questionIndex].roomId,
  questionId: questions[questionIndex]._id,
  studentId: student._id,
  selectedOption: isCorrect ? 0 : 1,
  isCorrect,
  points: isCorrect ? 100 : 0
}))

const cohortResponses = rooms.flatMap((room, roomIndex) => cohort.flatMap((person, personIndex) => (
  questions.slice(roomIndex * 2, roomIndex * 2 + 2).map((question, questionIndex) => {
    const isCorrect = (personIndex + questionIndex) % 2 === 0
    return {
      roomId: room._id,
      questionId: question._id,
      studentId: person._id,
      selectedOption: isCorrect ? 0 : 1,
      isCorrect,
      points: isCorrect ? 100 : 0
    }
  })
)))

await Response.insertMany([...studentResponses, ...cohortResponses])
console.log(JSON.stringify({
  studentId: String(student._id),
  rooms: rooms.map(room => ({ name: room.name, code: room.code })),
  studentResponses: studentResponses.length,
  cohortResponses: cohortResponses.length
}, null, 2))
await mongoose.disconnect()
