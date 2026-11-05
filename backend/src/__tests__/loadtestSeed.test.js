// Load-test seeding, cleanup and the shared dev-script safety guard (backend/scripts/), plus the
// env-overridable rate-limit config. Seeding/cleanup run against the in-memory MongoDB from the
// jest-mongodb preset; the guard and config helpers are pure functions.
import mongoose from 'mongoose'
import User from '../models/User.js'
import Room from '../models/Room.js'
import Question from '../models/Question.js'
import Response from '../models/Response.js'
import RoomMember from '../models/RoomMember.js'
import Transcript from '../models/Transcript.js'
import { TERMS_VERSION } from '../config/terms.js'
import { DEFAULT_RATE_LIMITS, RATE_LIMIT_ENV, resolveRateLimits, positiveIntOr } from '../config/rateLimits.js'
import { assertDevDatabase, uriHosts, redact } from '../../scripts/lib/devGuard.js'
import {
  seedLoadtestUsers, cleanLoadtestData, parseStudentCount, studentEmail, isLoadtestEmail,
  TEACHER_EMAIL, LOADTEST_DOMAIN, DEFAULT_STUDENTS, MAX_STUDENTS
} from '../../scripts/lib/loadtestSeed.js'

const PW = 'LoadTest@123'

beforeAll(async () => {
  // Own database: test files run in parallel against one in-memory server, and this suite wipes
  // whole collections (see insightsCache / questionStats tests for the same pattern).
  await mongoose.connect(process.env.MONGO_URL, { dbName: 'loadtestSeedTest' })
  await User.init() // build the unique email index before the duplicate-email tests rely on it
})

afterAll(async () => {
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
})

beforeEach(async () => {
  await Promise.all([User, Room, Question, Response, RoomMember, Transcript].map(M => M.deleteMany({})))
})

describe('devGuard.assertDevDatabase', () => {
  const ok = (uri, extra = {}) => () => assertDevDatabase({ uri, ...extra })

  it('allows local databases', () => {
    expect(ok('mongodb://localhost:27017')).not.toThrow()
    expect(ok('mongodb://127.0.0.1:27017/spandan')).not.toThrow()
    expect(ok('mongodb://user:pw@localhost/spandan?authSource=admin')).not.toThrow()
    expect(ok('mongodb://[::1]:27017/spandan')).not.toThrow()
  })

  it('refuses NODE_ENV=production even for a local database', () => {
    expect(ok('mongodb://localhost:27017', { nodeEnv: 'production' })).toThrow(/production/)
    expect(ok('mongodb://localhost:27017', { nodeEnv: 'PRODUCTION', allowRemote: true })).toThrow(/production/)
  })

  it('refuses remote hosts unless allowRemote is set', () => {
    expect(ok('mongodb://db.example.com:27017/spandan')).toThrow(/non-local host \(db\.example\.com\)/)
    expect(ok('mongodb+srv://u:p@cluster0.abc.mongodb.net/spandan')).toThrow(/non-local/)
    expect(ok('mongodb://localhost:27017,db2.example.com:27017/x')).toThrow(/db2\.example\.com/)
    expect(ok('mongodb://db.example.com/spandan', { allowRemote: true })).not.toThrow()
  })

  it('fails closed on an unparseable URI', () => {
    expect(ok('')).toThrow(/cannot parse/)
    expect(ok('postgres://localhost/db')).toThrow(/cannot parse/)
  })

  it('names the action and suggested command in its messages', () => {
    expect(ok('mongodb://db.example.com', { action: 'clean', command: 'npm run clean:loadtest' }))
      .toThrow(/Refusing to clean[\s\S]*npm run clean:loadtest -- --allow-remote/)
  })

  it('never prints credentials', () => {
    expect(redact('mongodb://admin:secret@db.example.com/x')).toBe('mongodb://***@db.example.com/x')
    expect(() => assertDevDatabase({ uri: 'mongodb://admin:secret@db.example.com/x' }))
      .toThrow(expect.objectContaining({ message: expect.not.stringContaining('secret') }))
    expect(uriHosts('mongodb://admin:secret@Localhost:1/x')).toEqual(['localhost'])
  })
})

describe('rate-limit config', () => {
  it('uses the built-in defaults when nothing is configured', () => {
    expect(resolveRateLimits({})).toEqual({ api: 50000, authFailures: 5000, responses: 5000, leaderboard: 10000 })
    expect(resolveRateLimits({})).toEqual({ ...DEFAULT_RATE_LIMITS })
  })

  it('applies valid overrides from the environment', () => {
    const env = {
      [RATE_LIMIT_ENV.api]: '1000000',
      [RATE_LIMIT_ENV.authFailures]: '200',
      [RATE_LIMIT_ENV.responses]: '250000',
      [RATE_LIMIT_ENV.leaderboard]: '300000'
    }
    expect(resolveRateLimits(env)).toEqual({ api: 1000000, authFailures: 200, responses: 250000, leaderboard: 300000 })
  })

  it('falls back to the default for invalid values instead of disabling or loosening a limit', () => {
    for (const bad of ['', '   ', '0', '-5', 'abc', '1.5', 'Infinity', '1e400']) {
      expect(positiveIntOr(bad, 42)).toBe(42)
    }
    expect(resolveRateLimits({ API_RATE_LIMIT_MAX: '-1', RESPONSE_RATE_LIMIT_MAX: 'lots' }))
      .toEqual({ ...DEFAULT_RATE_LIMITS })
  })
})

describe('parseStudentCount', () => {
  it('defaults when not given and accepts 1..MAX', () => {
    expect(parseStudentCount(undefined)).toBe(DEFAULT_STUDENTS)
    expect(parseStudentCount('1')).toBe(1)
    expect(parseStudentCount(String(MAX_STUDENTS))).toBe(MAX_STUDENTS)
  })

  it('rejects out-of-range or non-integer counts', () => {
    for (const bad of ['0', '-3', '2.5', 'ten', String(MAX_STUDENTS + 1)]) {
      expect(() => parseStudentCount(bad)).toThrow(/--students/)
    }
  })
})

describe('seedLoadtestUsers', () => {
  it('creates one approved teacher and N students with the current Terms accepted', async () => {
    const res = await seedLoadtestUsers({ count: 5, password: PW })
    expect(res).toEqual({ created: 6, skipped: 0, total: 6 })

    const users = await User.find({}).lean()
    expect(users).toHaveLength(6)
    expect(users.every(u => isLoadtestEmail(u.email))).toBe(true)
    expect(users.every(u => u.termsVersion === TERMS_VERSION && u.termsAcceptedAt)).toBe(true)
    expect(users.every(u => u.teacherApprovalStatus === 'approved' && u.isActive && !u.isAdmin)).toBe(true)

    const teacher = users.find(u => u.email === TEACHER_EMAIL)
    expect(teacher.role).toBe('teacher')
    expect(users.filter(u => u.role === 'student').map(u => u.email).sort())
      .toEqual([1, 2, 3, 4, 5].map(studentEmail))
  })

  it('stores a real bcrypt hash that the normal login check accepts', async () => {
    await seedLoadtestUsers({ count: 2, password: PW })
    const s = await User.findOne({ email: studentEmail(2) })
    expect(s.password).toMatch(/^\$2[aby]\$/)
    await expect(s.comparePassword(PW)).resolves.toBe(true)
    await expect(s.comparePassword('wrong-password')).resolves.toBe(false)
    expect(s.toJSON().termsAccepted).toBe(true)
  })

  it('is idempotent and only adds what is missing when the count grows', async () => {
    await seedLoadtestUsers({ count: 3, password: PW })
    await expect(seedLoadtestUsers({ count: 3, password: PW }))
      .resolves.toEqual({ created: 0, skipped: 4, total: 4 })
    await expect(seedLoadtestUsers({ count: 5, password: PW }))
      .resolves.toEqual({ created: 2, skipped: 4, total: 6 })
    expect(await User.countDocuments()).toBe(6)
  })

  it('never modifies an existing account (password is not reset)', async () => {
    await User.create({
      name: 'Pre-existing', email: studentEmail(1), password: 'OldPass#1', role: 'student',
      teacherApprovalStatus: 'approved', termsVersion: TERMS_VERSION
    })
    const before = await User.findOne({ email: studentEmail(1) }).lean()

    const res = await seedLoadtestUsers({ count: 2, password: PW })
    expect(res).toEqual({ created: 2, skipped: 1, total: 3 })

    const after = await User.findOne({ email: studentEmail(1) })
    expect(after.name).toBe('Pre-existing')
    expect(after.password).toBe(before.password)
    await expect(after.comparePassword('OldPass#1')).resolves.toBe(true)
  })

  it('rejects a too-short password and a bad count before writing anything', async () => {
    await expect(seedLoadtestUsers({ count: 2, password: '123' })).rejects.toThrow(/at least 6/)
    await expect(seedLoadtestUsers({ count: 0, password: PW })).rejects.toThrow(/--students/)
    expect(await User.countDocuments()).toBe(0)
  })
})

describe('cleanLoadtestData', () => {
  // A real teacher, room, question and student, plus load-test data both in its own room and
  // (as a stray answer) in the real room.
  async function fixture() {
    await seedLoadtestUsers({ count: 3, password: PW })
    const ltTeacher = await User.findOne({ email: TEACHER_EMAIL })
    const ltStudent = await User.findOne({ email: studentEmail(1) })

    const realTeacher = await User.create({
      name: 'Real Teacher', email: 'real.teacher@example.com', password: 'Passw0rd!', role: 'teacher',
      teacherApprovalStatus: 'approved'
    })
    const realStudent = await User.create({
      name: 'Real Student', email: 'real.student@example.com', password: 'Passw0rd!', role: 'student'
    })
    // Look-alike addresses that must NOT be treated as load-test accounts.
    const lookalikes = await User.create([
      { name: 'Lookalike A', email: `lt.student0001@${LOADTEST_DOMAIN}.evil.com`, password: 'Passw0rd!', role: 'student' },
      { name: 'Lookalike B', email: `x@not${LOADTEST_DOMAIN}`, password: 'Passw0rd!', role: 'student' }
    ])

    const ltRoom = await Room.create({ name: 'LT room', teacher: ltTeacher._id })
    const realRoom = await Room.create({ name: 'Real room', teacher: realTeacher._id })
    const opts = [{ text: 'A', isCorrect: true }, { text: 'B' }]
    const ltQ = await Question.create({ roomId: ltRoom._id, type: 'MCQ', question: 'LT?', options: opts })
    const realQ = await Question.create({ roomId: realRoom._id, type: 'MCQ', question: 'Real?', options: opts })

    await RoomMember.create([
      { roomId: ltRoom._id, studentId: ltStudent._id },
      { roomId: realRoom._id, studentId: ltStudent._id }, // stray load-test membership in a real room
      { roomId: realRoom._id, studentId: realStudent._id }
    ])
    await Response.create([
      { roomId: ltRoom._id, questionId: ltQ._id, studentId: ltStudent._id, selectedOption: 0 },
      { roomId: realRoom._id, questionId: realQ._id, studentId: ltStudent._id, selectedOption: 1 },
      { roomId: realRoom._id, questionId: realQ._id, studentId: realStudent._id, selectedOption: 0 }
    ])
    await Transcript.create([
      { roomId: ltRoom._id, segmentIndex: 0, teacherId: ltTeacher._id, text: 'lt transcript' },
      { roomId: realRoom._id, segmentIndex: 0, teacherId: realTeacher._id, text: 'real transcript' }
    ])
    return { realTeacher, realStudent, realRoom, realQ, lookalikes }
  }

  it('dry run counts what would go and deletes nothing', async () => {
    await fixture()
    const totalBefore = await User.countDocuments()
    const counts = await cleanLoadtestData({ dryRun: true })
    expect(counts).toEqual({ responses: 2, roomMembers: 2, questions: 1, transcripts: 1, rooms: 1, users: 4 })
    expect(await User.countDocuments()).toBe(totalBefore)
    expect(await Response.countDocuments()).toBe(3)
  })

  it('removes only load-test data and leaves every real record intact', async () => {
    const { realTeacher, realStudent, realRoom, realQ, lookalikes } = await fixture()
    const counts = await cleanLoadtestData()
    expect(counts).toEqual({ responses: 2, roomMembers: 2, questions: 1, transcripts: 1, rooms: 1, users: 4 })

    const remainingEmails = (await User.find({}).lean()).map(u => u.email).sort()
    expect(remainingEmails).toEqual(
      [realTeacher.email, realStudent.email, ...lookalikes.map(l => l.email)].sort()
    )
    expect((await Room.find({}).lean()).map(r => String(r._id))).toEqual([String(realRoom._id)])
    expect((await Question.find({}).lean()).map(q => String(q._id))).toEqual([String(realQ._id)])
    const responses = await Response.find({}).lean()
    expect(responses).toHaveLength(1)
    expect(String(responses[0].studentId)).toBe(String(realStudent._id))
    const members = await RoomMember.find({}).lean()
    expect(members).toHaveLength(1)
    expect(String(members[0].studentId)).toBe(String(realStudent._id))
    expect((await Transcript.find({}).lean()).map(t => t.text)).toEqual(['real transcript'])
  })

  it('is a no-op on a database with no load-test data', async () => {
    await User.create({ name: 'Real', email: 'r@example.com', password: 'Passw0rd!', role: 'student' })
    await expect(cleanLoadtestData())
      .resolves.toEqual({ responses: 0, roomMembers: 0, questions: 0, transcripts: 0, rooms: 0, users: 0 })
    expect(await User.countDocuments()).toBe(1)
  })
})
