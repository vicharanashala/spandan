// Evaluation criteria registry — the SINGLE source of truth for what a teacher can
// weight in an evaluation profile. Adding / removing a criterion here is reflected
// automatically in the API list and the frontend selector (no UI hardcoding).
//
// Each entry describes:
//   key        — stable identifier, persisted on EvaluationProfile.criteria[].key
//   label      — human-readable name shown to the teacher
//   group      — broad category used for grouping in the UI ('Attendance', 'Quiz')
//   normalize  — how the raw per-student aggregate ($group output) is mapped to [0, 1].
//                Higher = better (the eventual weighted sum treats 1 as best).
//                { kind: 'identity' }                         — raw is already [0, 1]
//                { kind: 'ratio',  num, den }                 — num / den, NaN → 0
//                { kind: 'invertRatio', num, den, maxDen }    — 1 − (num / maxDen), clamped [0, 1]
//
// These descriptors are PURE — they take the per-student aggregate projection and the
// room-wide denominator (sum of question.points etc.) and return the normalized value.
// The room-wide denominators are computed ONCE per apply() in evaluationService.js.
//
// Phase 1 finding (see context/teacher-evaluation-profiles-context.md): the only honest
// attendance signal available is binary join status — "Session Participation". A
// minutes-present metric is NOT offered because RoomMember has no `leftAt` / duration.

export const CRITERIA = Object.freeze([
  {
    key: 'session_participation',
    label: 'Session Participation',
    group: 'Attendance',
    description: 'Did this student join the session? Binary: 1 if joined, 0 if not.',
    normalize: { kind: 'identity' }
  },
  {
    key: 'quiz_accuracy',
    label: 'Quiz Accuracy',
    group: 'Quiz',
    description: 'Share of a student\u2019s responses that were correct. 0 if no responses.',
    normalize: { kind: 'accuracy' } // correct / attempted, guarded in service
  },
  {
    key: 'questions_attempted',
    label: 'Questions Attempted',
    group: 'Quiz',
    description: 'Share of approved questions the student submitted a response for.',
    normalize: { kind: 'ratio', num: 'attempted', den: 'totalQuestions' }
  },
  {
    key: 'correct_responses',
    label: 'Correct Responses',
    group: 'Quiz',
    description: 'Share of approved questions the student answered correctly.',
    normalize: { kind: 'ratio', num: 'correct', den: 'totalQuestions' }
  },
  {
    key: 'incorrect_responses',
    label: 'Incorrect Responses',
    group: 'Quiz',
    description: 'Share of approved questions the student got wrong (or skipped and counted as wrong).',
    normalize: { kind: 'ratio', num: 'incorrect', den: 'totalQuestions' }
  },
  {
    key: 'avg_response_time',
    label: 'Average Response Time (faster = better)',
    group: 'Quiz',
    description: 'Inverted average response time relative to the room\u2019s max timeToAnswer. 0 if no responses.',
    normalize: { kind: 'invertRatio', num: 'avgResponseTime', den: 'maxTimeToAnswer' }
  },
  {
    key: 'total_points',
    label: 'Total Points Earned',
    group: 'Quiz',
    description: 'Share of the room\u2019s available total points that this student earned.',
    normalize: { kind: 'ratio', num: 'totalPoints', den: 'totalAvailablePoints' }
  }
])

export const CRITERIA_BY_KEY = Object.freeze(
  CRITERIA.reduce((acc, c) => { acc[c.key] = c; return acc }, {})
)

export function isKnownCriterion(key) {
  return Object.prototype.hasOwnProperty.call(CRITERIA_BY_KEY, key)
}

export function getCriterion(key) {
  return CRITERIA_BY_KEY[key] || null
}

// Normalize a single criterion value for one student given the per-student aggregate
// projection (output of the Response.$group stage) and the room-wide denominators.
// All outputs are in [0, 1]; higher == better.
//
// Pure / no I/O — safe to call in a tight loop.
export function normalizeCriterionValue(criterionKey, agg, denominators) {
  const c = getCriterion(criterionKey)
  if (!c) return 0

  const attempted = Number(agg?.attempted) || 0
  const correct = Number(agg?.correct) || 0
  const incorrect = Math.max(0, attempted - correct)
  const totalPoints = Number(agg?.totalPoints) || 0
  const avgResponseTime = Number(agg?.avgResponseTime) || 0

  switch (c.normalize.kind) {
    case 'identity':
      // session_participation: passed in via denominators.joinedRosterHas (1 or 0)
      return denominators.joined ? 1 : 0
    case 'accuracy':
      return attempted > 0 ? correct / attempted : 0
    case 'ratio': {
      const den = Number(denominators[c.normalize.den])
      if (!den || den <= 0) return 0
      const num = c.normalize.num === 'attempted' ? attempted
        : c.normalize.num === 'correct' ? correct
        : c.normalize.num === 'incorrect' ? incorrect
        : c.normalize.num === 'totalPoints' ? totalPoints
        : 0
      return Math.max(0, Math.min(1, num / den))
    }
    case 'invertRatio': {
      // avg response time — LOWER is BETTER, so invert.
      // value = 1 - (avg / maxTta), clamped to [0,1].
      // Students who didn't respond: 0 (no signal).
      if (attempted === 0) return 0
      const maxTta = Number(denominators.maxTimeToAnswer)
      if (!maxTta || maxTta <= 0) return 0
      const ratio = Math.max(0, Math.min(1, avgResponseTime / maxTta))
      return 1 - ratio
    }
    default:
      return 0
  }
}