import mongoose from 'mongoose'
import { User, Room } from '../src/models/index.js'
import dotenv from 'dotenv'

dotenv.config()

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/spandan'

async function setup() {
  try {
    await mongoose.connect(mongoUri)
    console.log('Connected to MongoDB...')

    const email = 'teacher@spandan.test'
    let user = await User.findOne({ email })
    
    if (user) {
      user.password = 'Password123!'
      user.role = 'teacher'
      user.teacherApprovalStatus = 'approved'
      user.termsVersion = '1.0'
      user.termsAcceptedAt = new Date()
      await user.save()
      console.log(`Updated user ${email}: password set to Password123! (approved teacher)`)
    } else {
      user = new User({
        name: 'Teacher',
        email,
        password: 'Password123!',
        role: 'teacher',
        teacherApprovalStatus: 'approved',
        termsVersion: '1.0',
        termsAcceptedAt: new Date()
      })
      await user.save()
      console.log(`Created user ${email}: password set to Password123! (approved teacher)`)
    }

    // Assign DEMO12 room to this user as well so they see it immediately
    const room = await Room.findOne({ code: 'DEMO12' })
    if (room) {
      room.teacher = user._id
      await room.save()
      console.log(`Assigned room DEMO12 to ${email}`)
    }

    console.log('\n--- Credentials for User ---')
    console.log(`Email:    ${email}`)
    console.log(`Password: Password123!`)
    console.log(`Role:     Teacher (Approved)`)
    console.log(`Room:     DEMO12\n`)

    process.exit(0)
  } catch (err) {
    console.error('Error in setup:', err)
    process.exit(1)
  }
}

setup()
