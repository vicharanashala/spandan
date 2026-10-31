import mongoose from 'mongoose'
import User from '../src/models/User.js'
import dotenv from 'dotenv'

dotenv.config()

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/spandan')
  const users = await User.find({})
  console.log('TOTAL USERS:', users.length)
  for (const u of users) {
    console.log({
      id: u._id,
      email: u.email,
      name: u.name,
      role: u.role,
      teacherApprovalStatus: u.teacherApprovalStatus,
      termsVersion: u.termsVersion,
      authProvider: u.authProvider
    })
  }
  process.exit(0)
}

check()
