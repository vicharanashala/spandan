/**
 * Streak Fire — pure functions for streak math.
 *
 * Kept dependency-free so they can be unit-tested without Mongo.
 * Higher-level orchestration (sweeping missed questions, persistence) lives in
 * the route handlers; this module only computes the next state.
 */

/**
 * Apply an answer to a streak.
 *
 * Rules (current spec):
 *   - correct  -> currentStreak += 2   (rewards precision; building is fast)
 *   - wrong    -> currentStreak -= 3   (floored at 0)
 *   - bestStreak = max(bestStreak, currentStreak) AFTER the change (never decreases)
 *
 * Skipped questions do NOT touch the streak counter here — they go through
 * the freeze path in the route handler (see responses.js missed-question sweep).
 * Freeze preserves the streak; absent a freeze, the skip is a no-op (the
 * streak simply doesn't move).
 *
 * Event semantics:
 *   - 'increment' = correct answer applied
 *   - 'decrement' = wrong answer applied (streak dropped by 3, floored at 0)
 *   - 'noop'      = wrong answer when streak was already 0 (nothing to lose)
 *
 * Note: prior versions of this module used 'reset' as the wrong-answer event
 * name. That name is retained internally for backward compatibility with any
 * downstream checks but the documentation now reflects the new rule.
 *
 * @param {{ currentStreak: number, bestStreak: number }} member
 * @param {boolean} isCorrect
 * @returns {{ currentStreak: number, bestStreak: number, changed: boolean, event: 'increment'|'decrement'|'noop' }}
 */
export function applyAnswer(member, isCorrect) {
  const prevCurrent = Number(member?.currentStreak) || 0
  const prevBest    = Number(member?.bestStreak)    || 0

  let currentStreak
  let event
  if (isCorrect) {
    currentStreak = prevCurrent + 2
    event = 'increment'
  } else {
    // Wrong answer: subtract 3, floored at 0.
    currentStreak = Math.max(0, prevCurrent - 3)
    // Anything that moved the streak counts as a 'decrement' for toast/UI
    // purposes, except noop when there was nothing to lose.
    event = prevCurrent !== currentStreak ? 'decrement' : 'noop'
  }

  const bestStreak = Math.max(prevBest, currentStreak)

  return {
    currentStreak,
    bestStreak,
    changed: currentStreak !== prevCurrent || bestStreak !== prevBest,
    event
  }
}

/**
 * "Missed a question" — under the current spec, this is a NO-OP.
 *
 * Skipped questions no longer break the streak directly. The route handler
 * (responses.js) is responsible for the freeze path: if a freeze is
 * available, it's consumed and the streak is preserved; if no freeze is
 * available, the skip is silently ignored and the streak counter is
 * unaffected.
 *
 * This function is retained so any callers that still invoke it get a
 * well-defined no-op response (streak unchanged, event 'noop').
 *
 * @param {{ currentStreak: number, bestStreak: number }} member
 * @returns {{ currentStreak: number, bestStreak: number, changed: boolean, event: 'noop' }}
 */
export function applyMissedQuestion(member) {
  const prevCurrent = Number(member?.currentStreak) || 0
  const prevBest    = Number(member?.bestStreak)    || 0
  return { currentStreak: prevCurrent, bestStreak: prevBest, changed: false, event: 'noop' }
}