/**
 * Development-only seed: adds 4 teacher and 10 student test accounts.
 *
 * Idempotent and non-destructive: an account whose email already exists is SKIPPED, never
 * updated, so re-running it changes nothing and existing passwords are never overwritten.
 * New accounts go through the normal User model, so the pre-save hook hashes passwords with
 * the same bcrypt cost the app uses. Seeded teachers are pre-approved and every account has
 * accepted the current Terms of Use, so they can all sign in straight away. No emails are sent.
 *
 *   npm run seed:dev                                   # from backend/
 *   SEED_PASSWORD='<private>' npm run seed:dev -- --allow-remote --yes   # a REMOTE dev database
 *
 * Refuses to run when NODE_ENV=production. A non-local MONGODB_URI additionally needs
 * --allow-remote AND --yes, a non-default SEED_PASSWORD, and a database/host name that does not look
 * like production; on a remote database EVERY account uses SEED_PASSWORD (the fixed test passwords
 * below are in this repository, so they are used only locally). The target is printed before
 * connecting. Uses MONGODB_URI from backend/.env (same fallback as the server). "localhost" is not
 * proof the database is local (an SSH tunnel or port-forward looks the same): check MONGODB_URI.
 * Locally, accounts other than the four fixed test logins use SEED_PASSWORD (default Spandan@123).
 */
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { assertConnectedDbAllowed, describeTarget, redact, uriDbName } from './lib/devGuard.js'
import { DEV_ACCOUNTS, DEFAULT_SEED_PASSWORD, checkDevSeedTarget, passwordFor } from './lib/devSeed.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const { default: User } = await import('../src/models/User.js')
const { TERMS_VERSION } = await import('../src/config/terms.js')

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/spandan'
const SEED_PASSWORD = process.env.SEED_PASSWORD || DEFAULT_SEED_PASSWORD

async function main() {
  console.log(`Target: ${describeTarget(URI)}`)
  const { remote } = checkDevSeedTarget({
    uri: URI,
    allowRemote: process.argv.includes('--allow-remote'),
    confirmed: process.argv.includes('--yes'),
    nodeEnv: process.env.NODE_ENV,
    seedPassword: SEED_PASSWORD
  })

  await mongoose.connect(URI)
  console.log(`Connected: ${redact(URI)}  (db: ${mongoose.connection.name})\n`)
  assertConnectedDbAllowed(mongoose.connection.name, { action: 'seed', expected: uriDbName(URI) }) // before any write

  let created = 0, skipped = 0
  for (const acct of DEV_ACCOUNTS) {
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
        password: passwordFor(acct, { remote, seedPassword: SEED_PASSWORD }),
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
  if (!created) return
  if (remote) {
    console.log('Remote database: every new account uses SEED_PASSWORD (the fixed test passwords were not used).')
  } else {
    // Never echo a private SEED_PASSWORD; only the published default is shown.
    console.log(`Accounts without a fixed password use ${process.env.SEED_PASSWORD ? 'SEED_PASSWORD (from the environment)' : `SEED_PASSWORD (default ${DEFAULT_SEED_PASSWORD})`}.`)
  }
}

main()
  .catch(err => { console.error(`\n${err.message}`); process.exitCode = 1 })
  .finally(() => mongoose.disconnect())
