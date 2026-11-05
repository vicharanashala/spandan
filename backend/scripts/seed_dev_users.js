/**
 * Development-only seed: adds 4 teacher and 10 student test accounts.
 *
 * Idempotent and non-destructive: an account whose email already exists is SKIPPED, never
 * updated, so re-running it changes nothing and existing passwords are never overwritten.
 * New accounts go through the normal User model, so the pre-save hook hashes passwords with
 * the same bcrypt cost the app uses. Seeded teachers are pre-approved and every account has
 * accepted the current Terms of Use, so they can all sign in straight away. No emails are sent.
 *
 *   npm run seed:dev                       # from backend/
 *   npm run seed:dev -- --allow-remote     # only if your DEV database is not on localhost
 *
 * Refuses to run when NODE_ENV=production. Also refuses a non-local MONGODB_URI unless you
 * pass --allow-remote. Uses MONGODB_URI from backend/.env (same fallback as the server).
 * Accounts other than the four fixed test logins use SEED_PASSWORD (default Spandan@123).
 */
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { assertDevDatabase, redact } from './lib/devGuard.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const { default: User } = await import('../src/models/User.js')
const { TERMS_VERSION } = await import('../src/config/terms.js')

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/spandan'
const ALLOW_REMOTE = process.argv.includes('--allow-remote')
const DEFAULT_PASSWORD = process.env.SEED_PASSWORD || 'Spandan@123'

const ACCOUNTS = [
  { name: 'Test Teacher 1', email: 'testteacher1@spandan.test', password: 'Teacher@123', role: 'teacher' },
  { name: 'Test Teacher 2', email: 'testteacher2@spandan.test', password: 'Teacher@456', role: 'teacher' },
  { name: 'Test Teacher 3', email: 'testteacher3@spandan.test', role: 'teacher' },
  { name: 'Test Teacher 4', email: 'testteacher4@spandan.test', role: 'teacher' },
  { name: 'Test Student 1', email: 'teststudent1@spandan.test', password: 'Student@123', role: 'student' },
  { name: 'Test Student 2', email: 'teststudent2@spandan.test', password: 'Student@456', role: 'student' },
  ...[3, 4, 5, 6, 7, 8, 9, 10].map(n => ({
    name: `Test Student ${n}`, email: `teststudent${n}@spandan.test`, role: 'student'
  }))
]

function guard() {
  assertDevDatabase({
    uri: URI,
    allowRemote: ALLOW_REMOTE,
    nodeEnv: process.env.NODE_ENV,
    action: 'seed',
    command: 'npm run seed:dev'
  })
}

async function main() {
  guard()
  await mongoose.connect(URI)
  console.log(`Connected: ${redact(URI)}  (db: ${mongoose.connection.name})\n`)

  let created = 0, skipped = 0
  for (const acct of ACCOUNTS) {
    const email = acct.email.toLowerCase()
    if (await User.exists({ email })) {
      console.log(`  skip    ${email}  (already exists, left unchanged)`)
      skipped++
      continue
    }
    try {
      await new User({
        name: acct.name,
        email,
        password: acct.password || DEFAULT_PASSWORD,
        role: acct.role,
        authProvider: 'local',
        teacherApprovalStatus: 'approved',
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: new Date()
      }).save()
      console.log(`  create  ${email}  (${acct.role})`)
      created++
    } catch (err) {
      // Created concurrently by someone else between the check and the insert: still a skip.
      if (err?.code === 11000) {
        console.log(`  skip    ${email}  (already exists, left unchanged)`)
        skipped++
      } else {
        throw err
      }
    }
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped.`)
  if (created) console.log(`Accounts without a fixed password use SEED_PASSWORD (default ${DEFAULT_PASSWORD}).`)
}

main()
  .catch(err => { console.error(`\n${err.message}`); process.exitCode = 1 })
  .finally(() => mongoose.disconnect())
