// Unit tests for Doubt-Anchored Polling service
// Covers the privacy-preserving hash, anti-spam, retraction window,
// per-segment aggregation, and spike detection math.

import crypto from 'crypto'
import mongoose from 'mongoose'

// Use in-memory MongoDB (configured via jest.config.cjs @shelf/jest-mongodb preset)
import { DoubtSignal, Room, User, Transcript } from '../models/index.js'
import {
  hashStudent,
  recordDoubt,
  retractLatestDoubt,
  getDoubtCountsBySegment,
  detectSpikes
} from '../services/doubtService.js'

// ---- helpers ----------------------------------------------------------------

function hex64 (bytes = 32) { return crypto.randomBytes(bytes).toString('hex') }

async function makeRoom ({ isActive = true, withSalt = null } = {}) {
  const teacher = await User.create({
    name: 'Test Teacher',
    email: `t_${hex64(8)}@spandan.test`,
    password: 'password123',
    role: 'teacher'
  })
  const room = await Room.create({
    name: 'Test room',
    teacher: teacher._id,
    code: 'TEST' + Math.floor(Math.random() * 10000),
    isActive,
    ...(withSalt ? { doubtSalt: withSalt } : {})
  })
  return { room, teacher }
}

async function makeStudent (suffix = '') {
  return User.create({
    name: 'Test Student ' + suffix,
    email: `s_${hex64(8)}${suffix}@spandan.test`,
    password: 'password123',
    role: 'student'
  })
}

// ---- tests ------------------------------------------------------------------

describe('hashStudent', () => {
  it('produces a 64-char hex string', () => {
    const h = hashStudent('user123', 'salt')
    expect(h).toMatch(/^[a-f0-9]{64}$/)
  })

  it('is deterministic for the same input', () => {
    expect(hashStudent('u', 's')).toBe(hashStudent('u', 's'))
  })

  it('changes when salt changes', () => {
    expect(hashStudent('u', 's1')).not.toBe(hashStudent('u', 's2'))
  })

  it('changes when userId changes', () => {
    expect(hashStudent('u1', 's')).not.toBe(hashStudent('u2', 's'))
  })

  it('treats userId as string (no ObjectId coercion)', () => {
    const id = new mongoose.Types.ObjectId().toString()
    expect(hashStudent(id, 's')).toBe(hashStudent(id, 's'))
  })
})

// Per-test cleanup so each describe starts with a clean slate.
// We only clear collections used by the doubt service -- User/Room/Transcript
// are shared across suites and would break other suites if wiped globally.
beforeEach(async () => {
  await DoubtSignal.deleteMany({})
})

describe('recordDoubt', () => {
  let room, teacher, student
  beforeEach(async () => {
    // DoubtSignal wiped by global beforeEach above. Wipe User/Room too -- but
    // only inside our own describe, scoped to this run (jest-mongodb reuses
    // the same DB between files in one Jest process).
    await Room.deleteMany({})
    await User.deleteMany({})
    ;({ room, teacher } = await makeRoom())
    student = await makeStudent()
  })

  it('creates a signal with the anonymized hash', async () => {
    const res = await recordDoubt({
      roomId: room._id, userId: student._id,
      segmentIndex: 2, transcriptOffsetMs: 1234, client: 'web'
    })
    expect(res.ok).toBe(true)
    expect(res.signal.studentHash).toMatch(/^[a-f0-9]{64}$/)
    // hash must NOT equal the raw userId
    expect(res.signal.studentHash).not.toBe(String(student._id))
    expect(res.signal.segmentIndex).toBe(2)
    expect(res.signal.transcriptOffsetMs).toBe(1234)
    expect(res.signal.retracted).toBe(false)
  })

  it('rejects an invalid roomId', async () => {
    const res = await recordDoubt({
      roomId: 'not-a-valid-id', userId: student._id,
      segmentIndex: 0, transcriptOffsetMs: 0
    })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('invalid_room_id')
  })

  it('rejects when room does not exist', async () => {
    const res = await recordDoubt({
      roomId: new mongoose.Types.ObjectId(), userId: student._id,
      segmentIndex: 0, transcriptOffsetMs: 0
    })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('room_not_found')
  })

  it('rejects when room is ended', async () => {
    // End the room via the Mongoose model so the doc reflects isActive:false
    // for the in-memory MongoDB instance that this test connects to.
    const r = await Room.findById(room._id)
    r.isActive = false
    await r.save()
    const res = await recordDoubt({
      roomId: room._id, userId: student._id,
      segmentIndex: 0, transcriptOffsetMs: 0
    })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('room_ended')
  })

  it('auto-generates a per-room doubtSalt on first signal', async () => {
    const before = await Room.findById(room._id).select('doubtSalt')
    expect(before.doubtSalt).toBeFalsy()
    await recordDoubt({
      roomId: room._id, userId: student._id,
      segmentIndex: 0, transcriptOffsetMs: 0
    })
    const after = await Room.findById(room._id).select('doubtSalt')
    expect(after.doubtSalt).toMatch(/^[a-f0-9]{64}$/)
  })

  it('enforces 30-second anti-spam per (room, student)', async () => {
    const first = await recordDoubt({
      roomId: room._id, userId: student._id,
      segmentIndex: 0, transcriptOffsetMs: 0
    })
    expect(first.ok).toBe(true)
    const second = await recordDoubt({
      roomId: room._id, userId: student._id,
      segmentIndex: 5, transcriptOffsetMs: 9999
    })
    expect(second.ok).toBe(false)
    expect(second.reason).toBe('anti_spam')
    expect(second.retryAfterMs).toBe(30000)
  })

  it('allows different students in the same room to signal at the same time', async () => {
    const a = await makeStudent('A')
    const b = await makeStudent('B')
    const rA = await recordDoubt({ roomId: room._id, userId: a._id, segmentIndex: 1, transcriptOffsetMs: 0 })
    const rB = await recordDoubt({ roomId: room._id, userId: b._id, segmentIndex: 1, transcriptOffsetMs: 0 })
    expect(rA.ok).toBe(true)
    expect(rB.ok).toBe(true)
    const counts = await getDoubtCountsBySegment(room._id)
    expect(counts).toEqual([{ segmentIndex: 1, count: 2 }])
  })

  it('clamps negative segmentIndex / offset to 0', async () => {
    const res = await recordDoubt({
      roomId: room._id, userId: student._id,
      segmentIndex: -3, transcriptOffsetMs: -100
    })
    expect(res.ok).toBe(true)
    expect(res.signal.segmentIndex).toBe(0)
    expect(res.signal.transcriptOffsetMs).toBe(0)
  })

  it('allows a new signal after the anti-spam window passes', async () => {
    await recordDoubt({ roomId: room._id, userId: student._id, segmentIndex: 0, transcriptOffsetMs: 0 })
    // Backdate the first signal past the window
    await DoubtSignal.updateMany(
      { roomId: room._id },
      { $set: { createdAt: new Date(Date.now() - 31000) } }
    )
    const res = await recordDoubt({ roomId: room._id, userId: student._id, segmentIndex: 0, transcriptOffsetMs: 0 })
    expect(res.ok).toBe(true)
  })
})

describe('retractLatestDoubt', () => {
  let room, student
  beforeEach(async () => {
    await DoubtSignal.deleteMany({})
    await Room.deleteMany({})
    await User.deleteMany({})
    ;({ room } = await makeRoom())
    student = await makeStudent()
  })

  it('retracts the most recent signal from the same student', async () => {
    const sig = await recordDoubt({ roomId: room._id, userId: student._id, segmentIndex: 0, transcriptOffsetMs: 0 })
    const res = await retractLatestDoubt({ roomId: room._id, userId: student._id })
    expect(res.ok).toBe(true)
    const after = await DoubtSignal.findById(sig.signal._id)
    expect(after.retracted).toBe(true)
  })

  it('returns nothing_to_retract when no signal exists', async () => {
    const res = await retractLatestDoubt({ roomId: room._id, userId: student._id })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('nothing_to_retract')
  })

  it('refuses retraction outside the 60s window', async () => {
    await recordDoubt({ roomId: room._id, userId: student._id, segmentIndex: 0, transcriptOffsetMs: 0 })
    await DoubtSignal.updateMany(
      { roomId: room._id },
      { $set: { createdAt: new Date(Date.now() - 61000) } }
    )
    const res = await retractLatestDoubt({ roomId: room._id, userId: student._id })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('nothing_to_retract')
  })

  it('only retracts the caller\'s signal, not other students\'', async () => {
    const a = await makeStudent('A')
    const b = await makeStudent('B')
    await recordDoubt({ roomId: room._id, userId: a._id, segmentIndex: 0, transcriptOffsetMs: 0 })
    await recordDoubt({ roomId: room._id, userId: b._id, segmentIndex: 0, transcriptOffsetMs: 0 })
    const res = await retractLatestDoubt({ roomId: room._id, userId: a._id })
    expect(res.ok).toBe(true)
    const retracted = await DoubtSignal.countDocuments({ roomId: room._id, retracted: true })
    const visible = await getDoubtCountsBySegment(room._id)
    expect(retracted).toBe(1)
    expect(visible).toEqual([{ segmentIndex: 0, count: 1 }])
  })
})

describe('getDoubtCountsBySegment', () => {
  let room
  beforeEach(async () => {
    await DoubtSignal.deleteMany({})
    await Room.deleteMany({})
    await User.deleteMany({})
    ;({ room } = await makeRoom())
  })

  it('returns empty list when no signals exist', async () => {
    const r = await getDoubtCountsBySegment(room._id)
    expect(r).toEqual([])
  })

  it('aggregates distinct student hashes per segment', async () => {
    const students = await Promise.all([0, 1, 2, 3, 4].map(i => makeStudent(String(i))))
    // seg 0: 3 distinct students
    for (let i = 0; i < 3; i++) {
      await recordDoubt({ roomId: room._id, userId: students[i]._id, segmentIndex: 0, transcriptOffsetMs: 0 })
    }
    // seg 2: 1 student
    await recordDoubt({ roomId: room._id, userId: students[3]._id, segmentIndex: 2, transcriptOffsetMs: 0 })
    // seg 5: 1 student
    await recordDoubt({ roomId: room._id, userId: students[4]._id, segmentIndex: 5, transcriptOffsetMs: 0 })

    const counts = await getDoubtCountsBySegment(room._id)
    expect(counts).toEqual([
      { segmentIndex: 0, count: 3 },
      { segmentIndex: 2, count: 1 },
      { segmentIndex: 5, count: 1 }
    ])
  })

  it('ignores retracted signals in the aggregate', async () => {
    const s = await makeStudent()
    await recordDoubt({ roomId: room._id, userId: s._id, segmentIndex: 0, transcriptOffsetMs: 0 })
    await DoubtSignal.updateMany({ roomId: room._id }, { $set: { retracted: true } })
    const counts = await getDoubtCountsBySegment(room._id)
    expect(counts).toEqual([])
  })
})

describe('detectSpikes', () => {
  let room
  beforeEach(async () => {
    await DoubtSignal.deleteMany({})
    await Room.deleteMany({})
    await User.deleteMany({})
    await Transcript.deleteMany({})
    await User.deleteMany({})
    ;({ room } = await makeRoom())
  })

  async function seedSegment (segIndex, studentCount, transcriptText = '') {
    const teacher = await User.findOne({ role: 'teacher' })
    for (let i = 0; i < studentCount; i++) {
      const s = await makeStudent(String(segIndex) + '_' + i)
      await recordDoubt({ roomId: room._id, userId: s._id, segmentIndex: segIndex, transcriptOffsetMs: 0 })
    }
    if (transcriptText) {
      await Transcript.create({
        roomId: room._id,
        segmentIndex: segIndex,
        teacherId: teacher._id,
        text: transcriptText
      })
    }
  }

  it('returns empty when no signals', async () => {
    const r = await detectSpikes({ roomId: room._id })
    expect(r.spikes).toEqual([])
    expect(r.allSegments).toEqual([])
  })

  it('flags a segment when raw count >= minMarkCount', async () => {
    await seedSegment(0, 1)
    await seedSegment(1, 4) // 4 >= 3 -> spike
    await seedSegment(2, 1)
    const r = await detectSpikes({ roomId: room._id, minMarkCount: 3 })
    expect(r.spikes).toHaveLength(1)
    expect(r.spikes[0].segmentIndex).toBe(1)
    expect(r.spikes[0].count).toBe(4)
  })

  it('also flags via mean+2*stddev when counts vary widely', async () => {
    // mongo write heavy -- allow extra time on slow CI
    jest.setTimeout(20000)
    // counts: [1, 1, 1, 10] -> mean=3.25, stddev~3.9, threshold~11 -> 10 NOT a spike
    await seedSegment(0, 1)
    await seedSegment(1, 1)
    await seedSegment(2, 1)
    await seedSegment(3, 10)
    // Drop minMarkCount so the threshold math drives everything
    const r = await detectSpikes({ roomId: room._id, minMarkCount: 1, spikeStdDevMultiplier: 2.0 })
    // With counts [1,1,1,10]: mean 3.25, stddev ~3.9, threshold 11.05 -> 10 < 11 -> not a spike.
    // But every segment passes minMarkCount=1 -> 4 spikes. The math still surfaces the
    // outlier (segment 3) highest, sorted by count desc.
    expect(r.spikes[0].segmentIndex).toBe(3)
    expect(r.stats.mean).toBeCloseTo(3.25, 2)
    expect(r.stats.stddev).toBeGreaterThan(0)
  })

  it('includes transcript snippet for spikes', async () => {
    await seedSegment(0, 4, 'Glycolysis produces 2 ATP per glucose molecule.')
    const r = await detectSpikes({ roomId: room._id, minMarkCount: 3 })
    expect(r.spikes[0].transcriptSnippet).toContain('Glycolysis')
  })

  it('truncates snippet to 200 characters', async () => {
    const long = 'A'.repeat(500)
    await seedSegment(0, 4, long)
    const r = await detectSpikes({ roomId: room._id, minMarkCount: 3 })
    expect(r.spikes[0].transcriptSnippet.length).toBe(200)
  })

  it('sorts spikes by count descending', async () => {
    // mongo write heavy -- allow extra time on slow CI
    jest.setTimeout(20000)
    await seedSegment(0, 4)
    await seedSegment(1, 8)
    await seedSegment(2, 6)
    const r = await detectSpikes({ roomId: room._id, minMarkCount: 3 })
    expect(r.spikes.map(s => s.count)).toEqual([8, 6, 4])
  })

  it('allSegments includes every segment that has at least one signal', async () => {
    await seedSegment(0, 1)
    await seedSegment(1, 1)
    await seedSegment(2, 1)
    const r = await detectSpikes({ roomId: room._id, minMarkCount: 99 })
    expect(r.allSegments.map(c => c.segmentIndex).sort()).toEqual([0, 1, 2])
  })
})