// Unit tests for the pure Item Health calculation layer. All fixtures are plain objects/arrays —
// no DB — matching how questionService.test.js exercises the other pure helpers in this codebase.
import {
  computeCorrectRate,
  computeDistractorEfficiency,
  computeCorrectedDiscrimination,
  computeItemHealthStatus,
  computeItemHealth,
  ITEM_HEALTH_STATUS,
  MIN_RESPONSES_FOR_RATE,
  MIN_STUDENTS_FOR_DISCRIMINATION,
  MIN_OTHER_QUESTIONS_FOR_DISCRIMINATION
} from '../services/itemHealthService.js'

describe('computeCorrectRate', () => {
  it('computes the fraction correct', () => {
    const responses = [{ isCorrect: true }, { isCorrect: true }, { isCorrect: false }, { isCorrect: false }]
    expect(computeCorrectRate(responses)).toEqual({ rate: 0.5, correctCount: 2, totalResponses: 4 })
  })

  it('returns rate 1 when everyone is correct and 0 when everyone is wrong', () => {
    expect(computeCorrectRate([{ isCorrect: true }, { isCorrect: true }]).rate).toBe(1)
    expect(computeCorrectRate([{ isCorrect: false }, { isCorrect: false }]).rate).toBe(0)
  })

  it('returns null rate for zero responses instead of dividing by zero', () => {
    expect(computeCorrectRate([])).toEqual({ rate: null, correctCount: 0, totalResponses: 0 })
    expect(computeCorrectRate(undefined)).toEqual({ rate: null, correctCount: 0, totalResponses: 0 })
  })
})

describe('computeDistractorEfficiency', () => {
  const mcq = {
    type: 'MCQ',
    options: [
      { text: 'Correct', isCorrect: true },
      { text: 'Dead distractor', isCorrect: false },
      { text: 'Popular distractor', isCorrect: false },
      { text: 'Rare distractor', isCorrect: false }
    ]
  }

  it('flags a distractor nobody picked as dead, and computes efficiency for the rest', () => {
    const responses = [
      { selectedOption: 0 }, { selectedOption: 0 }, { selectedOption: 0 }, { selectedOption: 0 }, { selectedOption: 0 }, // 5x correct
      { selectedOption: 2 }, { selectedOption: 2 }, { selectedOption: 2 }, { selectedOption: 2 }, // 4x popular distractor
      { selectedOption: 3 } // 1x rare distractor
      // option 1 ("Dead distractor") never picked
    ]
    const result = computeDistractorEfficiency(mcq, responses)
    expect(result.applicable).toBe(true)
    expect(result.totalDistractors).toBe(3)
    expect(result.deadCount).toBe(1)

    const byIndex = Object.fromEntries(result.distractors.map(d => [d.index, d]))
    expect(byIndex[1].timesSelected).toBe(0)
    expect(byIndex[2].timesSelected).toBe(4)
    expect(byIndex[2].efficiency).toBeCloseTo(0.4)
    expect(byIndex[3].timesSelected).toBe(1)
    expect(byIndex[3].efficiency).toBeCloseTo(0.1)
  })

  it('reports zero dead distractors when every option is picked at least once', () => {
    const responses = [{ selectedOption: 0 }, { selectedOption: 1 }, { selectedOption: 2 }, { selectedOption: 3 }]
    const result = computeDistractorEfficiency(mcq, responses)
    expect(result.deadCount).toBe(0)
  })

  it('is not applicable to True/False questions (only one distractor exists)', () => {
    const tf = { type: 'TF', options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }] }
    const result = computeDistractorEfficiency(tf, [{ selectedOption: 0 }, { selectedOption: 1 }])
    expect(result.applicable).toBe(false)
    expect(result.distractors).toEqual([])
    expect(result.deadCount).toBe(0)
  })

  it('is not applicable to MSQ questions (multi-select changes what "distractor" means)', () => {
    const msq = {
      type: 'MSQ',
      options: [
        { text: 'A', isCorrect: true }, { text: 'B', isCorrect: false },
        { text: 'C', isCorrect: true }, { text: 'D', isCorrect: false }
      ]
    }
    const result = computeDistractorEfficiency(msq, [{ selectedOption: 0 }])
    expect(result.applicable).toBe(false)
  })

  it('handles zero responses without dividing by zero', () => {
    const result = computeDistractorEfficiency(mcq, [])
    expect(result.applicable).toBe(true)
    expect(result.distractors.every(d => d.efficiency === null)).toBe(true)
    expect(result.deadCount).toBe(3) // nobody answered => every distractor reads as dead
  })
})

describe('computeCorrectedDiscrimination', () => {
  const OTHER_QIDS = Array.from({ length: 10 }, (_, i) => `other_q${i}`)
  const TARGET_QID = 'target_q'

  // Builds `n` students with ability level L = 0..n-1. Each student gets their first L of the 10
  // OTHER_QIDS correct (so restScore = L/10), and answers the target question according to
  // `itemScoreForAbility(L)`.
  function buildStudents(n, itemScoreForAbility) {
    return Array.from({ length: n }, (_, L) => {
      const answers = new Map()
      OTHER_QIDS.forEach((qid, i) => answers.set(qid, i < L))
      answers.set(TARGET_QID, itemScoreForAbility(L) === 1)
      return { studentId: `s${L}`, answers }
    })
  }

  it('is strongly positive when higher-ability students are more likely correct', () => {
    const students = buildStudents(11, (L) => (L >= 6 ? 1 : 0)) // top ~45% get it right
    const { discrimination, n, insufficientData } = computeCorrectedDiscrimination(students, TARGET_QID)
    expect(insufficientData).toBe(false)
    expect(n).toBe(11)
    expect(discrimination).toBeGreaterThan(0.5)
  })

  it('is negative when lower-ability students are more likely correct (miskey signal)', () => {
    const students = buildStudents(11, (L) => (L <= 4 ? 1 : 0)) // bottom ~45% get it right
    const { discrimination } = computeCorrectedDiscrimination(students, TARGET_QID)
    expect(discrimination).toBeLessThan(0)
  })

  it('returns null when the item has zero variance (everyone correct or everyone wrong)', () => {
    const allCorrect = buildStudents(11, () => 1)
    const allWrong = buildStudents(11, () => 0)
    expect(computeCorrectedDiscrimination(allCorrect, TARGET_QID).discrimination).toBeNull()
    expect(computeCorrectedDiscrimination(allWrong, TARGET_QID).discrimination).toBeNull()
  })

  it('flags insufficient data when fewer than MIN_STUDENTS_FOR_DISCRIMINATION qualify', () => {
    const students = buildStudents(MIN_STUDENTS_FOR_DISCRIMINATION - 1, (L) => (L >= 3 ? 1 : 0))
    const result = computeCorrectedDiscrimination(students, TARGET_QID)
    expect(result.insufficientData).toBe(true)
    expect(result.discrimination).toBeNull()
  })

  it('excludes students who answered fewer than MIN_OTHER_QUESTIONS_FOR_DISCRIMINATION other questions', () => {
    const qualified = buildStudents(10, (L) => (L >= 5 ? 1 : 0))
    const underAnswered = Array.from({ length: 5 }, (_, i) => {
      const answers = new Map()
      // Only answers 1 other question — below MIN_OTHER_QUESTIONS_FOR_DISCRIMINATION (3).
      answers.set(OTHER_QIDS[0], true)
      answers.set(TARGET_QID, true)
      return { studentId: `under${i}`, answers }
    })
    expect(MIN_OTHER_QUESTIONS_FOR_DISCRIMINATION).toBeGreaterThan(1)

    const result = computeCorrectedDiscrimination([...qualified, ...underAnswered], TARGET_QID)
    expect(result.n).toBe(10) // the 5 under-answered students are excluded from n
  })

  it('excludes students who never answered the target question', () => {
    const students = buildStudents(10, (L) => (L >= 5 ? 1 : 0))
    const nonResponder = { studentId: 'ghost', answers: new Map(OTHER_QIDS.map(qid => [qid, true])) }
    const result = computeCorrectedDiscrimination([...students, nonResponder], TARGET_QID)
    expect(result.n).toBe(10)
  })

  it('returns insufficient data for an empty room', () => {
    const result = computeCorrectedDiscrimination([], TARGET_QID)
    expect(result).toEqual({ discrimination: null, n: 0, insufficientData: true })
  })
})

describe('computeItemHealthStatus', () => {
  const healthyDistractors = { applicable: true, deadCount: 0, totalDistractors: 3 }

  it('is Insufficient Data below the minimum response count, regardless of other signals', () => {
    const status = computeItemHealthStatus({
      totalResponses: MIN_RESPONSES_FOR_RATE - 1,
      correctRate: 0.01, // would otherwise be Review Recommended
      distractorEfficiency: { applicable: true, deadCount: 3, totalDistractors: 3 },
      discrimination: -0.9
    })
    expect(status).toBe(ITEM_HEALTH_STATUS.INSUFFICIENT_DATA)
  })

  it('is Healthy when every available signal is in range', () => {
    const status = computeItemHealthStatus({
      totalResponses: 20,
      correctRate: 0.6,
      distractorEfficiency: healthyDistractors,
      discrimination: 0.35
    })
    expect(status).toBe(ITEM_HEALTH_STATUS.HEALTHY)
  })

  it('is Healthy when discrimination is unavailable but the other signals are fine (missing signal is not penalized)', () => {
    const status = computeItemHealthStatus({
      totalResponses: 20,
      correctRate: 0.6,
      distractorEfficiency: healthyDistractors,
      discrimination: null
    })
    expect(status).toBe(ITEM_HEALTH_STATUS.HEALTHY)
  })

  it('is Needs Attention for marginal discrimination [0, 0.20)', () => {
    const status = computeItemHealthStatus({
      totalResponses: 20, correctRate: 0.6, distractorEfficiency: healthyDistractors, discrimination: 0.1
    })
    expect(status).toBe(ITEM_HEALTH_STATUS.NEEDS_ATTENTION)
  })

  it('is Review Recommended for negative discrimination', () => {
    const status = computeItemHealthStatus({
      totalResponses: 20, correctRate: 0.6, distractorEfficiency: healthyDistractors, discrimination: -0.05
    })
    expect(status).toBe(ITEM_HEALTH_STATUS.REVIEW_RECOMMENDED)
  })

  it('is Needs Attention for exactly one dead distractor', () => {
    const status = computeItemHealthStatus({
      totalResponses: 20, correctRate: 0.6,
      distractorEfficiency: { applicable: true, deadCount: 1, totalDistractors: 3 },
      discrimination: 0.4
    })
    expect(status).toBe(ITEM_HEALTH_STATUS.NEEDS_ATTENTION)
  })

  it('is Review Recommended for two or more dead distractors', () => {
    const status = computeItemHealthStatus({
      totalResponses: 20, correctRate: 0.6,
      distractorEfficiency: { applicable: true, deadCount: 2, totalDistractors: 3 },
      discrimination: 0.4
    })
    expect(status).toBe(ITEM_HEALTH_STATUS.REVIEW_RECOMMENDED)
  })

  it('is Review Recommended for an extreme correct rate (too easy or too hard)', () => {
    expect(computeItemHealthStatus({
      totalResponses: 20, correctRate: 0.98, distractorEfficiency: healthyDistractors, discrimination: 0.4
    })).toBe(ITEM_HEALTH_STATUS.REVIEW_RECOMMENDED)

    expect(computeItemHealthStatus({
      totalResponses: 20, correctRate: 0.05, distractorEfficiency: healthyDistractors, discrimination: 0.4
    })).toBe(ITEM_HEALTH_STATUS.REVIEW_RECOMMENDED)
  })

  it('is Needs Attention for a correct rate outside the healthy band but not extreme', () => {
    expect(computeItemHealthStatus({
      totalResponses: 20, correctRate: 0.90, distractorEfficiency: healthyDistractors, discrimination: 0.4
    })).toBe(ITEM_HEALTH_STATUS.NEEDS_ATTENTION)

    expect(computeItemHealthStatus({
      totalResponses: 20, correctRate: 0.20, distractorEfficiency: healthyDistractors, discrimination: 0.4
    })).toBe(ITEM_HEALTH_STATUS.NEEDS_ATTENTION)
  })

  it('escalates to Review Recommended when any single reason is review-level, even if others are fine', () => {
    const status = computeItemHealthStatus({
      totalResponses: 20,
      correctRate: 0.6, // fine
      distractorEfficiency: { applicable: true, deadCount: 1, totalDistractors: 3 }, // attention-level
      discrimination: -0.1 // review-level
    })
    expect(status).toBe(ITEM_HEALTH_STATUS.REVIEW_RECOMMENDED)
  })

  it('is Healthy for a TF-like question where distractor efficiency is not applicable', () => {
    const status = computeItemHealthStatus({
      totalResponses: 20,
      correctRate: 0.55,
      distractorEfficiency: { applicable: false, deadCount: 0, totalDistractors: 0 },
      discrimination: 0.3
    })
    expect(status).toBe(ITEM_HEALTH_STATUS.HEALTHY)
  })
})

describe('computeItemHealth (orchestrator)', () => {
  it('combines rate, distractor efficiency, and discrimination into one report', () => {
    const question = {
      _id: 'q1',
      type: 'MCQ',
      options: [
        { text: 'Correct', isCorrect: true },
        { text: 'Dead', isCorrect: false },
        { text: 'Live', isCorrect: false },
        { text: 'Live2', isCorrect: false }
      ]
    }

    const questionResponses = Array.from({ length: 20 }, (_, i) => ({
      isCorrect: i < 12,
      selectedOption: i < 12 ? 0 : (i % 2 === 0 ? 2 : 3)
    }))

    const otherQids = Array.from({ length: 5 }, (_, i) => `o${i}`)
    const studentAnswers = Array.from({ length: 20 }, (_, i) => {
      const answers = new Map()
      otherQids.forEach((qid, j) => answers.set(qid, (i + j) % 3 !== 0))
      answers.set('q1', i < 12)
      return { studentId: `s${i}`, answers }
    })

    const report = computeItemHealth(question, questionResponses, studentAnswers)

    expect(report.questionId).toBe('q1')
    expect(report.totalResponses).toBe(20)
    expect(report.correctCount).toBe(12)
    expect(report.correctRate).toBeCloseTo(0.6)
    expect(report.distractorEfficiency.applicable).toBe(true)
    expect(report.distractorEfficiency.deadCount).toBe(1) // option index 1 ("Dead") never selected
    expect(typeof report.discrimination === 'number' || report.discrimination === null).toBe(true)
    expect(Object.values(ITEM_HEALTH_STATUS)).toContain(report.status)
  })

  it('falls back to Insufficient Data end-to-end when there are too few responses', () => {
    const question = { _id: 'q2', type: 'TF', options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }] }
    const questionResponses = [{ isCorrect: true, selectedOption: 0 }, { isCorrect: false, selectedOption: 1 }]
    const report = computeItemHealth(question, questionResponses, [])
    expect(report.status).toBe(ITEM_HEALTH_STATUS.INSUFFICIENT_DATA)
  })
})
