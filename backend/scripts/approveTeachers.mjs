import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

await mongoose.connect(process.env.MONGODB_URI)
console.log('✅ Connected to MongoDB')

// Use raw collection access to avoid loading User model (which requires @node-rs/bcrypt)
const db = mongoose.connection.db
const users = db.collection('users')

// Show teachers before
const before = await users.find({ role: 'teacher' }).toArray()
console.log('\n📋 Teachers before update:')
before.forEach(t => console.log(`  - ${t.name} <${t.email}> status=${t.teacherApprovalStatus || 'undefined'}`))

// Approve all teachers
const result = await users.updateMany(
  { role: 'teacher' },
  { $set: { teacherApprovalStatus: 'approved', approvedAt: new Date() } }
)
console.log(`\n✅ Approved ${result.modifiedCount} teacher account(s)`)

// Verify
const after = await users.find({ role: 'teacher' }).toArray()
console.log('\n📋 Teachers after update:')
after.forEach(t => console.log(`  - ${t.name} <${t.email}> status=${t.teacherApprovalStatus}`))

await mongoose.disconnect()
console.log('\n🎉 Done! Now try creating a room — it should work.')
process.exit(0)
