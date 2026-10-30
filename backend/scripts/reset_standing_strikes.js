/**
 * One-time reset for the student standing feature.
 *
 * Clears every strike on the attendance ledger and rebuilds every student's standing from the
 * ledger, so each student is re-seeded with the current per-student starting SP (which varies)
 * and zero strikes.
 *
 * SAFE BY DEFAULT: dry-run (prints the plan, writes nothing). Pass --apply to write.
 *
 *   node backend/scripts/reset_standing_strikes.js            # dry-run
 *   node backend/scripts/reset_standing_strikes.js --apply    # perform updates
 *
 * Uses MONGODB_URI (falls back to mongodb://127.0.0.1:27017/spandan).
 *
 * What it does on --apply:
 *   1. Unsets `strikeTriggered` and `consecutiveLate` on every AttendanceLedger row.
 *   2. Deletes every StudentStanding row.
 *   3. Re-runs ensureStanding() for each student so balances are backfilled from the ledger
 *      with a strike count of 0 and the new varied starting SP.
 */
import mongoose from 'mongoose'
import AttendanceLedger from '../src/models/AttendanceLedger.js'
import StudentStanding from '../src/models/StudentStanding.js'
import User from '../src/models/User.js'
import { ensureStanding, startingSpForStudent } from '../src/services/studentStanding.js'

const APPLY = process.argv.includes('--apply')
const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/spandan'

async function main() {
  await mongoose.connect(URI)
  console.log(`Connected: ${URI}  |  mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}`)

  const students = await User.find({ role: 'student' }).select('name email').lean()
  const ledgerRows = await AttendanceLedger.find({}).select('studentId status strikeTriggered consecutiveLate').lean()
  const struckRows = ledgerRows.filter(r => r.strikeTriggered)
  const standings = await StudentStanding.find({}).lean()

  console.log(`\nStudents: ${students.length}  |  ledger rows: ${ledgerRows.length}  |  struck rows: ${struckRows.length}  |  standings: ${standings.length}`)
  console.log('\n-- Re-seed plan (starting SP is deterministic per student) --')
  for (const s of students) {
    console.log(`   ${s.email}  (${s.name})  -> starting SP ${startingSpForStudent(String(s._id))}`)
  }
  if (struckRows.length) {
    console.log('\n-- Rows whose strike flags will be cleared --')
    struckRows.forEach(r => console.log(`   student=${r.studentId} status=${r.status} consecutiveLate=${r.consecutiveLate ?? '-'}`))
  }

  if (!APPLY) {
    console.log('\nDRY-RUN complete. Re-run with --apply to write these changes.')
    await mongoose.disconnect(); return
  }

  const cleared = await AttendanceLedger.updateMany(
    {},
    { $unset: { strikeTriggered: '', consecutiveLate: '' } }
  )
  const removed = await StudentStanding.deleteMany({})
  console.log(`\nApplied: cleared strike flags on ${cleared.modifiedCount} ledger rows, deleted ${removed.deletedCount} standings`)

  for (const s of students) await ensureStanding(s._id)

  const rebuilt = await StudentStanding.find({}).lean()
  const nameById = new Map(students.map(s => [String(s._id), s.email]))
  console.log(`\nRebuilt ${rebuilt.length} standings:`)
  rebuilt
    .sort((a, b) => String(nameById.get(String(a.studentId)) || '').localeCompare(String(nameById.get(String(b.studentId)) || '')))
    .forEach(st => {
      console.log(`   ${nameById.get(String(st.studentId)) || st.studentId}  SP=${st.spBalance}  minutes=${st.attendanceMinutes}  strikes=${st.strikes}`)
    })

  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
