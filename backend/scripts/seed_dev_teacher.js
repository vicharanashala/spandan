import 'dotenv/config'
import mongoose from 'mongoose'
import User from '../src/models/User.js'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/spandan'

async function main() {
  await mongoose.connect(MONGODB_URI)
  console.log(`[seed] connected to ${MONGODB_URI}`)

  const email = 'admin.teacher@example.com'

  let user = await User.findOne({ email })
  if (user) {
    console.log(`[seed] user already exists (${email}, role=${user.role})`)
  } else {
    user = new User({
      name: 'Demo Admin Teacher',
      email,
      password: 'Teacher@123',
      role: 'teacher',
      teacherApprovalStatus: 'approved',
      isAdmin: true,
      department: 'Computer Science',
      employeeId: 'TEACHER-DEMO-001',
      qualifications: 'B.Tech, M.Tech'
    })
    await user.save()
    console.log(`[seed] created admin teacher (${email})`)
  }

  user.name = 'Demo Admin Teacher'
  user.isAdmin = true
  await user.save()
  console.log('[seed] name set to Demo Admin Teacher (admin tutorial)')
  console.log('[seed] hasSeenOnboarding reset to false')

  await mongoose.disconnect()
  console.log('[seed] done')
}

main().catch((err) => {
  console.error('[seed] failed:', err.message)
  process.exit(1)
})