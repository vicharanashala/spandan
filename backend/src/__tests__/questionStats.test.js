// Per-question stats: MSQ answers are graded by isCorrect (not "first pick is a correct option") and
// every ticked option is counted. The Mongo aggregation (direct path) and the in-memory tally
// (results snapshot) must agree.
import mongoose from 'mongoose'
import { picksOf, PICKS_EXPR, tallyResponse, buildQuestionStats } from '../services/questionStats.js'

const Response = require('../models/Response.js').default

// "Which are prime?" A=2 ✓, B=4, C=5 ✓, D=9 → correct = exactly {A, C}
const msq = { _id: new mongoose.Types.ObjectId(), question: 'Which are prime?', type: 'MSQ', options: [{ text: '2', isCorrect: true }, { text: '4' }, { text: '5', isCorrect: true }, { text: '9' }] }
const mcq = { _id: new mongoose.Types.ObjectId(), question: 'Pick B', type: 'MCQ', options: [{ text: 'A' }, { text: 'B', isCorrect: true }] }
const roomId = new mongoose.Types.ObjectId()
const resp = (q, selectedOptions, isCorrect, extra = {}) => ({ roomId, questionId: q._id, studentId: new mongoose.Types.ObjectId(), selectedOption: selectedOptions[0], selectedOptions, isCorrect, ...extra })
const responses = [
  resp(msq, [0, 2], true),   // Asha: A + C — right
  resp(msq, [0, 1], false),  // Ravi: A + B — wrong, but first pick A is a correct option (old code said correct)
  resp(msq, [1, 2], false),  // Meena: B + C — wrong
  resp(mcq, [1], true),
  resp(mcq, [0], false),
  { roomId, questionId: mcq._id, studentId: new mongoose.Types.ObjectId(), selectedOption: 1, isCorrect: true } // old record: no selectedOptions
]

function tallyInMemory() {
  const tallies = new Map()
  for (const r of responses) tallyResponse(tallies, String(r.questionId), r)
  return buildQuestionStats([msq, mcq], tallies, (q) => String(q._id))
}

describe('questionStats', () => {
  it('picksOf falls back to selectedOption for old records', () => {
    expect(picksOf({ selectedOptions: [0, 2], selectedOption: 0 })).toEqual([0, 2])
    expect(picksOf({ selectedOptions: [], selectedOption: 1 })).toEqual([1])
    expect(picksOf({ selectedOption: 1 })).toEqual([1])
  })

  it('MSQ: correct = graded isCorrect, every ticked option counted', () => {
    const [m, c] = tallyInMemory()
    expect(m.totalResponses).toBe(3)
    expect(m.correctCount).toBe(1)                       // only Asha (old code: 2)
    expect(m.answerCounts).toEqual({ 0: 2, 1: 2, 2: 2, 3: 0 }) // A: Asha+Ravi, B: Ravi+Meena, C: Asha+Meena
    expect(c.totalResponses).toBe(3)
    expect(c.correctCount).toBe(2)
    expect(c.answerCounts).toEqual({ 0: 1, 1: 2 })
  })

  describe('Mongo aggregation (direct /stats/room path)', () => {
    beforeAll(async () => {
      await mongoose.connect(process.env.MONGO_URL, { dbName: 'questionStatsTest' })
      await Response.collection.insertMany(responses) // raw insert keeps the old-record shape (no selectedOptions)
    })
    afterAll(async () => {
      await mongoose.connection.dropDatabase()
      await mongoose.disconnect()
    })

    it('gives the same stats as the in-memory tally', async () => {
      const grouped = await Response.aggregate([
        { $match: { roomId } },
        { $group: { _id: '$questionId', total: { $sum: 1 }, correct: { $sum: { $cond: ['$isCorrect', 1, 0] } }, picks: { $push: PICKS_EXPR } } }
      ])
      const tallies = new Map()
      for (const g of grouped) {
        const opts = new Map()
        for (const picks of g.picks) for (const p of picks) opts.set(p, (opts.get(p) || 0) + 1)
        tallies.set(String(g._id), { total: g.total, correct: g.correct, opts })
      }
      expect(buildQuestionStats([msq, mcq], tallies, (q) => String(q._id))).toEqual(tallyInMemory())
    })
  })
})
