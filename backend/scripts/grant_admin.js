import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'
import User from '../src/models/User.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const emailToGrant = process.argv[2]?.trim().toLowerCase()
const passwordArg = process.argv[3]

async function grantAdmin() {
  if (!emailToGrant) {
    console.error('Usage: node backend/scripts/grant_admin.js <email> [password]')
    process.exit(1)
  }

  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI is not set in backend/.env')
    process.exit(1)
  }

  console.log(`Connecting to MongoDB...`)
  await mongoose.connect(uri)
  console.log(`Connected to MongoDB.`)

  const escapedEmail = emailToGrant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let user = await User.findOne({ email: new RegExp(`^${escapedEmail}$`, 'i') })

  if (user) {
    user.isAdmin = true
    if (user.role === 'teacher') {
      user.teacherApprovalStatus = 'approved'
    }
    if (passwordArg) {
      user.password = passwordArg
      console.log(`Password updated for existing user.`)
    }
    await user.save()
    console.log(`[SUCCESS] Admin access confirmed in database for user: ${user.email} (Name: ${user.name}, Role: ${user.role}, isAdmin: ${user.isAdmin})`)
  } else {
    if (passwordArg) {
      user = new User({
        name: 'Admin User',
        email: emailToGrant,
        password: passwordArg,
        role: 'teacher',
        teacherApprovalStatus: 'approved',
        isAdmin: true
      })
      await user.save()
      console.log(`[SUCCESS] Created new Admin account: ${user.email} (Role: teacher, Status: approved, isAdmin: true)`)
    } else {
      console.log(`[NOTICE] No user with email "${emailToGrant}" exists in the database yet.`)
      console.log(`To create this account directly with a password, run:`)
      console.log(`  node backend/scripts/grant_admin.js ${emailToGrant} <your_password>`)
    }
  }

  await mongoose.disconnect()
}

grantAdmin().catch(err => {
  console.error('[ERROR]', err)
  process.exit(1)
})
