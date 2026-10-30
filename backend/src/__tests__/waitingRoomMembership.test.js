// Membership-flow tests for the waiting room. These hit the in-memory MongoDB because the bug they
// cover lives in the persistence, not the pure policy:
//
//   1. Leaving must NOT delete the membership row. Deleting it made a rejoin look like a brand-new
//      join, so a manual room parked the student back in the lobby and an automatic room could
//      re-classify a disconnected student as very late.
//   2. A manual admit must stamp attendance from when the student arrived, not from when the
//      teacher clicked Admit, otherwise a slow teacher marks on-time students late.
//   3. Participant counts must ignore members who have left, without breaking legacy rows that
//      predate the leftAt field.
import mongoose from 'mongoose'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import {
  ensureRoomMember,
  admitRoomMember,
  countParticipants,
  countWaiting
} from '../services/waitingRoom.js'

const oid = () => new mongoose.Types.ObjectId()
const BASE = new Date('2026-10-01T09:00:00.000Z')
const min = (m) => new Date(BASE.getTime() + m * 60000)

let room
let scheduledRoom

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URL, { dbName: 'waitingRoomMembershipTest' })
})

afterAll(async () => {
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
})

beforeEach(async () => {
  await Promise.all([Room.deleteMany({}), RoomMember.deleteMany({})])
  room = await Room.create({
    name: 'Manual Room',
    code: 'MANUAL',
    teacher: oid(),
    isActive: true,
    settings: {
      waitingRoomEnabled: true,
      waitingRoomPolicy: 'manual',
      scheduledStartAt: BASE,
      graceMinutes: 5,
      lateWindowMinutes: 15,
      latePenaltySp: 10,
      allowLateJoin: true
    }
  })
  scheduledRoom = room
})

describe('manual policy admission', () => {
  it('admits an on-time student without teacher action', async () => {
    const studentId = oid()
    const { member, evaluation } = await ensureRoomMember({
      room: scheduledRoom,
      studentId,
      at: min(0)
    })
    expect(member.admissionStatus).toBe('admitted')
    expect(evaluation.admitted).toBe(true)
    expect(member.attendanceStatus).toBe('on_time')
    expect(evaluation.watchOnly).toBe(false)
  })

  it('admits a late student and keeps the late notice', async () => {
    const studentId = oid()
    const { member, evaluation } = await ensureRoomMember({
      room: scheduledRoom,
      studentId,
      at: min(10)
    })
    expect(member.admissionStatus).toBe('admitted')
    expect(member.attendanceStatus).toBe('late')
    expect(evaluation.notification).toMatch(/joined late/i)
  })

  it('keeps only a very-late student waiting for approval', async () => {
    const studentId = oid()
    const { member, evaluation } = await ensureRoomMember({
      room: scheduledRoom,
      studentId,
      at: min(30)
    })
    expect(member.admissionStatus).toBe('waiting')
    expect(evaluation.admitted).toBe(false)
    expect(member.attendanceStatus).toBe('pending')

    const approved = await admitRoomMember({ room: scheduledRoom, studentId, at: min(45) })
    expect(approved.member.attendanceStatus).toBe('very_late')
    expect(approved.evaluation.watchOnly).toBe(true)
  })
})

describe('teacher chime trigger', () => {
  it('flags only the join that moves a student into the waiting room', async () => {
    const onTimeStudent = oid()
    const onTime = await ensureRoomMember({ room: scheduledRoom, studentId: onTimeStudent, at: min(0) })
    expect(onTime.becameWaiting).toBe(false)

    const lateStudent = oid()
    const late = await ensureRoomMember({ room: scheduledRoom, studentId: lateStudent, at: min(10) })
    expect(late.becameWaiting).toBe(false)

    const veryLateStudent = oid()
    const waiting = await ensureRoomMember({ room: scheduledRoom, studentId: veryLateStudent, at: min(30) })
    expect(waiting.becameWaiting).toBe(true)

    // A reconnect while already waiting is not a new arrival, so it must not chime again.
    const reconnect = await ensureRoomMember({ room: scheduledRoom, studentId: veryLateStudent, at: min(35) })
    expect(reconnect.becameWaiting).toBe(false)
  })

  it('defaults the per-room chime to on', async () => {
    expect(scheduledRoom.settings.waitingRoomChime).toBe(true)
  })
})

describe('rejoin after leaving', () => {
  it('restores the same admitted state and attendance instead of re-evaluating', async () => {
    const studentId = oid()
    // Admitted on time early in the session, then they navigated away / their tab closed.
    await RoomMember.create({
      roomId: scheduledRoom._id,
      studentId,
      joinedAt: min(0),
      admittedAt: min(0),
      admissionStatus: 'admitted',
      attendanceStatus: 'on_time',
      attendanceMarkedAt: min(0),
      leftAt: min(10)
    })
    // They come back 80 minutes after the start - well past the late window.
    const { member, evaluation } = await ensureRoomMember({
      room: scheduledRoom,
      studentId,
      at: min(80)
    })

    expect(member.leftAt).toBeNull()
    expect(member.admissionStatus).toBe('admitted')
    expect(evaluation.state).toBe('admitted')
    expect(evaluation.admitted).toBe(true)
    expect(evaluation.waitingRoom).toBe(false)
    // Sticky: a reconnect must never turn an on-time arrival into very_late.
    expect(member.attendanceStatus).toBe('on_time')
    expect(evaluation.attendanceStatus).toBe('on_time')
    expect(evaluation.watchOnly).toBe(false)
    // The original arrival is preserved, so late minutes stay based on it.
    expect(member.joinedAt.getTime()).toBe(min(0).getTime())
    expect(member.admittedAt.getTime()).toBe(min(0).getTime())
  })

  it('does not leave a lingering leftAt marker to keep them out of the participant count', async () => {
    const studentId = oid()
    await RoomMember.create({
      roomId: scheduledRoom._id,
      studentId,
      joinedAt: min(0),
      admissionStatus: 'admitted',
      attendanceStatus: 'on_time',
      leftAt: min(5)
    })
    expect(await countParticipants(scheduledRoom._id)).toBe(0)

    await ensureRoomMember({ room: scheduledRoom, studentId, at: min(20) })
    expect(await countParticipants(scheduledRoom._id)).toBe(1)
  })
})

describe('manual admission attendance', () => {
  it('marks an on-time arrival on time even when the teacher admits them much later', async () => {
    const studentId = oid()
    await RoomMember.create({
      roomId: scheduledRoom._id,
      studentId,
      joinedAt: min(2), // inside the 5-minute grace
      waitingRequestedAt: min(2),
      admissionStatus: 'waiting',
      attendanceStatus: 'pending'
    })

    const { member, evaluation } = await admitRoomMember({
      room: scheduledRoom,
      studentId,
      at: min(45) // teacher was busy
    })

    expect(member.admissionStatus).toBe('admitted')
    expect(member.attendanceStatus).toBe('on_time')
    expect(evaluation.attendanceStatus).toBe('on_time')
    expect(evaluation.watchOnly).toBe(false)
    // admittedAt records when they actually arrived, not when the teacher clicked.
    expect(member.admittedAt.getTime()).toBe(min(2).getTime())
    expect(evaluation.lateMinutes).toBe(0)
  })

  it('still classifies a genuinely late arrival as late', async () => {
    const studentId = oid()
    await RoomMember.create({
      roomId: scheduledRoom._id,
      studentId,
      joinedAt: min(10), // past grace, inside the 15-minute late window
      waitingRequestedAt: min(10),
      admissionStatus: 'waiting',
      attendanceStatus: 'pending'
    })

    const { member } = await admitRoomMember({ room: scheduledRoom, studentId, at: min(30) })
    expect(member.attendanceStatus).toBe('late')
  })
})

describe('participant counts', () => {
  it('excludes members who left but keeps legacy rows without leftAt', async () => {
    const roomId = scheduledRoom._id
    await RoomMember.create({
      roomId, studentId: oid(), admissionStatus: 'admitted', joinedAt: min(0), leftAt: min(5)
    })
    await RoomMember.create({
      roomId, studentId: oid(), admissionStatus: 'admitted', joinedAt: min(0), leftAt: null
    })
    // Legacy row: field absent entirely.
    await RoomMember.collection.insertOne({
      roomId, studentId: oid(), joinedAt: min(0), admissionStatus: 'admitted'
    })
    await RoomMember.create({
      roomId, studentId: oid(), admissionStatus: 'waiting', joinedAt: min(0), leftAt: null
    })

    expect(await countParticipants(roomId)).toBe(2) // admitted + legacy
    expect(await countWaiting(roomId)).toBe(1)
  })
})
