import 'dotenv/config'
import mongoose from 'mongoose'
import User from '../src/models/User.js'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/spandan'

async function main() {
  await mongoose.connect(MONGODB_URI)
  console.log(`[seed] connected to ${MONGODB_URI}`)

  const email = 'teacher.demo@example.com'

  let user = await User.findOne({ email })
  if (user) {
    console.log(`[seed] user already exists at ${email}, converting to non-admin demo teacher`)
  } else {
    user = new User({
      name: 'Demo Teacher',
      email,
      password: 'Teacher@123',
      role: 'teacher',
      teacherApprovalStatus: 'approved',
      isAdmin: false,
      department: 'Computer Science',
      employeeId: 'TEACHER-DEMO-001',
      qualifications: 'B.Tech, M.Tech'
    })
    await user.save()
    console.log(`[seed] created non-admin teacher (${email})`)
  }

  user.name = 'Demo Teacher'
  user.isAdmin = false
  user.hasSeenOnboarding = false
  await user.save()
  console.log('[seed] teacher.demo@example.com is now the Demo Teacher (no Approvals in tutorial)')
  console.log('[seed] hasSeenOnboarding reset to false')

  // Clean up the old placeholder email from the previous account layout.
  const stale = await User.findOneAndDelete({ email: 'teacher.demo2@example.com' })
  console.log(stale ? '[seed] removed old teacher.demo2@example.com placeholder' : '[seed] no old placeholder to remove')
}

main().catch((err) => {
  console.error('[seed] failed:', err.message)
  process.exit(1)
})