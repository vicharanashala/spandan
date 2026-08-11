// Dedupe test for riskScoreService.applyEvent.
//
// Verifies that for a given (studentId, roomId, questionId) tuple, only the
// FIRST event mutates the score. Subsequent events (correct, wrong, or skip)
// for the same question must be a no-op and must NOT add another history
// entry.
//
// The test runs against the in-memory MongoDB provided by @shelf/jest-mongodb
// (see jest.config.cjs). It bypasses the socket layer entirely and only
// exercises applyEvent + RiskScore, which is exactly the surface where the
// "score decrements on every poll" bug lived.

import mongoose from 'mongoose'
import RiskScore from '../models/RiskScore.js'
import { applyEvent } from '../services/riskScoreService.js'

const STUDENT = new mongoose.Types.ObjectId()
const ROOM = new mongoose.Types.ObjectId()
const Q1 = new mongoose.Types.ObjectId()
const Q2 = new mongoose.Types.ObjectId()

beforeEach(async () => {
  // Each test starts from a clean collection. Avoids cross-test bleed.
  await RiskScore.deleteMany({})
})

afterAll(async () => {
  await RiskScore.deleteMany({})
})

describe('applyEvent — dedupe by questionId', () => {
  test('first event is applied; second event for the same question is a no-op', async () => {
    const first = await applyEvent(STUDENT, ROOM, {
      type: 'correct',
      questionId: Q1.toString(),
      responseTimeMs: 1000,
      timeToAnswerMs: 30000
    })
    expect(first.update.deduped).toBeFalsy()
    expect(first.update.scoreDelta).not.toBe(0)

    const second = await applyEvent(STUDENT, ROOM, {
      type: 'skip',
      questionId: Q1.toString()
    })
    // The skip must be ignored because Q1 was already recorded as 'correct'.
    expect(second.update.deduped).toBe(true)
    expect(second.update.scoreDelta).toBe(0)
    expect(second.update.newScore).toBe(first.update.newScore)

    const stored = await RiskScore.findOne({ studentId: STUDENT, roomId: ROOM })
    // Exactly one history entry for the same question.
    const historyForQ1 = stored.history.filter(
      (h) => h.questionId?.toString() === Q1.toString()
    )
    expect(historyForQ1).toHaveLength(1)
    expect(historyForQ1[0].answeredCorrectly).toBe(true)
    expect(historyForQ1[0].skipped).toBe(false)
  })

  test('order matters: correct wins over a later wrong for the same question', async () => {
    await applyEvent(STUDENT, ROOM, {
      type: 'correct',
      questionId: Q1.toString(),
      responseTimeMs: 500
    })
    const replayed = await applyEvent(STUDENT, ROOM, {
      type: 'wrong',
      questionId: Q1.toString()
    })
    expect(replayed.update.deduped).toBe(true)
    // The history should still show correct, not wrong.
    const stored = await RiskScore.findOne({ studentId: STUDENT, roomId: ROOM })
    const entry = stored.history.find(
      (h) => h.questionId?.toString() === Q1.toString()
    )
    expect(entry.answeredCorrectly).toBe(true)
  })

  test('different questions are still independent', async () => {
    const a = await applyEvent(STUDENT, ROOM, {
      type: 'correct',
      questionId: Q1.toString(),
      responseTimeMs: 500
    })
    const b = await applyEvent(STUDENT, ROOM, {
      type: 'wrong',
      questionId: Q2.toString(),
      responseTimeMs: 15000
    })
    expect(a.update.deduped).toBeFalsy()
    expect(b.update.deduped).toBeFalsy()
    // b's score should be lower than a's because it was a wrong answer.
    expect(b.update.newScore).toBeLessThan(a.update.newScore)

    const stored = await RiskScore.findOne({ studentId: STUDENT, roomId: ROOM })
    expect(stored.history).toHaveLength(2)
  })

  test('events without a questionId are NOT deduped (defensive — flows through)', async () => {
    const a = await applyEvent(STUDENT, ROOM, { type: 'correct' })
    const b = await applyEvent(STUDENT, ROOM, { type: 'correct' })
    expect(a.update.deduped).toBeFalsy()
    expect(b.update.deduped).toBeFalsy()
    // Each one must mutate the score (or be the boundary case where the
    // student is already at 100 and stays there; either way, the first
    // event does not short-circuit the second).
    const stored = await RiskScore.findOne({ studentId: STUDENT, roomId: ROOM })
    expect(stored.history.length).toBeGreaterThanOrEqual(1)
  })

  test('simulated race: response:submit then question:end for the same question', async () => {
    // This is the exact race that produced the "decrements on every poll"
    // bug: the student answers in the last second, then the timer/teacher
    // end-question fires a skip. Without dedupe, the student would absorb
    // both deltas in a single question.
    const submit = await applyEvent(STUDENT, ROOM, {
      type: 'correct',
      questionId: Q1.toString(),
      responseTimeMs: 28000,
      timeToAnswerMs: 30000
    })
    const end = await applyEvent(STUDENT, ROOM, {
      type: 'skip',
      questionId: Q1.toString()
    })
    expect(submit.update.deduped).toBeFalsy()
    expect(end.update.deduped).toBe(true)
    expect(end.update.newScore).toBe(submit.update.newScore)

    const stored = await RiskScore.findOne({ studentId: STUDENT, roomId: ROOM })
    const q1 = stored.history.filter(
      (h) => h.questionId?.toString() === Q1.toString()
    )
    expect(q1).toHaveLength(1)
    // The single entry reflects the original correct answer, NOT a skip.
    expect(q1[0].answeredCorrectly).toBe(true)
    expect(q1[0].skipped).toBe(false)
  })
})
