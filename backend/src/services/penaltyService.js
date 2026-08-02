// penaltyService.js
// Random-guess PATTERN detection — speed + consecutive-fast-answers + accuracy-vs-speed — plus the
// (separate, harsher) strict-mode point penalty.
//
// Two distinct outputs come out of evaluateAnswer() per submission:
//   - insight  — a SOFT, non-punitive, TEACHER-ONLY signal ("Possible random answering detected").
//                Never deducts points, never blocks the response from being saved/scored. It exists
//                purely to give the teacher a heads-up, so it fires on a shorter streak and is
//                worded/handled as a hint, not an accusation.
//   - penalty  — the HARD consequence (strict mode: real point deduction + response rejected).
//                Requires a longer streak AND accuracy at-or-below pure chance, so it only fires with
//                real confidence — a fast-but-correct student should essentially never hit this.
//
// Both signals require BOTH speed and accuracy to line up. Speed alone (the old behaviour) flagged
// fast-and-CORRECT students identically to fast-and-WRONG students, which is exactly backwards for
// "random guess" detection — a student who is fast because they know the material isn't guessing.
//
// State is per (roomId, studentId) and lives in Redis when available (mirrors roomLiveCache.js's
// optional-Redis pattern), so streaks survive multiple backend instances behind a load balancer.
// Falls back to an in-memory Map in single-instance/dev/test environments.
import { getRedisClient, isRedisEnabled } from '../config/redis.js'

// --- Speed threshold -----------------------------------------------------------------------------
// RELATIVE to the question's own timer, not a flat number: 2.5s is deeply suspicious on a 60s
// question but means nothing on a 5s lightning-round question. Floored/capped so it stays sane at
// the extremes (never demand faster than 1s, never require faster than 2.5s even on very long
// questions — matches the old, simpler behaviour for typical 20-30s questions).
//
// All thresholds below are overridable via env vars so this can be loosened for manual testing
// without touching code (e.g. in .env: RANDOM_GUESS_ULTRA_FAST_MAX_SEC=8 gives you an 8-second
// window to click instead of 2.5s, and RANDOM_GUESS_DEBUG=true logs every evaluation). Leave them
// unset in production to keep the defaults below.
const DEBUG = process.env.RANDOM_GUESS_DEBUG === 'true'
const ULTRA_FAST_MIN_SEC = Number(process.env.RANDOM_GUESS_ULTRA_FAST_MIN_SEC) || 1.0
const ULTRA_FAST_MAX_SEC = Number(process.env.RANDOM_GUESS_ULTRA_FAST_MAX_SEC) || 2.5
const ULTRA_FAST_TIME_FRACTION = Number(process.env.RANDOM_GUESS_ULTRA_FAST_FRACTION) || 0.15

export function ultraFastThreshold(timeToAnswerSeconds) {
  const tta = Number(timeToAnswerSeconds) > 0 ? Number(timeToAnswerSeconds) : 30
  return Math.max(ULTRA_FAST_MIN_SEC, Math.min(ULTRA_FAST_MAX_SEC, tta * ULTRA_FAST_TIME_FRACTION))
}

/**
 * Returns true if the submission is classified as ultra-fast for THIS question's timer.
 * Exported for testability.
 * @param {number} timeTakenInSeconds
 * @param {number} [timeToAnswerSeconds] - the question's timer; defaults to 30s if omitted.
 * @returns {boolean}
 */
export function isUltraFast(timeTakenInSeconds, timeToAnswerSeconds) {
  return timeTakenInSeconds < ultraFastThreshold(timeToAnswerSeconds)
}

// --- Streak thresholds + accuracy gate ------------------------------------------------------------
// Insight fires first (shorter streak) as a soft heads-up; penalty needs a longer streak AND
// accuracy at/below chance, so it only trips with real confidence.
const INSIGHT_STREAK_THRESHOLD = Number(process.env.RANDOM_GUESS_INSIGHT_STREAK) || 3
const PENALTY_STREAK_THRESHOLD = Number(process.env.RANDOM_GUESS_PENALTY_STREAK) || 4
// Insight tolerates a bit of luck above pure chance (e.g. a 4-option MCQ guesser will get ~25%
// right by accident); penalty requires accuracy AT or below chance — no benefit of the doubt once
// real points are on the line.
const INSIGHT_CHANCE_BUFFER = 0.15

function chanceAccuracy(numOptions) {
  const n = Number(numOptions) > 1 ? Number(numOptions) : 4
  return 1 / n
}

function defaultState() {
  return { consecutiveFast: 0, fastTotal: 0, fastCorrect: 0, insightFiredAtStreak: 0 }
}

// --- State storage (Redis hash when available, else in-memory Map) --------------------------------
const streakTracker = new Map() // in-memory fallback only. Key: `${roomId}:${studentId}` -> state
const KEY = (roomId) => `guess:pattern:${roomId}`

async function readState(roomId, studentId) {
  if (isRedisEnabled()) {
    try {
      const raw = await getRedisClient().hGet(KEY(roomId), String(studentId))
      return raw ? JSON.parse(raw) : defaultState()
    } catch { /* Redis hiccup — treat as fresh state rather than fail the submission */ }
  }
  return streakTracker.get(`${roomId}:${studentId}`) ?? defaultState()
}

async function writeState(roomId, studentId, state) {
  if (isRedisEnabled()) {
    try {
      await getRedisClient().hSet(KEY(roomId), String(studentId), JSON.stringify(state))
      return
    } catch { /* non-fatal — falls through to in-memory so this submission's state isn't lost */ }
  }
  streakTracker.set(`${roomId}:${studentId}`, state)
}

/**
 * Synchronous accessor for the consecutive-ultra-fast streak length.
 * Only reflects the in-memory fallback (Redis-off / test environments) — exported for white-box
 * testing, same as before.
 * @param {string} roomId
 * @param {string} studentId
 * @returns {number}
 */
export function getStreak(roomId, studentId) {
  return streakTracker.get(`${roomId}:${studentId}`)?.consecutiveFast ?? 0
}

/**
 * Record one answer's timing + correctness and evaluate the random-guess pattern for this student.
 *
 * @param {string} roomId
 * @param {string} studentId
 * @param {object} params
 * @param {number} params.timeTakenInSeconds
 * @param {number} [params.timeToAnswerSeconds] - the question's timer, for the relative speed threshold
 * @param {boolean} params.isCorrect - whether THIS answer was correct
 * @param {number} [params.numOptions] - option count, used to estimate chance-level accuracy
 * @param {boolean} params.strictMode - whether the room has strict mode on (gates the point deduction)
 * @returns {Promise<{
 *   ultraFast: boolean,
 *   insight: { streak: number, accuracy: number } | null,
 *   penalty: { pointsDeducted: number } | null
 * }>}
 */
export async function evaluateAnswer(roomId, studentId, { timeTakenInSeconds, timeToAnswerSeconds, isCorrect, numOptions, strictMode }) {
  const ultraFast = isUltraFast(timeTakenInSeconds, timeToAnswerSeconds)
  const state = await readState(roomId, studentId)

  let next
  if (ultraFast) {
    next = {
      consecutiveFast: state.consecutiveFast + 1,
      fastTotal: state.fastTotal + 1,
      fastCorrect: state.fastCorrect + (isCorrect ? 1 : 0),
      insightFiredAtStreak: state.insightFiredAtStreak
    }
  } else {
    // A non-fast answer breaks the pattern entirely — the whole point is CONSECUTIVE fast guessing.
    next = defaultState()
  }

  const chance = chanceAccuracy(numOptions)
  const accuracy = next.fastTotal ? next.fastCorrect / next.fastTotal : 0

  let insight = null
  if (next.consecutiveFast >= INSIGHT_STREAK_THRESHOLD && accuracy <= chance + INSIGHT_CHANCE_BUFFER) {
    // Throttle: only surface a new insight once the streak has grown past where we last fired, so a
    // long guessing run pings the teacher occasionally instead of on every single answer.
    if (next.consecutiveFast > next.insightFiredAtStreak) {
      insight = { streak: next.consecutiveFast, accuracy }
      next.insightFiredAtStreak = next.consecutiveFast
    }
  }

  let penalty = null
  if (next.consecutiveFast >= PENALTY_STREAK_THRESHOLD && accuracy <= chance) {
    penalty = { pointsDeducted: strictMode ? 5 : 0 }
    // Capture the streak before the reset so the debug log reflects what triggered the penalty,
    // not the 0 that defaultState() produces. Stored as an ephemeral, non-persisted field.
    const triggeredAtStreak = next.consecutiveFast
    next = defaultState() // reset after a hard trip, same as the old reset-on-penalty behaviour
    next._triggeredAtStreak = triggeredAtStreak
  }

  // Persist: strip the ephemeral debug field before writing to Redis / in-memory store.
  const { _triggeredAtStreak: _discard, ...stateToWrite } = next
  await writeState(roomId, studentId, stateToWrite)

  if (DEBUG) {
    console.log('[random-guess]', {
      roomId, studentId,
      timeTakenInSeconds: Number(timeTakenInSeconds?.toFixed?.(2) ?? timeTakenInSeconds),
      threshold: ultraFastThreshold(timeToAnswerSeconds),
      ultraFast, isCorrect,
      // Use the pre-reset streak when the penalty fired; next.consecutiveFast is 0 after reset.
      consecutiveFast: next._triggeredAtStreak ?? next.consecutiveFast,
      accuracy: Number(accuracy.toFixed(2)),
      chance: Number(chance.toFixed(2)),
      insightFired: !!insight,
      penaltyFired: !!penalty
    })
  }

  return { ultraFast, insight, penalty }
}

/**
 * Apply a 5-point deduction to a student's existing Response documents for a room.
 * Distributes the deduction across records (sorted by points desc), flooring each to 0.
 * If the student has 0 total points, skips the DB write.
 *
 * @param {string} roomId
 * @param {string} studentId
 * @returns {Promise<{ totalDeducted: number }>}
 */
export async function applyStrictModeDeduction(roomId, studentId) {
  const Response = (await import('../models/Response.js')).default

  const docs = await Response.find({ roomId, studentId })
    .sort({ points: -1 })
    .lean()

  const totalPoints = docs.reduce((sum, d) => sum + (d.points ?? 0), 0)

  if (totalPoints === 0) {
    return { totalDeducted: 0 }
  }

  let remaining = 5
  const bulkOps = []

  for (const doc of docs) {
    if (remaining <= 0) break
    const deduct = Math.min(doc.points ?? 0, remaining)
    if (deduct > 0) {
      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $inc: { points: -deduct } }
        }
      })
      remaining -= deduct
    }
  }

  if (bulkOps.length > 0) {
    try {
      await Response.bulkWrite(bulkOps)
    } catch (err) {
      console.error('[penaltyService] applyStrictModeDeduction bulkWrite failed:', err)
    }
  }

  return { totalDeducted: 5 - remaining }
}

/**
 * Remove all pattern-tracking state for a given room. Called when a room ends.
 * @param {string} roomId
 */
export async function clearRoomStreaks(roomId) {
  if (isRedisEnabled()) {
    try { await getRedisClient().del(KEY(roomId)) } catch { /* non-fatal */ }
  }
  const prefix = `${roomId}:`
  for (const key of streakTracker.keys()) {
    if (key.startsWith(prefix)) {
      streakTracker.delete(key)
    }
  }
}
