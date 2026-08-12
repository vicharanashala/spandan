/**
 * One-time migration for the teacher-approval feature.
 *
 * Approach for existing accounts: the founder account(s) are set approved + admin so they
 * can sign in and reach the admin page; EVERY other existing teacher is set to 'pending' so
 * they surface on the admin approval page for manual approve/reject (this also lets the admin
 * flow be tested against real accounts, and the junk/attack accounts get rejected there).
 *
 * The field must be PERSISTED (not left to the Mongoose default) so that the admin page's
 * `find({ teacherApprovalStatus: 'pending' })` query actually returns these old accounts.
 *
 * SAFE BY DEFAULT: dry-run (prints the plan, writes nothing). Pass --apply to write.
 *
 *   node backend/scripts/migrate_teacher_approval.js            # dry-run
 *   node backend/scripts/migrate_teacher_approval.js --apply    # perform updates
 *
 * Uses MONGODB_URI (falls back to mongodb://127.0.0.1:27017/spandan). Run OFF the live
 * session, and review the printed plan before using --apply.
 */
import mongoose from 'mongoose'
import User from '../src/models/User.js'

const APPLY = process.argv.includes('--apply')
const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/spandan'

// Founder account(s): set approved + admin so they can sign in and reach the admin page.
// Override with FOUNDER_ADMIN_EMAILS (comma-separated). EVERY other existing teacher is set
// to 'pending' so it appears on the admin approval page for manual approve/reject.
const FOUNDER_ADMINS = (process.env.FOUNDER_ADMIN_EMAILS || 'imrohitvk@gmail.com')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

const isFounder = (email = '') => FOUNDER_ADMINS.includes(email.toLowerCase())

async function main() {
  await mongoose.connect(URI)
  console.log(`Connected: ${URI}  |  mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}`)

  const teachers = await User.find({ role: 'teacher' }).select('name email teacherApprovalStatus isActive isAdmin')
  const founders = [], pending = []
  for (const t of teachers) {
    if (isFounder(t.email)) founders.push(t)
    else pending.push(t)
  }

  console.log(`\nTeachers: ${teachers.length}  ->  founder(approved+admin) ${founders.length}, set-pending ${pending.length}`)
  console.log('\n-- FOUNDER -> approved + isAdmin=true (can sign in and administer) --')
  founders.forEach(t => console.log(`   ${t.email}  (${t.name})`))
  console.log('\n-- SET PENDING -> will appear on the admin page for approve/reject --')
  pending.forEach(t => console.log(`   ${t.email}  (${t.name})`))

  if (!APPLY) {
    console.log('\nDRY-RUN complete. Re-run with --apply to write these changes.')
    await mongoose.disconnect(); return
  }

  const founderIds = founders.map(t => t._id)
  const pendingIds = pending.map(t => t._id)
  // Approve+admin the founders FIRST so the admin is never locked out.
  const r1 = founderIds.length ? await User.updateMany({ _id: { $in: founderIds } }, { $set: { teacherApprovalStatus: 'approved', isAdmin: true } }) : { modifiedCount: 0 }
  const r2 = pendingIds.length ? await User.updateMany({ _id: { $in: pendingIds } }, { $set: { teacherApprovalStatus: 'pending' } }) : { modifiedCount: 0 }
  console.log(`\nApplied: founders(approved+admin)=${r1.modifiedCount}, set-pending=${r2.modifiedCount}`)
  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
