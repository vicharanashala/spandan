/**
 * Development seed accounts (used by scripts/seed_dev_users.js and its tests).
 *
 * Locally, four fixed test logins keep their documented passwords and the rest use SEED_PASSWORD
 * (default Spandan@123), exactly as before. Those passwords are in this repository, so on a REMOTE
 * database they would be public logins (two of them approved teachers). A remote seed therefore
 * needs --allow-remote and --yes, a non-default SEED_PASSWORD, and a database/host name that does not
 * look like production (the shared guards in devGuard.js); then EVERY account uses SEED_PASSWORD.
 *
 * Pure: no database access, so it is unit-tested directly.
 */
import { assertDevDatabase, assertRemoteWriteAllowed, describeTarget, remoteHosts } from './devGuard.js'

export const DEFAULT_SEED_PASSWORD = 'Spandan@123'
export const SEED_COMMAND = 'npm run seed:dev'

export const DEV_ACCOUNTS = Object.freeze([
  { name: 'Test Teacher 1', email: 'testteacher1@spandan.test', password: 'Teacher@123', role: 'teacher' },
  { name: 'Test Teacher 2', email: 'testteacher2@spandan.test', password: 'Teacher@456', role: 'teacher' },
  { name: 'Test Teacher 3', email: 'testteacher3@spandan.test', role: 'teacher' },
  { name: 'Test Teacher 4', email: 'testteacher4@spandan.test', role: 'teacher' },
  { name: 'Test Student 1', email: 'teststudent1@spandan.test', password: 'Student@123', role: 'student' },
  { name: 'Test Student 2', email: 'teststudent2@spandan.test', password: 'Student@456', role: 'student' },
  ...[3, 4, 5, 6, 7, 8, 9, 10].map(n => ({
    name: `Test Student ${n}`, email: `teststudent${n}@spandan.test`, role: 'student'
  }))
].map(a => Object.freeze(a)))

/** The password an account is created with: its fixed one locally, SEED_PASSWORD for all when remote. */
export function passwordFor(account, { remote, seedPassword }) {
  if (remote) return seedPassword
  return account.password || seedPassword
}

/**
 * Every check before connecting. Throws when the target is not allowed; otherwise returns
 * { remote, target } (target is printable: hosts and database, never credentials).
 */
export function checkDevSeedTarget({ uri, allowRemote = false, confirmed = false, nodeEnv = '', seedPassword = '' }) {
  assertDevDatabase({ uri, allowRemote, nodeEnv, action: 'seed', command: SEED_COMMAND })
  assertRemoteWriteAllowed({
    uri,
    action: 'seed',
    command: SEED_COMMAND,
    confirmed,
    requirePassword: true,
    password: seedPassword,
    defaultPassword: DEFAULT_SEED_PASSWORD,
    passwordEnv: 'SEED_PASSWORD'
  })
  return { remote: remoteHosts(uri).length > 0, target: describeTarget(uri) }
}
