// Integration tests for the incremental ranked leaderboard (services/leaderboardAgg.js).
//
// The board is now assembled from a per-room running total plus a scan of only the questions that
// are not finalised yet. That is a cache of derived data, so the thing worth testing is not "does it
// aggregate" but "is it ALWAYS equal to what a full re-aggregation would have produced" — across
// finalisation, late answers inside the grace window, repeated calls, overlapping calls and deleted
// data. Every test therefore compares against a reference full-room aggregation.

import mongoose from 'mongoose'
import { computeRanked, resetLeaderboardMemo } from '../services/leaderboardAgg.js'
import Response from '../models/Response.js'
import Question from '../models/Question.js'
import User from '../models/User.js'

const oid = () => new mongoose.Types.ObjectId()

// The pre-incremental implementation, verbatim in spirit: re-sum the entire room every time.
async function referenceBoard(roomId) {
  const rows = await Response.aggregate([
    { $match: { roomId: new mongoose.Types.ObjectId(String(roomId)) } },
    { $group: {
      _id: '$studentId',
      totalPoints: { $sum: '$points' },
      correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } },
      totalAnswered: { $sum: 1 }
    } }
  ])
  return rows
    .map((r) => ({
      studentId: r._id.toString(),
      totalPoints: r.totalPoints,
      correctCount: r.correctCount,
      totalAnswered: r.totalAnswered
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints || (a.studentId < b.studentId ? -1 : 1))
}

const strip = (full) =>
  full.map(({ studentId, totalPoints, correctCount, totalAnswered }) => ({
    studentId, totalPoints, correctCount, totalAnswered
  }))

// Assert the incremental board equals a fresh full re-aggregation of the same data.
async function expectMatchesReference(roomId) {
  const { full } = await computeRanked(roomId)
  expect(strip(full)).toEqual(await referenceBoard(roomId))
  expect(full.map((e) => e.rank)).toEqual(full.map((_, i) => i + 1))
  return full
}

// Records which questions computeRanked actually scans, by reading the $in list off each aggregate
// pipeline. This is what "incremental" means concretely: the scanned set must stay small while the
// room's history grows. `drain()` returns (and clears) the questions scanned since the last call.
function traceScans() {
  const original = Response.aggregate.bind(Response)
  let seen = []
  Response.aggregate = (pipeline, ...rest) => {
    const inList = pipeline?.[0]?.$match?.questionId?.$in
    if (inList) seen.push(...inList.map(String))
    return original(pipeline, ...rest)
  }
  return {
    drain: () => { const s = seen.sort(); seen = []; return s },
    restore: () => { Response.aggregate = original }
  }
}

let students = []

// A question is "closed" (final) once closeAt has passed — that is what setLiveQuestion stamps on
// the outgoing poll, and what POST /responses enforces.
async function makeQuestion(roomId, { closeAt = null } = {}) {
  const q = await Question.create({
    roomId,
    type: 'MCQ',
    question: 'Q?',
    options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }],
    closeAt
  })
  return q._id
}

async function answer(roomId, questionId, studentId, { points, isCorrect }) {
  await Response.create({ roomId, questionId, studentId, selectedOption: 0, isCorrect, points })
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URL, { dbName: 'leaderboard-agg-test' })
  students = await User.insertMany(
    ['Ada', 'Grace', 'Linus'].map((name, i) => ({
      name,
      email: `s${i}@test.dev`,
      password: 'x'.repeat(20),
      role: 'student'
    }))
  )
})

afterAll(async () => {
  await mongoose.disconnect()
})

beforeEach(async () => {
  resetLeaderboardMemo()
  await Promise.all([Response.deleteMany({}), Question.deleteMany({})])
})

describe('computeRanked', () => {
  it('returns an empty board for a room with no answers', async () => {
    const { full, rankByStudent } = await computeRanked(oid())
    expect(full).toEqual([])
    expect(rankByStudent.size).toBe(0)
  })

  it('ranks by total points and resolves names', async () => {
    const roomId = oid()
    const q = await makeQuestion(roomId)
    await answer(roomId, q, students[0]._id, { points: 40, isCorrect: true })
    await answer(roomId, q, students[1]._id, { points: 90, isCorrect: true })
    await answer(roomId, q, students[2]._id, { points: 0, isCorrect: false })

    const full = await expectMatchesReference(roomId)
    expect(full.map((e) => e.studentName)).toEqual(['Grace', 'Ada', 'Linus'])
    expect(full[0]).toMatchObject({ rank: 1, totalPoints: 90, correctCount: 1, totalAnswered: 1 })
    expect(full[2]).toMatchObject({ rank: 3, totalPoints: 0, correctCount: 0, totalAnswered: 1 })
  })

  it('falls back to "Unknown Student" when the user record is missing', async () => {
    const roomId = oid()
    const q = await makeQuestion(roomId)
    await answer(roomId, q, oid(), { points: 10, isCorrect: true })
    const { full } = await computeRanked(roomId)
    expect(full[0].studentName).toBe('Unknown Student')
  })

  it('counts a closed question exactly once no matter how often the board is recomputed', async () => {
    // The regression this whole design could plausibly introduce: folding a finalised question into
    // the running total on every call instead of once.
    const roomId = oid()
    const q = await makeQuestion(roomId, { closeAt: new Date(Date.now() - 1000) })
    await answer(roomId, q, students[0]._id, { points: 70, isCorrect: true })

    for (let i = 0; i < 5; i++) {
      const full = await expectMatchesReference(roomId)
      expect(full[0].totalPoints).toBe(70)
      expect(full[0].totalAnswered).toBe(1)
    }
  })

  it('accumulates across a multi-question session as questions close', async () => {
    const roomId = oid()
    const past = () => new Date(Date.now() - 1000)

    // Q1 closes, board taken; Q2 closes, board taken; ... exactly the live sequence.
    const q1 = await makeQuestion(roomId, { closeAt: past() })
    await answer(roomId, q1, students[0]._id, { points: 100, isCorrect: true })
    await answer(roomId, q1, students[1]._id, { points: 50, isCorrect: true })
    await expectMatchesReference(roomId)

    const q2 = await makeQuestion(roomId, { closeAt: past() })
    await answer(roomId, q2, students[0]._id, { points: 0, isCorrect: false })
    await answer(roomId, q2, students[1]._id, { points: 80, isCorrect: true })
    await answer(roomId, q2, students[2]._id, { points: 60, isCorrect: true })
    const full = await expectMatchesReference(roomId)

    expect(full).toMatchObject([
      { studentName: 'Grace', totalPoints: 130, correctCount: 2, totalAnswered: 2 },
      { studentName: 'Ada', totalPoints: 100, correctCount: 1, totalAnswered: 2 },
      { studentName: 'Linus', totalPoints: 60, correctCount: 1, totalAnswered: 1 }
    ])
  })

  it('keeps picking up new answers to the still-live question (never memoised)', async () => {
    const roomId = oid()
    const live = await makeQuestion(roomId) // closeAt null => live, never final
    await answer(roomId, live, students[0]._id, { points: 30, isCorrect: true })
    expect((await expectMatchesReference(roomId))[0].totalPoints).toBe(30)

    await answer(roomId, live, students[1]._id, { points: 90, isCorrect: true })
    const full = await expectMatchesReference(roomId)
    expect(full.map((e) => e.studentName)).toEqual(['Grace', 'Ada'])
  })

  it('picks up a late answer that lands inside the grace window', async () => {
    // Superseded but still open: closeAt is in the FUTURE, so POST /responses still accepts answers
    // and the question must NOT be treated as final yet.
    const roomId = oid()
    const q = await makeQuestion(roomId, { closeAt: new Date(Date.now() + 60000) })
    await answer(roomId, q, students[0]._id, { points: 20, isCorrect: true })
    await expectMatchesReference(roomId)

    await answer(roomId, q, students[1]._id, { points: 25, isCorrect: true })
    const full = await expectMatchesReference(roomId)
    expect(full.map((e) => e.totalPoints)).toEqual([25, 20])
  })

  it('scans only the unfinalised questions once the history is closed', async () => {
    const roomId = oid()
    const closed = []
    for (let i = 0; i < 6; i++) {
      const q = await makeQuestion(roomId, { closeAt: new Date(Date.now() - 1000) })
      await answer(roomId, q, students[0]._id, { points: 10, isCorrect: true })
      closed.push(String(q))
    }
    const live = await makeQuestion(roomId)
    await answer(roomId, live, students[0]._id, { points: 5, isCorrect: true })

    const t = traceScans()
    try {
      await computeRanked(roomId)                       // cold: must scan all 7
      expect(t.drain()).toHaveLength(7)

      await computeRanked(roomId)                       // warm: only the live one remains
      expect(t.drain()).toEqual([String(live)])

      // History keeps growing; the scanned set does not.
      const q8 = await makeQuestion(roomId, { closeAt: new Date(Date.now() - 1000) })
      await answer(roomId, q8, students[0]._id, { points: 7, isCorrect: true })
      await computeRanked(roomId)
      expect(t.drain()).toEqual([String(live), String(q8)].sort())
      await computeRanked(roomId)
      expect(t.drain()).toEqual([String(live)])
    } finally {
      t.restore()
    }

    const full = await expectMatchesReference(roomId)
    expect(full[0].totalPoints).toBe(6 * 10 + 5 + 7)
  })

  it('produces the same board with a cold memo as with a warm one', async () => {
    const roomId = oid()
    const q1 = await makeQuestion(roomId, { closeAt: new Date(Date.now() - 1000) })
    await answer(roomId, q1, students[0]._id, { points: 100, isCorrect: true })
    await answer(roomId, q1, students[1]._id, { points: 20, isCorrect: false })
    await computeRanked(roomId)
    const q2 = await makeQuestion(roomId)
    await answer(roomId, q2, students[2]._id, { points: 55, isCorrect: true })

    const warm = strip((await computeRanked(roomId)).full)
    resetLeaderboardMemo()
    const cold = strip((await computeRanked(roomId)).full)
    expect(warm).toEqual(cold)
  })

  it('does not double-count when two boards are computed concurrently', async () => {
    const roomId = oid()
    const q = await makeQuestion(roomId, { closeAt: new Date(Date.now() - 1000) })
    await answer(roomId, q, students[0]._id, { points: 42, isCorrect: true })

    const [a, b] = await Promise.all([computeRanked(roomId), computeRanked(roomId)])
    expect(a.full[0].totalPoints).toBe(42)
    expect(b.full[0].totalPoints).toBe(42)
    await expectMatchesReference(roomId) // and the state left behind is still correct
  })

  it('rebuilds rather than serving stale totals when finalised answers are deleted', async () => {
    const roomId = oid()
    const q1 = await makeQuestion(roomId, { closeAt: new Date(Date.now() - 1000) })
    const q2 = await makeQuestion(roomId, { closeAt: new Date(Date.now() - 1000) })
    await answer(roomId, q1, students[0]._id, { points: 100, isCorrect: true })
    await answer(roomId, q2, students[0]._id, { points: 30, isCorrect: true })
    expect((await computeRanked(roomId)).full[0].totalPoints).toBe(130)

    await Response.deleteMany({ questionId: q1 })
    const full = await expectMatchesReference(roomId)
    expect(full[0].totalPoints).toBe(30)
  })

  it('orders tied students identically on every recompute', async () => {
    const roomId = oid()
    const q = await makeQuestion(roomId, { closeAt: new Date(Date.now() - 1000) })
    for (const s of students) await answer(roomId, q, s._id, { points: 50, isCorrect: true })

    const first = (await computeRanked(roomId)).full.map((e) => e.studentId)
    resetLeaderboardMemo()
    const second = (await computeRanked(roomId)).full.map((e) => e.studentId)
    expect(second).toEqual(first)
  })

  it('keeps rankByStudent in step with the ranked array', async () => {
    const roomId = oid()
    const q = await makeQuestion(roomId, { closeAt: new Date(Date.now() - 1000) })
    await answer(roomId, q, students[0]._id, { points: 10, isCorrect: true })
    await answer(roomId, q, students[1]._id, { points: 80, isCorrect: true })

    const { full, rankByStudent } = await computeRanked(roomId)
    expect(rankByStudent.size).toBe(full.length)
    for (const e of full) expect(rankByStudent.get(e.studentId)).toBe(e.rank)
  })

  it('keeps rooms independent', async () => {
    const roomA = oid()
    const roomB = oid()
    const qa = await makeQuestion(roomA, { closeAt: new Date(Date.now() - 1000) })
    const qb = await makeQuestion(roomB, { closeAt: new Date(Date.now() - 1000) })
    await answer(roomA, qa, students[0]._id, { points: 11, isCorrect: true })
    await answer(roomB, qb, students[0]._id, { points: 22, isCorrect: true })

    expect((await computeRanked(roomA)).full[0].totalPoints).toBe(11)
    expect((await computeRanked(roomB)).full[0].totalPoints).toBe(22)
    expect((await computeRanked(roomA)).full[0].totalPoints).toBe(11)
  })

  it('still counts answers whose question document has been deleted', async () => {
    // The universe of questions comes from the responses themselves, not the question collection,
    // so an orphaned response is included exactly as it was before this was incremental.
    const roomId = oid()
    const q = await makeQuestion(roomId, { closeAt: new Date(Date.now() - 1000) })
    await answer(roomId, q, students[0]._id, { points: 15, isCorrect: true })
    await Question.deleteOne({ _id: q })

    const full = await expectMatchesReference(roomId)
    expect(full[0].totalPoints).toBe(15)
  })
})
