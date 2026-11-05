/**
 * Load-test account seeding and cleanup (used by scripts/seed_loadtest.js and its tests).
 *
 * Every load-test account lives on ONE reserved email domain, LOADTEST_DOMAIN. That domain is the
 * only marker: nothing is added to the User schema. Cleanup deletes strictly by that domain (and
 * rooms owned by those accounts), so it can never touch a real user, room or answer.
 *
 * Accounts are created pre-approved with the current Terms accepted, so they can sign in and use
 * every live-session route straight away (no OTP email, no TERMS_REQUIRED).
 */
import { hash } from '@node-rs/bcrypt'
import User from '../../src/models/User.js'
import Room from '../../src/models/Room.js'
import Question from '../../src/models/Question.js'
import Response from '../../src/models/Response.js'
import RoomMember from '../../src/models/RoomMember.js'
import Transcript from '../../src/models/Transcript.js'
import { TERMS_VERSION } from '../../src/config/terms.js'

export const LOADTEST_DOMAIN = 'loadtest.spandan.test'
export const TEACHER_EMAIL = `lt.teacher@${LOADTEST_DOMAIN}`
export const MAX_STUDENTS = 5000
export const DEFAULT_STUDENTS = 100
export const DEFAULT_PASSWORD = 'LoadTest@123'

// Same cost the User model's pre-save hook uses (src/models/User.js), so seeded hashes are
// indistinguishable from ones created through the app.
const BCRYPT_COST = Number(process.env.BCRYPT_COST) || 10

// lt.student0001@loadtest.spandan.test … (1-based, zero-padded so they sort naturally)
export const studentEmail = (n) => `lt.student${String(n).padStart(4, '0')}@${LOADTEST_DOMAIN}`

// Anchored, escaped match for the reserved domain only.
const DOMAIN_RE = new RegExp(`@${LOADTEST_DOMAIN.replace(/\./g, '\\.')}$`)
export const isLoadtestEmail = (email) => DOMAIN_RE.test(String(email || '').toLowerCase())

export function parseStudentCount(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_STUDENTS
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > MAX_STUDENTS) {
    throw new Error(`--students must be a whole number from 1 to ${MAX_STUDENTS} (got "${raw}").`)
  }
  return n
}

/**
 * Create the load-test teacher and students 1..count. Idempotent: existing accounts are skipped
 * and never modified (passwords are not reset). Returns { created, skipped, total }.
 */
export async function seedLoadtestUsers({ count = DEFAULT_STUDENTS, password = DEFAULT_PASSWORD } = {}) {
  const students = parseStudentCount(count)
  if (!password || String(password).length < 6) throw new Error('Password must be at least 6 characters.')

  const wanted = [
    { name: 'LoadTest Teacher', email: TEACHER_EMAIL, role: 'teacher' },
    ...Array.from({ length: students }, (_, i) => ({
      name: `LoadTest Student ${i + 1}`, email: studentEmail(i + 1), role: 'student'
    }))
  ]

  const existing = new Set(
    (await User.find({ email: { $in: wanted.map(a => a.email) } }).select('email').lean()).map(u => u.email)
  )
  const missing = wanted.filter(a => !existing.has(a.email))

  let created = 0
  if (missing.length) {
    // Hash once and share it: every load-test account has the same password, and bcrypt per
    // account would make seeding 1,000 users take minutes. insertMany bypasses the pre-save hook
    // (so the hash is not hashed again) but still applies schema defaults and validation.
    const passwordHash = await hash(String(password), BCRYPT_COST)
    const now = new Date()
    const docs = missing.map(a => ({
      ...a,
      password: passwordHash,
      authProvider: 'local',
      teacherApprovalStatus: 'approved',
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: now
    }))
    try {
      const res = await User.insertMany(docs, { ordered: false })
      created = res.length
    } catch (err) {
      // Duplicate emails created concurrently between the check and the insert are still skips.
      const inserted = err?.insertedDocs?.length ?? err?.result?.insertedCount ?? 0
      const writeErrors = err?.writeErrors || []
      if (!writeErrors.length || writeErrors.some(e => (e.code ?? e.err?.code) !== 11000)) throw err
      created = inserted
    }
  }

  return { created, skipped: wanted.length - created, total: wanted.length }
}

/**
 * Count (dryRun) or delete everything belonging to load-test accounts:
 *   users on LOADTEST_DOMAIN; rooms they own; those rooms' questions, answers, memberships and
 *   transcripts; and any answers/memberships the load-test students left in other rooms.
 * Returns the counts per collection.
 */
export async function cleanLoadtestData({ dryRun = false } = {}) {
  const users = await User.find({ email: DOMAIN_RE }).select('_id role email').lean()
  // Defence in depth: never act on an id whose email is not on the reserved domain.
  const safeUsers = users.filter(u => isLoadtestEmail(u.email))
  const userIds = safeUsers.map(u => u._id)
  const teacherIds = safeUsers.filter(u => u.role === 'teacher').map(u => u._id)

  const rooms = teacherIds.length
    ? await Room.find({ teacher: { $in: teacherIds } }).select('_id').lean()
    : []
  const roomIds = rooms.map(r => r._id)

  const byRoom = { roomId: { $in: roomIds } }
  const byRoomOrStudent = { $or: [{ roomId: { $in: roomIds } }, { studentId: { $in: userIds } }] }

  const plan = [
    ['responses', Response, byRoomOrStudent],
    ['roomMembers', RoomMember, byRoomOrStudent],
    ['questions', Question, byRoom],
    ['transcripts', Transcript, byRoom],
    ['rooms', Room, { _id: { $in: roomIds } }],
    ['users', User, { _id: { $in: userIds } }]
  ]

  const counts = {}
  for (const [name, Model, filter] of plan) {
    counts[name] = dryRun
      ? await Model.countDocuments(filter)
      : (await Model.deleteMany(filter)).deletedCount
  }
  return counts
}
