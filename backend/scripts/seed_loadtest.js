/**
 * Development-only: create or remove the accounts used by the load test (loadtest/).
 *
 * Creates one approved teacher (lt.teacher@loadtest.spandan.test) and N students
 * (lt.student0001@loadtest.spandan.test …), all with the current Terms accepted and one shared
 * password, so they can sign in straight away. Idempotent: existing accounts are skipped, never
 * changed. --clean removes ONLY data belonging to that reserved domain (users, the rooms the
 * load-test teacher owns, and their questions, answers, memberships and transcripts).
 *
 *   npm run seed:loadtest                           # 100 students (default)
 *   npm run seed:loadtest -- --students 50
 *   npm run clean:loadtest -- --dry-run             # show what would be deleted
 *   npm run clean:loadtest
 *   ... -- --allow-remote                           # only if your DEV database is not on localhost
 *
 * Refuses NODE_ENV=production and a non-local MONGODB_URI unless --allow-remote is passed.
 * Uses MONGODB_URI from backend/.env (same fallback as the server).
 * Password: LOADTEST_PASSWORD (default LoadTest@123).
 */
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { assertDevDatabase, redact } from './lib/devGuard.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

// Imported after dotenv so the models read BCRYPT_COST etc. from backend/.env.
const {
  seedLoadtestUsers, cleanLoadtestData, parseStudentCount,
  DEFAULT_PASSWORD, TEACHER_EMAIL, studentEmail, LOADTEST_DOMAIN
} = await import('./lib/loadtestSeed.js')

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  const v = args[i + 1]
  if (v === undefined || v.startsWith('--')) throw new Error(`${name} needs a value.`)
  return v
}

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/spandan'
const CLEAN = flag('--clean')
const DRY_RUN = flag('--dry-run')
const PASSWORD = process.env.LOADTEST_PASSWORD || DEFAULT_PASSWORD

async function main() {
  const students = CLEAN ? null : parseStudentCount(option('--students'))
  assertDevDatabase({
    uri: URI,
    allowRemote: flag('--allow-remote'),
    nodeEnv: process.env.NODE_ENV,
    action: CLEAN ? 'clean' : 'seed',
    command: CLEAN ? 'npm run clean:loadtest' : 'npm run seed:loadtest'
  })

  await mongoose.connect(URI)
  console.log(`Connected: ${redact(URI)}  (db: ${mongoose.connection.name})\n`)

  if (CLEAN) {
    const counts = await cleanLoadtestData({ dryRun: DRY_RUN })
    console.log(DRY_RUN
      ? `Dry run: this would delete (only @${LOADTEST_DOMAIN} data):`
      : `Deleted (only @${LOADTEST_DOMAIN} data):`)
    for (const [name, n] of Object.entries(counts)) console.log(`  ${name.padEnd(12)} ${n}`)
    return
  }

  const t0 = Date.now()
  const { created, skipped, total } = await seedLoadtestUsers({ count: students, password: PASSWORD })
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${created} created, ${skipped} skipped (of ${total}).`)
  console.log(`  teacher   ${TEACHER_EMAIL}`)
  console.log(`  students  ${studentEmail(1)} … ${studentEmail(students)}`)
  console.log(`  password  ${process.env.LOADTEST_PASSWORD ? '(from LOADTEST_PASSWORD)' : DEFAULT_PASSWORD}`)
  if (skipped) console.log('  Existing accounts were left unchanged (their passwords were not reset).')
}

main()
  .catch(err => { console.error(`\n${err.message}`); process.exitCode = 1 })
  .finally(() => mongoose.disconnect())
