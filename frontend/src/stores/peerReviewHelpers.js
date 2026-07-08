/**
 * peerReviewHelpers.js
 * --------------------
 * Pure constants and helpers for the Phase 6 peer-review layer.
 * Intentionally framework-free so the store, the hook, the
 * components, and the tests can all import this without pulling
 * React, DOM, or BroadcastChannel into unit tests.
 *
 * Design contract (locked at 19:40 IST):
 *   1. Rubric = 0 / 1 / 2 (Incorrect / Partial / Correct).
 *   2. Accuracy = rolling last N=20 grades.
 *   3. Ghost-mode triggers at PEER_GHOST_FALLBACK_MS (2500ms).
 *   4. Per-round deadline = PEER_DURATION_CAP_MS (90000ms).
 *   5. BroadcastChannel name = 'spandan:peer-review'.
 *   6. Cross-tab target = student running multiple tabs of the same
 *      live quiz session.
 *   7. State reset helpers MUST merge, never replace.
 */

// --- Frozen constants ----------------------------------------------------

export const PEER_ACCURACY_FLOOR = 0.60

export const PEER_ACCURACY_WINDOW = 20

export const PEER_DURATION_CAP_MS = 90000

export const PEER_GHOST_FALLBACK_MS = 2500

export const PEER_RUBRIC_MIN = 0
export const PEER_RUBRIC_MAX = 2

export const BROADCAST_CHANNEL_NAME = 'spandan:peer-review'

export const BROADCAST_MESSAGE_TYPES = Object.freeze([
  'peer-review:hello',
  'peer-review:request',
  'peer-review:offer',
  'peer-review:accept',
  'peer-review:answer-shared',
  'peer-review:grade-submitted',
  'peer-review:heartbeat',
  'peer-review:cancel'
])

export const PEER_REVIEW_STATES = Object.freeze([
  'idle',
  'requesting',
  'paired',
  'ghost',
  'grading',
  'submitted',
  'expired'
])

// --- Pure helpers --------------------------------------------------------

/**
 * clampRubric(value)
 * ------------------
 * Forces a value into the [0, 2] integer rubric range.
 *   - Non-numbers, NaN, Infinity -> 0
 *   - Floats are floored
 *   - Out-of-range values are clamped
 */
export function clampRubric(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const floored = Math.floor(value)
  if (floored < PEER_RUBRIC_MIN) return PEER_RUBRIC_MIN
  if (floored > PEER_RUBRIC_MAX) return PEER_RUBRIC_MAX
  return floored
}

/**
 * isValidGrade(value)
 * -------------------
 * True only when value is an integer in [0, 2]. Rejects strings,
 * floats, NaN, undefined, null.
 */
export function isValidGrade(value) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= PEER_RUBRIC_MIN &&
    value <= PEER_RUBRIC_MAX
  )
}

/**
 * gradesAgree(myGrade, serverGrade)
 * ---------------------------------
 * Two grades 'agree' if they differ by at most 1 (server may lerp
 * partial-to-correct at the boundary). Strict equality gets credit;
 * off-by-one gets partial credit; off-by-two misses.
 */
export function gradesAgree(myGrade, serverGrade) {
  if (!isValidGrade(myGrade) || !isValidGrade(serverGrade)) return false
  return Math.abs(myGrade - serverGrade) <= 1
}

/**
 * computeRollingAccuracy(grades)
 * -------------------------------
 * Accuracy = correctGrades / totalGrades. Returns 0 for empty array.
 * Caller is responsible for trimming to the last N=20 entries.
 */
export function computeRollingAccuracy(grades) {
  if (!Array.isArray(grades) || grades.length === 0) return 0
  let correct = 0
  for (let i = 0; i < grades.length; i++) {
    const g = grades[i]
    // Count all entries; non-boolean "correct" (e.g. 'yes') is treated
    // as incorrect, not skipped from the denominator.
    if (g && g.correct === true) correct++
  }
  return correct / grades.length
}

/**
 * meetsAccuracyFloor(accuracy)
 * ----------------------------
 * True if accuracy >= PEER_ACCURACY_FLOOR. Non-finite -> false.
 */
export function meetsAccuracyFloor(accuracy) {
  return typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= PEER_ACCURACY_FLOOR
}

/**
 * isGhostFallbackActive(elapsedMs)
 * ---------------------------------
 * True if the round has elapsed past PEER_GHOST_FALLBACK_MS without
 * a pair.
 */
export function isGhostFallbackActive(elapsedMs) {
  const t = Number.isFinite(elapsedMs) ? elapsedMs : 0
  return t >= PEER_GHOST_FALLBACK_MS
}

/**
 * isRoundExpired(elapsedMs)
 * -------------------------
 * True if the round has elapsed past PEER_DURATION_CAP_MS (90s).
 */
export function isRoundExpired(elapsedMs) {
  const t = Number.isFinite(elapsedMs) ? elapsedMs : 0
  return t >= PEER_DURATION_CAP_MS
}

/**
 * remainingMs(elapsedMs)
 * ----------------------
 * Returns ms left in the round, clamped to [0, cap]. Negative input
 * treated as 0.
 */
export function remainingMs(elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0
  return Math.max(0, PEER_DURATION_CAP_MS - elapsedMs)
}

/**
 * deadlineFromStart(startMs)
 * --------------------------
 * Returns the absolute deadline timestamp given a start ms.
 * Non-finite start -> 0.
 */
export function deadlineFromStart(startMs) {
  const s = Number.isFinite(startMs) ? startMs : 0
  return s > 0 ? s + PEER_DURATION_CAP_MS : 0
}

/**
 * pairingKey(questionId, userId)
 * ------------------------------
 * Deterministic key for matching peers. Stable across reloads.
 */
export function pairingKey(questionId, userId) {
  if (typeof questionId !== 'string' || typeof userId !== 'string') return ''
  if (questionId.length === 0 || userId.length === 0) return ''
  return questionId + '::' + userId
}

/**
 * trimRollingWindow(grades, max = PEER_ACCURACY_WINDOW)
 * -----------------------------------------------------
 * Returns the LAST `max` entries. Pure.
 */
export function trimRollingWindow(grades, max) {
  if (!Array.isArray(grades)) return []
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : PEER_ACCURACY_WINDOW
  if (grades.length <= cap) return grades.slice()
  return grades.slice(-cap)
}

/**
 * recordGrade(rollingGrades, serverGrade, myGrade, max?)
 * -------------------------------------------------------
 * Appends a grade to the rolling window, trimmed to `max`.
 * Returns a new array (does not mutate input).
 */
export function recordGrade(rollingGrades, serverGrade, myGrade, max) {
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : PEER_ACCURACY_WINDOW
  const safe = Array.isArray(rollingGrades) ? rollingGrades.slice() : []
  const correct = gradesAgree(myGrade, serverGrade)
  safe.push({
    myGrade: isValidGrade(myGrade) ? myGrade : null,
    serverGrade: isValidGrade(serverGrade) ? serverGrade : null,
    correct,
    at: Date.now()
  })
  return trimRollingWindow(safe, cap)
}

/**
 * isValidBroadcastMessage(msg)
 * ----------------------------
 * True if msg is a plain object with a known `type` field and a
 * `payload` field. Used by the BroadcastChannel wrapper to reject
 * stray messages.
 */
export function isValidBroadcastMessage(msg) {
  if (!msg || typeof msg !== 'object') return false
  if (typeof msg.type !== 'string') return false
  if (msg.type.length === 0) return false
  if (BROADCAST_MESSAGE_TYPES.indexOf(msg.type) === -1) return false
  if (!Object.prototype.hasOwnProperty.call(msg, 'payload')) return false
  return true
}

/**
 * makeBroadcastMessage(type, payload)
 * -----------------------------------
 * Build a typed message for the BroadcastChannel.
 *   type: must be a known BROADCAST_MESSAGE_TYPES entry.
 *   payload: arbitrary serialisable data (cloned shallowly).
 * Returns null if type is unknown (caller should log and drop).
 */
export function makeBroadcastMessage(type, payload) {
  if (typeof type !== 'string') return null
  if (BROADCAST_MESSAGE_TYPES.indexOf(type) === -1) return null
  const safePayload = payload && typeof payload === 'object' ? Object.assign({}, payload) : {}
  return { type, payload: safePayload, at: Date.now() }
}

/**
 * defaultPeerReviewState()
 * ------------------------
 * Frozen initial state for the peer-review store.
 */
export function defaultPeerReviewState() {
  const state = {
    status: 'idle',
    questionId: '',
    mySubmission: '',
    peerSubmission: '',
    myGrade: null,
    peerGrade: null,
    rollingGrades: [],
    rollingAccuracy: 0,
    meetsFloor: false,
    startedAt: 0,
    deadlineAt: 0,
    isGhostMode: false,
    roundExpired: false,
    lastBroadcastAt: 0
  }
  return Object.freeze(state)
}