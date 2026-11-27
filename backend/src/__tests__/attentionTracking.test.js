// Attention tracking (tab hidden / window unfocused) turns an ordinary presence gap into the same
// absence budget as a reload. These tests cover the room setting, the presence interval lifecycle,
// the reason recorded on each gap, and the POST /responses presence gate helper.
import mongoose from 'mongoose'
import RoomMember from '../models/RoomMember.js'
import {
  DEFAULT_ATTENTION_ENABLED,
  DEFAULT_ATTENTION_GRACE_SECONDS,
  computeReconnectUsage,
  endPresence,
  getAttentionConfig,
  isMembershipPresent,
  startPresence
} from '../services/attendanceService.js'

const MINUTE = 60 * 1000
const at = (minutes) => new Date(Date.UTC(2026, 0, 1, 9, 0, 0) + minutes * MINUTE)
const oid = () => new mongoose.Types.ObjectId()

const sessionStart = at(0)
const roomAt = ({ allowanceSeconds = 60 } = {}) => ({
  _id: oid(),
  sessionStartedAt: sessionStart,
  createdAt: sessionStart,
  settings: { waitingRoom: { reconnectAllowanceSeconds: allowanceSeconds } }
})

describe('getAttentionConfig', () => {
  it('defaults to enabled with a 7-second grace period', () => {
    expect(getAttentionConfig({})).toEqual({
      enabled: DEFAULT_ATTENTION_ENABLED,
      graceSeconds: DEFAULT_ATTENTION_GRACE_SECONDS
    })
    expect(getAttentionConfig({ settings: {} })).toEqual({ enabled: true, graceSeconds: 7 })
    expect(getAttentionConfig(null)).toEqual({ enabled: true, graceSeconds: 7 })
  })

  it('honours an explicit room setting', () => {
    expect(getAttentionConfig({ settings: { attention: { enabled: false, graceSeconds: 12 } } }))
      .toEqual({ enabled: false, graceSeconds: 12 })
  })

  it('falls back to defaults for a non-boolean enabled flag and a non-numeric grace', () => {
    expect(getAttentionConfig({ settings: { attention: { enabled: 'no', graceSeconds: 'soon' } } }))
      .toEqual({ enabled: true, graceSeconds: 7 })
  })

  it('clamps the grace period to 0..300 whole seconds', () => {
    const grace = (v) => getAttentionConfig({ settings: { attention: { graceSeconds: v } } }).graceSeconds
    expect(grace(-5)).toBe(0)
    expect(grace(0)).toBe(0)
    expect(grace(12.9)).toBe(12)
    expect(grace(300)).toBe(300)
    expect(grace(500)).toBe(300)
  })
})

describe('isMembershipPresent — POST /responses away gate', () => {
  it('treats a legacy membership with no presence history as present', () => {
    expect(isMembershipPresent({ leftAt: null, presence: [] })).toBe(true)
    expect(isMembershipPresent({ leftAt: null })).toBe(true)
  })

  it('is present while the latest interval is open', () => {
    expect(isMembershipPresent({
      leftAt: null,
      presence: [{ start: at(0), end: at(10) }, { start: at(11), end: null }]
    })).toBe(true)
  })

  it('is away when every interval is closed or leftAt is set', () => {
    expect(isMembershipPresent({
      leftAt: null,
      presence: [{ start: at(0), end: at(10) }]
    })).toBe(false)
    expect(isMembershipPresent({
      leftAt: at(10),
      presence: [{ start: at(0), end: null }]
    })).toBe(false)
  })

  it('is away when there is no membership at all', () => {
    expect(isMembershipPresent(null)).toBe(false)
  })
})

describe('presence interval lifecycle (real membership document)', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URL)
  })
  afterAll(async () => {
    await mongoose.disconnect()
  })
  beforeEach(async () => {
    await RoomMember.deleteMany({})
  })

  const createMember = async (presence = [{ start: at(0), end: null }]) => {
    const room = roomAt()
    const member = await RoomMember.create({
      roomId: room._id,
      studentId: oid(),
      onTime: false,
      presence
    })
    return { room, member }
  }

  it('records the away reason and closes the open interval', async () => {
    const { room, member } = await createMember()
    const awayAt = at(2)

    const result = await endPresence(room, member.studentId, awayAt, ' tab-hidden ')

    expect(result.closed).toBe(true)
    const saved = await RoomMember.findById(member._id)
    expect(saved.presence).toHaveLength(1)
    expect(saved.presence[0].end).toEqual(awayAt)
    expect(saved.presence[0].endedReason).toBe('tab-hidden')
    expect(saved.leftAt).toEqual(awayAt)
  })

  it('caps an oversized reason so a client cannot store an unbounded string', async () => {
    const { room, member } = await createMember()

    await endPresence(room, member.studentId, at(2), 'x'.repeat(80))

    const saved = await RoomMember.findById(member._id)
    expect(saved.presence[0].endedReason).toHaveLength(40)
  })

  it('never closes an interval before it started', async () => {
    const { room, member } = await createMember([{ start: at(10), end: null }])

    await endPresence(room, member.studentId, at(5), 'window-blur')

    const saved = await RoomMember.findById(member._id)
    expect(saved.presence[0].end).toEqual(at(10))
  })

  it('does not close twice (explicit leave followed by a disconnect)', async () => {
    const { room, member } = await createMember([{ start: at(0), end: at(5), endedReason: 'leave' }])

    const result = await endPresence(room, member.studentId, at(6), 'disconnect')

    expect(result.closed).toBe(false)
    const saved = await RoomMember.findById(member._id)
    expect(saved.presence[0].end).toEqual(at(5))
    expect(saved.presence[0].endedReason).toBe('leave')
  })

  it('reopens presence after a return, keeping the earlier gap in history', async () => {
    const { room, member } = await createMember([{ start: at(0), end: null }])
    await endPresence(room, member.studentId, at(2), 'tab-hidden')

    const reopened = await startPresence(room, member.studentId, at(3))

    expect(reopened.leftAt).toBeNull()
    expect(reopened.presence).toHaveLength(2)
    expect(reopened.presence[0].endedReason).toBe('tab-hidden')
    expect(reopened.presence[1]).toMatchObject({ start: at(3), end: null })
    expect(isMembershipPresent(reopened.toObject())).toBe(true)
  })
})

describe('computeReconnectUsage — away reasons', () => {
  const usage = (presence, options = {}) => computeReconnectUsage({
    member: { presence },
    room: { ...roomAt(options), endedAt: options.endedAt || null },
    at: options.at || at(60)
  })

  it('labels an internal gap with the reason its previous interval closed', () => {
    const result = usage([
      { start: at(0), end: at(20), endedReason: 'tab-hidden' },
      { start: at(20.5), end: at(60) }
    ], { allowanceSeconds: 120 })

    expect(result.gaps[0].reason).toBe('tab-hidden')
    expect(result.events.find((e) => e.type === 'left').reason).toBe('tab-hidden')
  })

  it('labels the final no-return absence with the reason the last interval closed', () => {
    const result = usage([
      { start: at(0), end: at(40), endedReason: 'window-blur' }
    ], { endedAt: at(60), allowanceSeconds: 600 })

    expect(result.gaps[0]).toMatchObject({
      reason: 'window-blur',
      final: true,
      open: false
    })
    expect(result.awayReason).toBe('window-blur')
  })

  it('labels a still-open trailing absence and reports why the student is away', () => {
    const result = usage([
      { start: at(0), end: at(20), endedReason: 'frozen' }
    ], { at: at(40), allowanceSeconds: 600 })

    expect(result.present).toBe(false)
    expect(result.awayReason).toBe('frozen')
    expect(result.gaps[0]).toMatchObject({ reason: 'frozen', open: true })
  })

  it('leaves the reason null for intervals closed by an older server', () => {
    const result = usage([
      { start: at(0), end: at(20) },
      { start: at(20.5), end: at(60) }
    ], { allowanceSeconds: 120 })

    expect(result.gaps[0].reason).toBeNull()
  })
})
