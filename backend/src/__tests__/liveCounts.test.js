// The live answer-count broadcast (index.js broadcastCounts) no longer re-groups the whole room on
// every tick. It counts ONE question — the one the response it was triggered by belongs to — and the
// teacher's client merges that partial payload into the map it already holds.
//
// That splits a single server-side truth across a server query and a client-side accumulator, so the
// thing worth testing is not "does countDocuments count" but the invariant that keeps the teacher's
// badges correct: replaying the scoped counts the server WOULD emit, through the merge the client
// performs, must always land on the same map the old full-room aggregation produced.

import mongoose from 'mongoose'
import Response from '../models/Response.js'

const oid = () => new mongoose.Types.ObjectId()

// What broadcastCounts() runs, verbatim in shape: an indexed count for a single poll.
async function scopedCount(roomId, questionId) {
  return Response.countDocuments({
    roomId: new mongoose.Types.ObjectId(String(roomId)),
    questionId: new mongoose.Types.ObjectId(String(questionId))
  })
}

// The pre-change implementation: re-group every response in the room.
async function fullCountMap(roomId) {
  const agg = await Response.aggregate([
    { $match: { roomId: new mongoose.Types.ObjectId(String(roomId)) } },
    { $group: { _id: '$questionId', count: { $sum: 1 } } }
  ])
  const out = {}
  agg.forEach((c) => { out[c._id.toString()] = c.count })
  return out
}

// The teacher client's counts:updated handler.
const merge = (prev, partial) => ({ ...prev, ...partial })

async function answer(roomId, questionId, studentId, extra = {}) {
  await Response.create({
    roomId, questionId, studentId, selectedOption: 0, selectedOptions: [0], points: 0, ...extra
  })
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URL, { dbName: 'live-counts-test' })
  await Response.syncIndexes() // the index-usage test below asserts against the real index set
})

afterAll(async () => { await mongoose.disconnect() })

describe('scoped live answer counts', () => {
  beforeEach(async () => { await Response.deleteMany({}) })

  test('counts only the named poll, ignoring the rest of the room', async () => {
    const roomId = oid()
    const [q1, q2, q3] = [oid(), oid(), oid()]
    for (let i = 0; i < 5; i++) await answer(roomId, q1, oid())
    for (let i = 0; i < 3; i++) await answer(roomId, q2, oid())
    for (let i = 0; i < 9; i++) await answer(roomId, q3, oid())

    await expect(scopedCount(roomId, q1)).resolves.toBe(5)
    await expect(scopedCount(roomId, q2)).resolves.toBe(3)
    await expect(scopedCount(roomId, q3)).resolves.toBe(9)
  })

  test('does not leak counts across rooms that share a question id', async () => {
    // Defensive: {roomId, questionId} is the whole filter, so a missing roomId term would show here.
    const [roomA, roomB, q] = [oid(), oid(), oid()]
    for (let i = 0; i < 4; i++) await answer(roomA, q, oid())
    for (let i = 0; i < 7; i++) await answer(roomB, q, oid())

    await expect(scopedCount(roomA, q)).resolves.toBe(4)
    await expect(scopedCount(roomB, q)).resolves.toBe(7)
  })

  test('a poll with no answers yet reports 0 rather than being absent', async () => {
    const roomId = oid()
    await expect(scopedCount(roomId, oid())).resolves.toBe(0)
  })

  test('replaying scoped broadcasts through the client merge reproduces the full aggregation', async () => {
    // Simulates a session: three polls run in sequence, each answered by a different-sized slice of
    // the room, with the broadcast the server would have fired after every single response.
    const roomId = oid()
    const questions = [oid(), oid(), oid()]
    const students = Array.from({ length: 12 }, () => oid())

    let clientMap = {} // what the teacher's page holds

    for (const [qi, questionId] of questions.entries()) {
      const answerers = students.slice(0, 4 + qi * 3)
      for (const studentId of answerers) {
        await answer(roomId, questionId, studentId)
        // Every POST schedules a broadcast for ITS question; throttling only drops duplicates, so
        // firing on each one is the worst case and must still converge.
        clientMap = merge(clientMap, { [String(questionId)]: await scopedCount(roomId, questionId) })
      }
      // After each poll, the teacher's map must already equal a full re-aggregation.
      expect(clientMap).toEqual(await fullCountMap(roomId))
    }
  })

  test('a grace-window straggler updates the closed poll, not the newly live one', async () => {
    // When a new poll launches, the outgoing one stays answerable for POLL_RESPONSE_GRACE_MS. Scoping
    // by "the room's current question" would have credited those late answers to the wrong poll (or
    // dropped them); scoping by the answered question is what makes this come out right.
    const roomId = oid()
    const [closing, live] = [oid(), oid()]
    for (let i = 0; i < 6; i++) await answer(roomId, closing, oid())
    for (let i = 0; i < 2; i++) await answer(roomId, live, oid())

    let clientMap = { [String(closing)]: 6, [String(live)]: 2 }

    // Straggler answers the poll that is already closing, while `live` is the current question.
    await answer(roomId, closing, oid())
    clientMap = merge(clientMap, { [String(closing)]: await scopedCount(roomId, closing) })

    expect(clientMap[String(closing)]).toBe(7)
    expect(clientMap[String(live)]).toBe(2)
    expect(clientMap).toEqual(await fullCountMap(roomId))
  })

  test('the scoped filter is served by an index, not a collection scan', async () => {
    // The whole point of scoping is that {roomId, questionId} is a prefix of the existing unique
    // index, so this stays a count over index keys as the room's response count grows.
    const roomId = oid()
    const q = oid()
    for (let i = 0; i < 20; i++) await answer(roomId, q, oid())

    const plan = await Response.collection
      .find({ roomId, questionId: q })
      .explain('queryPlanner')
    const stages = JSON.stringify(plan.queryPlanner.winningPlan)
    expect(stages).toContain('IXSCAN')
    expect(stages).not.toContain('COLLSCAN')
  })
})
