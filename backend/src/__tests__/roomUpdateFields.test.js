// updateRoom must accept only the fields a teacher owns, and must derive the end timestamp itself.
// The route guards reactivation with `if (room.endedAt && req.body.isActive === true)`, which only
// holds while endedAt is beyond the caller's reach — it used to $set the request body wholesale.
import mongoose from 'mongoose'
import Room from '../models/Room.js'
import { updateRoom } from '../services/roomService.js'

describe('updateRoom field allowlist', () => {
  const ownerId = new mongoose.Types.ObjectId()
  let room

  beforeAll(async () => {
    // Jest runs suites in parallel against ONE mongod, so every suite that writes takes its own
    // database — otherwise a beforeEach in a sibling suite deletes this one's fixtures mid-run.
    await mongoose.connect(process.env.MONGO_URL, { dbName: 'room-update-fields' })
  })

  afterAll(async () => {
    await mongoose.disconnect()
  })

  beforeEach(async () => {
    await Room.deleteMany({})
    room = await new Room({ name: 'Session', teacher: ownerId }).save()
  })

  it('applies the fields a teacher may change', async () => {
    const updated = await updateRoom(room._id, { name: 'Renamed', settings: { timeToAnswer: 45 } })

    expect(updated.name).toBe('Renamed')
    expect(updated.settings.timeToAnswer).toBe(45)
  })

  it('ignores fields the caller does not own', async () => {
    const otherTeacher = new mongoose.Types.ObjectId()
    const someQuestion = new mongoose.Types.ObjectId()

    const updated = await updateRoom(room._id, {
      teacher: otherTeacher,
      code: 'STOLEN',
      currentQuestion: someQuestion
    })

    expect(updated.teacher.toString()).toBe(ownerId.toString())
    expect(updated.code).toBe(room.code)
    expect(updated.currentQuestion).toBeUndefined()
  })

  it('stamps endedAt itself when the room is ended', async () => {
    const before = Date.now()
    const updated = await updateRoom(room._id, { isActive: false })

    expect(updated.isActive).toBe(false)
    expect(updated.endedAt).toBeInstanceOf(Date)
    expect(updated.endedAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('ignores a caller-supplied endedAt', async () => {
    const backdated = new Date('2020-01-01T00:00:00Z')
    const updated = await updateRoom(room._id, { isActive: false, endedAt: backdated })

    expect(updated.endedAt.getTime()).not.toBe(backdated.getTime())
  })

  it('cannot clear endedAt to reopen an ended session', async () => {
    const ended = await updateRoom(room._id, { isActive: false })

    const reopened = await updateRoom(room._id, { endedAt: null, isActive: true })

    expect(reopened.endedAt).toEqual(ended.endedAt)
  })

  it('does not move the end time of an already-ended room', async () => {
    const ended = await updateRoom(room._id, { isActive: false })
    const reEnded = await updateRoom(room._id, { isActive: false })

    expect(reEnded.endedAt).toEqual(ended.endedAt)
  })
})
