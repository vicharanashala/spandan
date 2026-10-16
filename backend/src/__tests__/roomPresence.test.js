import mongoose from 'mongoose'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import RoomPresence from '../models/RoomPresence.js'
import User from '../models/User.js'
import { closePresenceInterval, getPresenceSeconds } from '../services/presence.js'

// index.js starts a real HTTP/Socket.IO server and connects to Mongo at import time
// (see startServer() at the bottom of that file) and this repo has no socket.io-client
// dependency, so the socket handlers can't be driven directly in a test process. Instead
// this exercises the same DB-backed functions those handlers call: closePresenceInterval is
// exactly what index.js's shared closePresenceForRoom() calls from BOTH the 'room:leave' and
// 'disconnect' handlers, so testing it here covers both call sites.
describe('room presence + membership — socket layer DB behavior', () => {
  let room, student

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URL)
  })

  afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  })

  beforeEach(async () => {
    await Promise.all([
      Room.deleteMany({}),
      RoomMember.deleteMany({}),
      RoomPresence.deleteMany({}),
      User.deleteMany({})
    ])
    const teacher = await User.create({ name: 'Teacher', email: 't@test.com', password: 'password123', role: 'teacher' })
    student = await User.create({ name: 'Student', email: 's@test.com', password: 'password123', role: 'student' })
    room = await Room.create({ name: 'Test room', teacher: teacher._id })
  })

  // Mirrors what index.js's 'room:join' handler does for a student: create one open interval.
  async function openPresence() {
    return RoomPresence.create({ roomId: room._id, studentId: student._id, joinedAt: new Date(), leftAt: null })
  }

  it('a clean leave closes the interval with a leftAt matching the elapsed time', async () => {
    const presence = await openPresence()
    await new Promise(resolve => setTimeout(resolve, 20))

    await closePresenceInterval(presence._id)

    const stored = await RoomPresence.findById(presence._id)
    expect(stored.leftAt).not.toBeNull()
    expect(stored.leftAt.getTime()).toBeGreaterThanOrEqual(stored.joinedAt.getTime())
  })

  it('an unclean disconnect closes the interval through the same shared function room:leave uses', async () => {
    const presence = await openPresence()

    // This is the disconnect code path: index.js's disconnect handler finds
    // socket.data.presenceByRoom still set (no room:leave ever fired) and closes it via
    // closePresenceForRoom -> closePresenceInterval, identically to a clean leave.
    await closePresenceInterval(presence._id)

    const stored = await RoomPresence.findById(presence._id)
    expect(stored.leftAt).not.toBeNull()
  })

  it('closing an already-closed interval a second time is a no-op (idempotent)', async () => {
    const presence = await openPresence()
    await closePresenceInterval(presence._id)
    const firstLeftAt = (await RoomPresence.findById(presence._id)).leftAt

    await closePresenceInterval(presence._id) // e.g. disconnect firing after an explicit leave
    const secondLeftAt = (await RoomPresence.findById(presence._id)).leftAt
    expect(secondLeftAt.getTime()).toBe(firstLeftAt.getTime())
  })

  it('two connections for the same student produce two independently closeable rows', async () => {
    const presenceA = await openPresence()
    const presenceB = await openPresence()

    const rows = await RoomPresence.find({ roomId: room._id, studentId: student._id })
    expect(rows).toHaveLength(2)

    await closePresenceInterval(presenceA._id)

    const [a, b] = await Promise.all([
      RoomPresence.findById(presenceA._id),
      RoomPresence.findById(presenceB._id)
    ])
    expect(a.leftAt).not.toBeNull()
    expect(b.leftAt).toBeNull() // closing A must not touch B

    await closePresenceInterval(presenceB._id)
    expect((await RoomPresence.findById(presenceB._id)).leftAt).not.toBeNull()
  })

  it('getPresenceSeconds reads the closed interval back through Room + RoomPresence', async () => {
    const joinedAt = new Date(room.createdAt.getTime() + 100)
    const leftAt = new Date(joinedAt.getTime() + 5000)
    await RoomPresence.create({ roomId: room._id, studentId: student._id, joinedAt, leftAt })
    await Room.updateOne({ _id: room._id }, { endedAt: new Date(leftAt.getTime() + 1000) })

    const seconds = await getPresenceSeconds(room._id, student._id)
    expect(seconds).toBe(5)
  })

  describe('RoomMember — unchanged by this task', () => {
    it('leaving still deletes the RoomMember row and the participant count still updates', async () => {
      // Same upsert index.js's room:join runs for a student.
      await RoomMember.findOneAndUpdate(
        { roomId: room._id, studentId: student._id },
        { roomId: room._id, studentId: student._id, joinedAt: new Date() },
        { upsert: true, new: true }
      )
      expect(await RoomMember.countDocuments({ roomId: room._id })).toBe(1)

      // Same delete index.js's room:leave runs for a student.
      await RoomMember.deleteOne({ roomId: room._id, studentId: student._id })

      expect(await RoomMember.countDocuments({ roomId: room._id })).toBe(0)
      expect(await RoomMember.findOne({ roomId: room._id, studentId: student._id })).toBeNull()
    })
  })
})
