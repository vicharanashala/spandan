// End-to-end settlement tests for the persisted SP / attendance standing. These hit a real
// (in-memory) MongoDB and verify that a room is charged exactly once, that normal late penalties
// apply, and that every 3rd consecutive late also removes the average SP and 60 minutes.
import mongoose from 'mongoose'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import Response from '../models/Response.js'
import AttendanceLedger from '../models/AttendanceLedger.js'
import StudentStanding from '../models/StudentStanding.js'
import User from '../models/User.js'
import { processRoomAttendance, getStudentAttendanceSummary } from '../services/attendanceLedger.js'
import { clearSpurtiCache } from '../services/spurtiLive.js'
import {
  STARTING_SP,
  STARTING_ATTENDANCE_MINUTES,
  ATTENDANCE_DAY_MINUTES,
  startingSpForStudent
} from '../services/studentStanding.js'

const oid = () => new mongoose.Types.ObjectId()
const BASE = new Date('2026-10-01T09:00:00.000Z')
const min = (m) => new Date(BASE.getTime() + m * 60000)

let studentId

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URL, { dbName: 'studentStandingTest' })
})

afterAll(async () => {
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
})

beforeEach(async () => {
  await Promise.all([
    Room.deleteMany({}),
    RoomMember.deleteMany({}),
    Response.deleteMany({}),
    AttendanceLedger.deleteMany({}),
    StudentStanding.deleteMany({}),
    User.deleteMany({})
  ])
  studentId = oid()
})

async function makeRoom({ code, startMin, durationMin = 35, penalty = 10 }) {
  return Room.create({
    name: `Room ${code}`,
    code,
    teacher: oid(),
    isActive: false,
    createdAt: min(startMin),
    endedAt: min(startMin + durationMin),
    settings: {
      waitingRoomEnabled: true,
      scheduledStartAt: min(startMin),
      graceMinutes: 5,
      lateWindowMinutes: 15,
      latePenaltySp: penalty
    }
  })
}

async function makeMember(room, { status, admittedOffsetMin = 0 }) {
  return RoomMember.create({
    roomId: room._id,
    studentId,
    joinedAt: room.settings.scheduledStartAt,
    admittedAt: min(room.createdAt.getTime() / 60000 - BASE.getTime() / 60000 + admittedOffsetMin),
    admissionStatus: 'admitted',
    attendanceStatus: status,
    attendanceMarkedAt: min(35)
  })
}

async function addResponses(room, points) {
  return Response.create({
    roomId: room._id,
    questionId: oid(),
    studentId,
    selectedOption: 0,
    isCorrect: true,
    points
  })
}

describe('room settlement', () => {
  it('credits earnings once and never re-settles the same room', async () => {
    const room = await makeRoom({ code: 'SETTLE1', startMin: 0 })
    await makeMember(room, { status: 'on_time', admittedOffsetMin: 0 })
    await addResponses(room, 240)

    const first = await processRoomAttendance(room._id)
    expect(first).toMatchObject({ processed: 1, skipped: false })

    const standing = await StudentStanding.findOne({ studentId })
    const startingSp = startingSpForStudent(studentId)
    expect(standing.spBalance).toBe(startingSp + 240)
    expect(standing.attendanceMinutes).toBe(STARTING_ATTENDANCE_MINUTES + 35)
    expect(standing.sessionsAttended).toBe(1)
    expect(standing.strikes).toBe(0)

    const row = await AttendanceLedger.findOne({ roomId: room._id, studentId })
    expect(row.standingSettledAt).toBeTruthy()

    // Running the end-of-room job again must be a no-op.
    const second = await processRoomAttendance(room._id)
    expect(second).toMatchObject({ processed: 0, skipped: true })
    const unchanged = await StudentStanding.findOne({ studentId })
    expect(unchanged.spBalance).toBe(startingSp + 240)
    expect(unchanged.attendanceMinutes).toBe(STARTING_ATTENDANCE_MINUTES + 35)
  })

  it('charges late 1x, very_late 2x and absent 3x of the room SP setting', async () => {
    const cases = [
      { status: 'late', code: 'LATE1', expectedPenalty: 10 },
      { status: 'very_late', code: 'VLATE1', expectedPenalty: 20 },
      { status: 'absent', code: 'ABS1', expectedPenalty: 30 }
    ]
    for (const c of cases) {
      await StudentStanding.deleteMany({})
      await AttendanceLedger.deleteMany({})
      const room = await makeRoom({ code: c.code, startMin: 0, penalty: 10 })
      await makeMember(room, { status: c.status, admittedOffsetMin: 10 })
      await processRoomAttendance(room._id)

      const standing = await StudentStanding.findOne({ studentId })
      expect(standing.spBalance).toBe(startingSpForStudent(studentId) - c.expectedPenalty)
      // Absent and excused students earn no attendance minutes.
      expect(standing.attendanceMinutes).toBe(
        c.status === 'absent' ? STARTING_ATTENDANCE_MINUTES : STARTING_ATTENDANCE_MINUTES + 25
      )
    }
  })

  it('deducts average SP and 60 minutes on the 3rd consecutive late arrival', async () => {
    const specs = [
      { code: 'STRIKE1', startMin: 0, points: 300 },
      { code: 'STRIKE2', startMin: 60, points: 200 },
      { code: 'STRIKE3', startMin: 120, points: 100 }
    ]
    for (const spec of specs) {
      const room = await makeRoom({ code: spec.code, startMin: spec.startMin, durationMin: 35, penalty: 10 })
      await makeMember(room, { status: 'late', admittedOffsetMin: 5 })
      await addResponses(room, spec.points)
      const result = await processRoomAttendance(room._id)
      expect(result.processed).toBe(1)
    }

    const standing = await StudentStanding.findOne({ studentId })
    const averageSp = Math.round((300 + 200 + 100) / 3)

    // 3 rooms x (35 min duration - 5 min late) = 90 minutes earned, minus one 60-minute strike.
    expect(standing.attendanceMinutes).toBe(STARTING_ATTENDANCE_MINUTES + 90 - ATTENDANCE_DAY_MINUTES)
    // 600 SP earned - 30 SP of normal late penalties - 200 SP average-SP strike.
    expect(standing.spBalance).toBe(startingSpForStudent(studentId) + 600 - 30 - averageSp)
    expect(standing.sessionsAttended).toBe(3)
    expect(standing.strikes).toBe(1)
    expect(standing.lastStrikeAt).toBeTruthy()

    const summary = await getStudentAttendanceSummary(studentId)
    expect(summary.currentLateStreak).toBe(3)
    expect(summary.strikes).toBe(1)
    expect(summary.averageSp).toBe(averageSp)
    expect(summary.spBalance).toBe(standing.spBalance)
    expect(summary.attendanceDayMinutes).toBe(60)
  })

  it('resets the run after an on-time arrival, so only every third late strikes', async () => {
    const specs = [
      { code: 'RUN1', startMin: 0, status: 'late' },
      { code: 'RUN2', startMin: 60, status: 'late' },
      { code: 'RUN3', startMin: 120, status: 'on_time' },
      { code: 'RUN4', startMin: 180, status: 'late' },
      { code: 'RUN5', startMin: 240, status: 'late' }
    ]
    for (const spec of specs) {
      const room = await makeRoom({ code: spec.code, startMin: spec.startMin })
      await makeMember(room, { status: spec.status, admittedOffsetMin: spec.status === 'on_time' ? 0 : 5 })
      await processRoomAttendance(room._id)
    }

    const standing = await StudentStanding.findOne({ studentId })
    expect(standing.strikes).toBe(0)
    const summary = await getStudentAttendanceSummary(studentId)
    expect(summary.currentLateStreak).toBe(2)
  })

  it('shows Spurti live SP and attendance when the mirror is configured, without touching local balances', async () => {
    const email = 'mirror.student@example.com'
    const user = await User.create({ name: 'Mirror Student', email, password: 'secret123', role: 'student' })
    const savedEnv = {
      email: process.env.SPURTI_ADMIN_EMAIL,
      token: process.env.SPURTI_ADMIN_TOKEN
    }
    process.env.SPURTI_ADMIN_EMAIL = 'admin@example.com'
    process.env.SPURTI_ADMIN_TOKEN = 'secret'
    clearSpurtiCache()
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sessions: [{ label: 'S1' }],
        students: [{ email, totalSp: 4321, cells: { S1: { minutes: 123 } } }]
      })
    })

    try {
      const summary = await getStudentAttendanceSummary(user._id)
      expect(summary.source).toBe('spurti')
      expect(summary.spBalance).toBe(4321)
      expect(summary.attendanceMinutes).toBe(123)
      expect(summary.averageSp).toBe(4321)
      expect(summary.liveSource).toMatchObject({ source: 'spurti', spBalance: 4321, attendanceMinutes: 123 })
      // The local shadow is untouched and still seeded, so the mirror never rewrites Spandan data.
      expect(summary.local.spBalance).toBe(startingSpForStudent(String(user._id)))
      expect((await StudentStanding.findOne({ studentId: user._id })).spBalance)
        .toBe(startingSpForStudent(String(user._id)))
    } finally {
      fetchSpy.mockRestore()
      clearSpurtiCache()
      if (savedEnv.email === undefined) delete process.env.SPURTI_ADMIN_EMAIL
      else process.env.SPURTI_ADMIN_EMAIL = savedEnv.email
      if (savedEnv.token === undefined) delete process.env.SPURTI_ADMIN_TOKEN
      else process.env.SPURTI_ADMIN_TOKEN = savedEnv.token
    }
  })

  it('falls back to local balances when Spurti has no record for the student', async () => {
    const user = await User.create({ name: 'Local Student', email: 'local.student@example.com', password: 'secret123', role: 'student' })
    const savedEnv = {
      email: process.env.SPURTI_ADMIN_EMAIL,
      token: process.env.SPURTI_ADMIN_TOKEN
    }
    process.env.SPURTI_ADMIN_EMAIL = 'admin@example.com'
    process.env.SPURTI_ADMIN_TOKEN = 'secret'
    clearSpurtiCache()
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ sessions: [], students: [] })
    })

    try {
      const summary = await getStudentAttendanceSummary(user._id)
      expect(summary.source).toBe('local')
      expect(summary.liveSource).toBeNull()
      expect(summary.spBalance).toBe(startingSpForStudent(String(user._id)))
    } finally {
      fetchSpy.mockRestore()
      clearSpurtiCache()
      if (savedEnv.email === undefined) delete process.env.SPURTI_ADMIN_EMAIL
      else process.env.SPURTI_ADMIN_EMAIL = savedEnv.email
      if (savedEnv.token === undefined) delete process.env.SPURTI_ADMIN_TOKEN
      else process.env.SPURTI_ADMIN_TOKEN = savedEnv.token
    }
  })
})
