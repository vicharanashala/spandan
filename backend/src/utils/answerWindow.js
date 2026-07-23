/**
 * Server-side answer-window enforcement for POST /api/responses.
 *
 * A question is only answerable for `timeToAnswer` seconds after it launches, plus a small grace
 * buffer for ordinary network/clock slack at the boundary. Anything older is rejected outright —
 * this is what closes the "join an hour into a live session and answer every expired question"
 * hole (security-poc/leaderboard_bot.mjs).
 *
 * The client also self-reports `responseTime` (frozen at click time, before its own deliberate
 * 0-2s send jitter, so a legitimately fast click never loses points to network delay) — but
 * nothing stops a client from simply lying and claiming near-zero. `resolveResponseTime` floors
 * that claim against what the server itself observed elapsed, so it can never read as more than a
 * few seconds faster than physically possible — a fixed, small allowance, not a fraction of the
 * question's full window.
 */

// Deadline tolerance: how far past timeToAnswer a submission can still land and be accepted.
// Covers normal network latency + the app's own deliberate send-side jitter.
export const ANSWER_GRACE_S = 5

// responseTime floor discount: how much LESS than the server-observed elapsed time a client's
// self-reported responseTime is allowed to claim. Deliberately small and separate from
// ANSWER_GRACE_S above — that constant tolerates a late *arrival*, this one bounds how much a
// claimed *reaction time* may undercut reality. Matches exactly the app's own deliberate 0-2s
// send-side jitter (StudentRoomPage.jsx) — a legitimate click is never penalized beyond that; it
// must NOT scale with the deadline grace or every submission could shave a flat multi-second
// discount off its score regardless of when it actually landed.
export const RESPONSE_TIME_SLACK_S = 2

/**
 * @param {Date|string|number} launchedAt - when the question went live (Question.launchedAt, or
 *   createdAt as a fallback for documents predating that field)
 * @param {number} now - current time in ms (Date.now(); parameterized for tests)
 * @returns {number} seconds elapsed since launch (can be negative under clock skew)
 */
export function secondsSinceLaunch(launchedAt, now = Date.now()) {
  if (!launchedAt) return 0
  return (now - new Date(launchedAt).getTime()) / 1000
}

/**
 * @param {number} elapsedS - result of secondsSinceLaunch
 * @param {number} timeToAnswer - the question's answer window, in seconds
 * @returns {boolean} true if a submission arriving now is within the allowed window
 */
export function isWithinAnswerWindow(elapsedS, timeToAnswer) {
  return elapsedS <= timeToAnswer + ANSWER_GRACE_S
}

/**
 * Floors a client-reported responseTime to what the server itself observed (minus a small fixed
 * slack), so a forged near-zero value can never score meaningfully higher than an honest report
 * submitted at the same wall-clock moment.
 * @param {number} clientResponseTime - value the client sent (may be forged/absent)
 * @param {number} elapsedS - result of secondsSinceLaunch
 * @returns {number} responseTime to use for scoring
 */
export function resolveResponseTime(clientResponseTime, elapsedS) {
  const minPlausible = Math.max(0, elapsedS - RESPONSE_TIME_SLACK_S)
  return Math.max(Number(clientResponseTime) || 0, minPlausible)
}
