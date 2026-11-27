// Local-development seed: one teacher + ten students for demos.
// Run from the repo root:  node backend/scripts/seed_extra_users.mjs
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import User from '../src/models/User.js'
import { TERMS_VERSION } from '../src/config/terms.js'

dotenv.config()

const accounts = [
  {
    name: 'Demo Teacher',
    email: 'teacher@example.com',
    password: 'Teacher@123',
    role: 'teacher'
  },
  ...Array.from({ length: 10 }, (_, i) => ({
    name: `Student ${i + 1}`,
    email: `student${i + 1}@example.com`,
    password: 'Student@123',
    role: 'student'
  }))
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
