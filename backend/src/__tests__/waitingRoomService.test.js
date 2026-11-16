// Waiting-room presence: a student who closes the waiting screen must disappear from the teacher's
// queue immediately, while a returning student keeps their original place and on-time tag.
import mongoose from 'mongoose'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import User from '../models/User.js'
import {
  admitWaitingStudents,
  buildWaitingRoomSnapshot,
  ensureMembership
} from '../services/waitingRoomService.js'

const MINUTE = 60 * 1000
const at = (minutes) => new Date(Date.UTC(2026, 0, 1, 9, 0, 0) + minutes * MINUTE)

const makeUser = (name) => User.create({
  name,
  email: `${name.toLowerCase().replace(/\s+/g, '.')}.${Math.random().toString(36).slice(2)}@example.com`,
  password: 'Passw0rd!',
  role: 'student'
})

const makeRoom = async (teacher, overrides = {}) => Room.create({
  name: 'Waiting room test',
  teacher: teacher._id,
  sessionStartedAt: at(0),
  createdAt: at(0),
  settings: {
    waitingRoom: {
      enabled: true,
      mode: 'manual',
      graceSeconds: 120,
      reconnectAllowanceSeconds: 60
    }
  },
  ...overrides
})

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URL)
})

afterAll(async () => {
  await mongoose.disconnect()
})

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Room.deleteMany({}), RoomMember.deleteMany({})])
})

describe('buildWaitingRoomSnapshot — online waiting students only', () => {
  it('drops a waiting student as soon as their waiting socket goes offline', async () => {
    const teacher = await makeUser('Teacher')
    const online = await makeUser('Online Student')
    const offline = await makeUser('Offline Student')
    const room = await makeRoom(teacher)

    await RoomMember.create([
      { roomId: room._id, studentId: online._id, joinedAt: at(1), status: 'waiting', onTime: true },
      { roomId: room._id, studentId: offline._id, joinedAt: at(2), status: 'waiting', onTime: false, leftAt: at(3) }
    ])

    const snapshot = await buildWaitingRoomSnapshot(room)

    expect(snapshot.waiting.map((m) => String(m.studentId))).toEqual([String(online._id)])
    expect(snapshot.counts.waiting).toBe(1)
    expect(snapshot.counts.onTime).toBe(1)
    expect(snapshot.counts.late).toBe(0)
  })

  it('keeps the queue in join order with each student’s on-time tag', async () => {
    const teacher = await makeUser('Teacher')
    const first = await makeUser('First Student')
    const second = await makeUser('Second Student')
    const room = await makeRoom(teacher)

    await RoomMember.create([
      { roomId: room._id, studentId: second._id, joinedAt: at(5), status: 'waiting', onTime: false },
      { roomId: room._id, studentId: first._id, joinedAt: at(1), status: 'waiting', onTime: true }
    ])

    const snapshot = await buildWaitingRoomSnapshot(room)

    expect(snapshot.waiting.map((m) => m.name)).toEqual(['First Student', 'Second Student'])
    expect(snapshot.waiting.map((m) => m.onTime)).toEqual([true, false])
    expect(snapshot.counts.onTime).toBe(1)
    expect(snapshot.counts.late).toBe(1)
  })
})

describe('ensureMembership — returning waiting student', () => {
  it('clears the offline marker without changing join order or the on-time tag', async () => {
    const teacher = await makeUser('Teacher')
    const student = await makeUser('Returning Student')
    const room = await makeRoom(teacher)

    const member = await RoomMember.create({
      roomId: room._id,
      studentId: student._id,
      joinedAt: at(1),
      status: 'waiting',
      onTime: true,
      leftAt: at(4)
    })
    expect((await buildWaitingRoomSnapshot(room)).counts.waiting).toBe(0)

    const returned = await ensureMembership({ room, studentId: student._id, at: at(6) })

    expect(String(returned._id)).toBe(String(member._id))
    expect(returned.leftAt).toBeNull()
    expect(returned.joinedAt).toEqual(at(1))
    expect(returned.onTime).toBe(true)
    expect((await buildWaitingRoomSnapshot(room)).counts.waiting).toBe(1)
  })
})

describe('automatic mode — admit on-time joiners, then switch to manual', () => {
  it('admits an on-time student immediately without a teacher action', async () => {
    const teacher = await makeUser('Teacher')
    const student = await makeUser('On Time Student')
    const room = await makeRoom(teacher, {
      settings: { waitingRoom: { enabled: true, mode: 'automatic', graceSeconds: 120, reconnectAllowanceSeconds: 60 } }
    })

    const member = await ensureMembership({ room, studentId: student._id, at: at(1) })

    expect(member.status).toBe('admitted')
    expect(member.onTime).toBe(true)
    expect(member.admittedAt).toEqual(at(1))
    expect((await buildWaitingRoomSnapshot(room)).counts.waiting).toBe(0)
  })

  it('holds a late joiner and flips the room to manual once the grace window has passed', async () => {
    const teacher = await makeUser('Teacher')
    const student = await makeUser('Late Student')
    const room = await makeRoom(teacher, {
      settings: { waitingRoom: { enabled: true, mode: 'automatic', graceSeconds: 120, reconnectAllowanceSeconds: 60 } }
    })

    const late = await ensureMembership({ room, studentId: student._id, at: at(5) })

    expect(late.status).toBe('waiting')
    expect(late.onTime).toBe(false)
    const reloaded = await Room.findById(room._id).lean()
    expect(reloaded.settings.waitingRoom.mode).toBe('manual')
  })

  it('switches an overdue automatic room to manual even when nobody new joins', async () => {
    const teacher = await makeUser('Teacher')
    const room = await makeRoom(teacher, {
      sessionStartedAt: new Date(Date.now() - 60 * MINUTE),
      createdAt: new Date(Date.now() - 60 * MINUTE),
      settings: { waitingRoom: { enabled: true, mode: 'automatic', graceSeconds: 60, reconnectAllowanceSeconds: 60 } }
    })

    const snapshot = await buildWaitingRoomSnapshot(room)

    expect(snapshot.mode).toBe('manual')
    const reloaded = await Room.findById(room._id).lean()
    expect(reloaded.settings.waitingRoom.mode).toBe('manual')
  })
})

describe('admitWaitingStudents — matches what the teacher can see', () => {
  it('does not admit an offline waiting student when admitting all', async () => {
    const teacher = await makeUser('Teacher')
    const online = await makeUser('Online Student')
    const offline = await makeUser('Offline Student')
    const room = await makeRoom(teacher)

    await RoomMember.create([
      { roomId: room._id, studentId: online._id, joinedAt: at(1), status: 'waiting', onTime: true },
      { roomId: room._id, studentId: offline._id, joinedAt: at(2), status: 'waiting', onTime: true, leftAt: at(3) }
    ])

    const result = await admitWaitingStudents({ io: null, room, all: true })
    expect(result.admitted).toBe(1)

    const members = await RoomMember.find({ roomId: room._id }).sort({ joinedAt: 1 }).lean()
    expect(members.map((m) => m.status)).toEqual(['admitted', 'waiting'])
    expect(members[1].leftAt).toEqual(at(3))
  })
})
