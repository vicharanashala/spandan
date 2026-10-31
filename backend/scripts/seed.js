import mongoose from 'mongoose'
import { User, Room, Question } from '../src/models/index.js'
import dotenv from 'dotenv'

dotenv.config()

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/spandan'

async function seed() {
  try {
    await mongoose.connect(mongoUri)
    console.log('Connected to MongoDB for seeding...')

    // Clean existing test data if any
    await User.deleteMany({ email: { $in: ['teacher@spandan.test', 'student@spandan.test'] } })
    await Room.deleteMany({ code: 'DEMO12' })

    // Create Teacher
    const teacher = new User({
      name: 'Prof. Sharma',
      email: 'teacher@spandan.test',
      password: 'Teacher123!',
      role: 'teacher',
      teacherApprovalStatus: 'approved',
      termsVersion: '1.0',
      termsAcceptedAt: new Date()
    })
    await teacher.save()
    console.log('Created teacher: teacher@spandan.test / Teacher123!')

    // Create Student
    const student = new User({
      name: 'Rohan Verma',
      email: 'student@spandan.test',
      password: 'Student123!',
      role: 'student',
      termsVersion: '1.0',
      termsAcceptedAt: new Date()
    })
    await student.save()
    console.log('Created student: student@spandan.test / Student123!')

    // Create Room
    const room = new Room({
      name: 'Physics Interactive Class (Demo)',
      teacher: teacher._id,
      code: 'DEMO12',
      isActive: true,
      settings: {
        allowLateJoin: true,
        showResultsImmediately: true,
        timeToAnswer: 30,
        points: 100,
        difficulty: 'medium'
      }
    })
    await room.save()
    console.log('Created room: code DEMO12 (ID:', room._id, ')')

    // Create 3 Approved Questions for this room
    const q1 = new Question({
      roomId: room._id,
      type: 'MCQ',
      question: 'What is the SI unit of electric force / force in general?',
      options: [
        { text: 'Joule', isCorrect: false },
        { text: 'Newton', isCorrect: true },
        { text: 'Pascal', isCorrect: false },
        { text: 'Watt', isCorrect: false }
      ],
      explanation: 'Force is measured in Newtons (N), named after Isaac Newton.',
      status: 'approved',
      createdBy: teacher._id,
      timeToAnswer: 30,
      points: 100
    })

    const q2 = new Question({
      roomId: room._id,
      type: 'TF',
      question: 'Electrons carry a positive electrical charge.',
      options: [
        { text: 'True', isCorrect: false },
        { text: 'False', isCorrect: true }
      ],
      explanation: 'Electrons have a negative charge of -1.6 x 10^-19 Coulombs. Protons have positive charge.',
      status: 'approved',
      createdBy: teacher._id,
      timeToAnswer: 25,
      points: 100
    })

    const q3 = new Question({
      roomId: room._id,
      type: 'MCQ',
      question: 'Which law states that current is directly proportional to voltage at constant temperature?',
      options: [
        { text: "Coulomb's Law", isCorrect: false },
        { text: "Ohm's Law", isCorrect: true },
        { text: "Faraday's Law", isCorrect: false },
        { text: "Ampere's Law", isCorrect: false }
      ],
      explanation: "Ohm's law states that V = I * R.",
      status: 'approved',
      createdBy: teacher._id,
      timeToAnswer: 30,
      points: 100
    })

    await q1.save()
    await q2.save()
    await q3.save()
    console.log('Created 3 sample approved questions!')

    console.log('Seeding completed successfully!')
    process.exit(0)
  } catch (err) {
    console.error('Seeding error:', err)
    process.exit(1)
  }
}

seed()
