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
 *   ... -- --allow-remote --yes                     # only if your DEV database is not on localhost
 *
 * Refuses NODE_ENV=production and a non-local MONGODB_URI unless --allow-remote is passed. A remote
 * write (seed or clean; --dry-run excepted) also needs --yes, and seeding a remote database needs a
 * non-default LOADTEST_PASSWORD. A database or host name that looks like production (prod, production,
 * prd, live) is always refused. The target hosts and database are printed before anything is written.
 * Uses MONGODB_URI from backend/.env (same fallback as the server). "localhost" is not proof the
 * database is local: an SSH tunnel, Docker port mapping or kubectl port-forward looks the same, so
 * check MONGODB_URI yourself (the printed target names the hosts and database).
 * Password: LOADTEST_PASSWORD (default LoadTest@123, local databases only).
 */
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { assertDevDatabase, assertRemoteWriteAllowed, assertConnectedDbAllowed, describeTarget, redact, uriDbName } from './lib/devGuard.js'

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
  const action = CLEAN ? 'clean' : 'seed'
  const command = CLEAN ? 'npm run clean:loadtest' : 'npm run seed:loadtest'
  assertDevDatabase({ uri: URI, allowRemote: flag('--allow-remote'), nodeEnv: process.env.NODE_ENV, action, command })

  // Show exactly where this will write before connecting, then the remote-only checks.
  console.log(`Target: ${describeTarget(URI)}`)
  assertRemoteWriteAllowed({
    uri: URI,
    action,
    command,
    confirmed: flag('--yes') || (CLEAN && DRY_RUN), // a dry run only counts, it writes nothing
    requirePassword: !CLEAN,
    password: PASSWORD,
    defaultPassword: DEFAULT_PASSWORD,
    passwordEnv: 'LOADTEST_PASSWORD'
  })

  await mongoose.connect(URI)
  console.log(`Connected: ${redact(URI)}  (db: ${mongoose.connection.name})\n`)
  assertConnectedDbAllowed(mongoose.connection.name, { action, expected: uriDbName(URI) }) // before any write

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
