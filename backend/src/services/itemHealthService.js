// Item Health Engine — pure, DB-free scoring layer.
//
// Every function here takes plain data (already-fetched Question/Response shapes) and returns a
// plain result. No Mongo, no Redis, no I/O — callers (the resultsSnapshot integration, later) are
// responsible for assembling the per-question response lists and the per-student answer matrix
// from the existing single-pass room scan, the same way buildSnapshot() already does for
// questionStats/leaderboard. Keeping this layer pure makes it unit-testable with plain fixtures
// and reusable from both the snapshot builder and any future live/on-demand path.
//
// Scope: everything is computed PER ROOM (session). Spandan generates questions dynamically from
// short lecture segments and never reuses them across sessions, so "item-total" has no meaningful
// cross-session pool — the only valid "total" is the other questions answered in the SAME room.

// ─── Minimum-data thresholds (tunable) ──────────────────────────────────────────────────────────
// Below these, a metric is not statistically meaningful and is reported as unavailable rather than
// computed on noise. Two independent gates: one for rate/distractor metrics (need enough answers
// to this question), one for discrimination (needs enough students who ALSO answered other
// questions in the room, since it correlates against a same-session rest-score).
export const MIN_RESPONSES_FOR_RATE = 10
export const MIN_STUDENTS_FOR_DISCRIMINATION = 10
export const MIN_OTHER_QUESTIONS_FOR_DISCRIMINATION = 3

// Distractor is "dead" if literally nobody picked it. Once a question has enough responses to be
// meaningful at all (MIN_RESPONSES_FOR_RATE), a functioning-but-rare distractor is still flagged
// via efficiency, but "dead" strictly means zero picks — no judgment call about what counts as rare.
const DEAD_DISTRACTOR_THRESHOLD = 0

// Status thresholds — classical-test-theory-style conventions (discrimination ≥0.30 "good",
// ≥0.20 "acceptable", <0.10 "poor"), applied as a simple most-severe-wins rollup.
const DISCRIMINATION_REVIEW_MAX = 0        // < 0            -> Review Recommended (possible miskey)
const DISCRIMINATION_ATTENTION_MAX = 0.20  // [0, 0.20)      -> Needs Attention
// >= 0.20                                                   -> Healthy (for this signal)

const CORRECT_RATE_REVIEW_LOW = 0.10       // <=10% or >=97% -> Review Recommended (likely broken/miskeyed)
const CORRECT_RATE_REVIEW_HIGH = 0.97
const CORRECT_RATE_HEALTHY_LOW = 0.30      // outside [30%,85%] (but inside the Review bounds) -> Needs Attention
const CORRECT_RATE_HEALTHY_HIGH = 0.85

export const ITEM_HEALTH_STATUS = Object.freeze({
  HEALTHY: 'Healthy',
  NEEDS_ATTENTION: 'Needs Attention',
  REVIEW_RECOMMENDED: 'Review Recommended',
  INSUFFICIENT_DATA: 'Insufficient Data'
})

// ─── 1. Correct answer rate ─────────────────────────────────────────────────────────────────────
// responses: array of { isCorrect } (or anything with a boolean isCorrect field) for ONE question.
// Returns { rate, correctCount, totalResponses } or { rate: null, ... } when there's not enough
// data to be meaningful (rate is still computed and returned for transparency; callers that want
// the gated version should check `insufficientData`/totalResponses against MIN_RESPONSES_FOR_RATE
// themselves, same as the status classifier below does).
export function computeCorrectRate(responses) {
  const totalResponses = Array.isArray(responses) ? responses.length : 0
  if (totalResponses === 0) {
    return { rate: null, correctCount: 0, totalResponses: 0 }
  }
  const correctCount = responses.reduce((sum, r) => sum + (r.isCorrect ? 1 : 0), 0)
  return { rate: correctCount / totalResponses, correctCount, totalResponses }
}

// ─── 2. Distractor efficiency / dead-distractor detection ──────────────────────────────────────
// question: { options: [{ text, isCorrect }] } — the option list defines index -> correctness.
// responses: array of { selectedOption } for ONE question (single-index; matches how MCQ/TF/MSQ-
// first-pick is stored on Response). MSQ's multi-select semantics are intentionally out of scope
// for distractor efficiency (a distractor here means "an incorrect single option nobody picks",
// which is the MCQ/TF classical-test-theory notion); MSQ questions still get a correct rate and
// (if eligible) a discrimination score, just no distractor breakdown.
//
// Returns:
//   { applicable, distractors: [{ index, text, timesSelected, efficiency }], deadCount, totalDistractors }
// applicable is false for TF (only one distractor exists, the metric isn't meaningful) and for MSQ
// (multi-select) — callers should not penalize a question for an inapplicable metric.
export function computeDistractorEfficiency(question, responses) {
  const options = question?.options || []
  const totalResponses = Array.isArray(responses) ? responses.length : 0

  const applicable = question?.type === 'MCQ' && options.length > 2

  if (!applicable) {
    return { applicable: false, distractors: [], deadCount: 0, totalDistractors: 0 }
  }

  const countsByIndex = new Map()
  for (const r of responses || []) {
    const idx = r.selectedOption
    if (idx === undefined || idx === null) continue
    countsByIndex.set(idx, (countsByIndex.get(idx) || 0) + 1)
  }

  const distractors = options
    .map((opt, index) => ({ opt, index }))
    .filter(({ opt }) => !opt.isCorrect)
    .map(({ opt, index }) => {
      const timesSelected = countsByIndex.get(index) || 0
      return {
        index,
        text: opt.text,
        timesSelected,
        efficiency: totalResponses > 0 ? timesSelected / totalResponses : null
      }
    })

  const deadCount = distractors.filter(d => d.timesSelected <= DEAD_DISTRACTOR_THRESHOLD).length

  return { applicable: true, distractors, deadCount, totalDistractors: distractors.length }
}

// ─── 3. Corrected item-total discrimination ─────────────────────────────────────────────────────
// Point-biserial-style correlation between a question's item score (0/1 per student) and each
// student's REST score — their correctness on the OTHER questions they answered in the same room.
// "Corrected" = the item itself is excluded from its own total, so a question can't trivially
// correlate with itself.
//
// studentAnswers: array of per-student records for this room:
//   { studentId, answers: Map<questionId, boolean> }   // boolean = isCorrect for that question
// questionId: the question being scored.
//
// Only students who (a) answered this question AND (b) answered at least
// MIN_OTHER_QUESTIONS_FOR_DISCRIMINATION other questions in the room are included — a rest-score
// built from 0-1 other questions is not a meaningful "total". Returns
// { discrimination: number|null, n, insufficientData }.
export function computeCorrectedDiscrimination(studentAnswers, questionId) {
  const itemScores = []
  const restScores = []

  for (const student of studentAnswers || []) {
    const answers = student?.answers
    if (!answers || !answers.has(questionId)) continue

    const otherEntries = [...answers.entries()].filter(([qid]) => qid !== questionId)
    if (otherEntries.length < MIN_OTHER_QUESTIONS_FOR_DISCRIMINATION) continue

    const itemScore = answers.get(questionId) ? 1 : 0
    const restScore = otherEntries.reduce((sum, [, correct]) => sum + (correct ? 1 : 0), 0) / otherEntries.length

    itemScores.push(itemScore)
    restScores.push(restScore)
  }

  const n = itemScores.length
  if (n < MIN_STUDENTS_FOR_DISCRIMINATION) {
    return { discrimination: null, n, insufficientData: true }
  }

  const discrimination = pearsonCorrelation(itemScores, restScores)
  return { discrimination, n, insufficientData: false }
}

// Standard Pearson correlation coefficient. Returns null when undefined (zero variance in either
// vector — e.g. every student got the item right, or every student has an identical rest score).
function pearsonCorrelation(xs, ys) {
  const n = xs.length
  if (n === 0 || n !== ys.length) return null

  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n

  let cov = 0
  let varX = 0
  let varY = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    cov += dx * dy
    varX += dx * dx
    varY += dy * dy
  }

  if (varX === 0 || varY === 0) return null

  return cov / Math.sqrt(varX * varY)
}

// ─── 4. Item Health status classification ───────────────────────────────────────────────────────
// Combines the three signals into one status via most-severe-wins. Any signal that is unavailable
// (null) is simply skipped rather than penalized — an early-session question with too few
// co-answered questions for discrimination can still be "Healthy" on rate + distractors alone.
//
// metrics: {
//   totalResponses: number,
//   correctRate: number|null,
//   distractorEfficiency: { applicable, deadCount, totalDistractors },
//   discrimination: number|null
// }
export function computeItemHealthStatus(metrics) {
  const { totalResponses = 0, correctRate = null, distractorEfficiency = null, discrimination = null } = metrics || {}

  if (totalResponses < MIN_RESPONSES_FOR_RATE) {
    return ITEM_HEALTH_STATUS.INSUFFICIENT_DATA
  }

  const deadCount = distractorEfficiency?.applicable ? distractorEfficiency.deadCount : 0

  const reviewReasons = []
  const attentionReasons = []

  if (discrimination !== null && discrimination !== undefined) {
    if (discrimination < DISCRIMINATION_REVIEW_MAX) reviewReasons.push('negative discrimination')
    else if (discrimination < DISCRIMINATION_ATTENTION_MAX) attentionReasons.push('low discrimination')
  }

  if (deadCount >= 2) reviewReasons.push('multiple dead distractors')
  else if (deadCount === 1) attentionReasons.push('one dead distractor')

  if (correctRate !== null && correctRate !== undefined) {
    if (correctRate <= CORRECT_RATE_REVIEW_LOW || correctRate >= CORRECT_RATE_REVIEW_HIGH) {
      reviewReasons.push('extreme correct rate')
    } else if (correctRate < CORRECT_RATE_HEALTHY_LOW || correctRate > CORRECT_RATE_HEALTHY_HIGH) {
      attentionReasons.push('correct rate outside healthy band')
    }
  }

  if (reviewReasons.length > 0) return ITEM_HEALTH_STATUS.REVIEW_RECOMMENDED
  if (attentionReasons.length > 0) return ITEM_HEALTH_STATUS.NEEDS_ATTENTION
  return ITEM_HEALTH_STATUS.HEALTHY
}

// ─── Orchestrator ───────────────────────────────────────────────────────────────────────────────
// Ties 1-4 together for one question, given the data a caller (e.g. the resultsSnapshot builder)
// has already assembled from its own room-wide scan. Still pure — no I/O.
//
// question: { _id/questionId, type, options }
// questionResponses: responses for THIS question ({ isCorrect, selectedOption }[])
// studentAnswers: room-wide per-student answer map, see computeCorrectedDiscrimination
export function computeItemHealth(question, questionResponses, studentAnswers) {
  const questionId = question?._id !== undefined ? question._id : question?.questionId

  const { rate: correctRate, correctCount, totalResponses } = computeCorrectRate(questionResponses)
  const distractorEfficiency = computeDistractorEfficiency(question, questionResponses)
  const { discrimination, n: discriminationN, insufficientData: discriminationInsufficient } =
    computeCorrectedDiscrimination(studentAnswers, questionId)

  const status = computeItemHealthStatus({
    totalResponses,
    correctRate,
    distractorEfficiency,
    discrimination
  })

  return {
    questionId,
    totalResponses,
    correctCount,
    correctRate,
    distractorEfficiency,
    discrimination,
    discriminationSampleSize: discriminationN,
    discriminationInsufficientData: discriminationInsufficient,
    status
  }
}
