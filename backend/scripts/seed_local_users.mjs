// Local-development seed: creates an approved admin, teacher and student so you can
// sign in immediately without the email-OTP registration flow.
// Run from the repo root:  node backend/scripts/seed_local_users.mjs
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import User from '../src/models/User.js'
import { TERMS_VERSION } from '../src/config/terms.js'

dotenv.config()

const accounts = [
  {
    name: 'Local Admin',
    email: 'admin@spandan.local',
    password: 'Admin@1234',
    role: 'teacher',
    isAdmin: true
  },
  {
    name: 'Local Teacher',
    email: 'teacher@spandan.local',
    password: 'Teacher@1234',
    role: 'teacher'
  },
  {
    name: 'Local Student',
    email: 'student@spandan.local',
    password: 'Student@1234',
    role: 'student'
  }
]

const run = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/spandan'
  await mongoose.connect(uri)
  console.log(`Connected to ${uri}`)

  for (const data of accounts) {
    const existing = await User.findOne({ email: data.email })
    if (existing) {
      // Reset password / approval so the documented credentials always work.
      existing.name = data.name
      existing.role = data.role
      existing.password = data.password
      existing.teacherApprovalStatus = 'approved'
      existing.termsVersion = TERMS_VERSION
      existing.termsAcceptedAt = new Date()
      if (data.isAdmin) existing.isAdmin = true
      await existing.save()
      console.log(`Updated ${data.role}: ${data.email}`)
    } else {
      const user = new User({
        ...data,
        teacherApprovalStatus: 'approved',
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: new Date()
      })
      await user.save()
      console.log(`Created ${data.role}: ${data.email}`)
    }
  }

  await mongoose.disconnect()
  console.log('Done.')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
