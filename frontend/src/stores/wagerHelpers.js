/**
 * Wager Helpers — pure math for High-Stakes Leaderboard Bounty
 * -------------------------------------------------------------
 * Stateless payout math + discrete-stop constants. Kept in a sibling
 * file so the zustand store can import these via a single named-import
 * pattern (avoids mixed-import pitfalls under babel-jest, same lesson
 * as `modifierHelpers.js`).
 *
 * Spec (locked at 17:16 IST):
 *   - baseScore snapshot taken at question-start.
 *   - win  payout = round(baseScore * (1 + pct / 100))
 *   - miss payout = 0 (lose the base)
 *   - discrete stops: 0% / 25% / 50% / 75% / 100%
 *   - default wager = 0%
 *   - session-only (no persistence)
 */

export const WAGER_STOPS = Object.freeze([0, 25, 50, 75, 100])

export const MIN_WAGER_PCT = 0
export const MAX_WAGER_PCT = 100
export const DEFAULT_WAGER_PCT = 0

/**
 * Pure: is `pct` one of the discrete stops? Strict integer comparison
 * so a slider sub-step can't sneak through.
 */
export function isValidWagerPct(pct) {
  return typeof pct === 'number' &&
    Number.isFinite(pct) &&
    WAGER_STOPS.includes(pct)
}

/**
 * Pure: clamp a free input down to the nearest valid stop. Used by
 * the slider when keyboard arrows nudge a non-stop value.
 */
export function clampToStop(pct) {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return DEFAULT_WAGER_PCT
  if (pct <= WAGER_STOPS[0]) return WAGER_STOPS[0]
  if (pct >= WAGER_STOPS[WAGER_STOPS.length - 1]) {
    return WAGER_STOPS[WAGER_STOPS.length - 1]
  }
  let best = WAGER_STOPS[0]
  let bestDelta = Math.abs(pct - best)
  for (let i = 1; i < WAGER_STOPS.length; i++) {
    const d = Math.abs(pct - WAGER_STOPS[i])
    if (d < bestDelta) {
      best = WAGER_STOPS[i]
      bestDelta = d
    }
  }
  return best
}

/**
 * Pure: payout when the student answers correctly.
 *   baseScore * (1 + pct/100), rounded to nearest integer.
 */
export function payoutOnWin(baseScore, pct) {
  const base = Number.isFinite(baseScore) && baseScore > 0 ? baseScore : 0
  const safePct = isValidWagerPct(pct) ? pct : DEFAULT_WAGER_PCT
  return Math.round(base * (1 + safePct / 100))
}

/**
 * Pure: payout when the student answers incorrectly or fails to
 * answer. The base is lost.
 */
export function payoutOnMiss(_baseScore) {
  return 0
}

/**
 * Pure: build the default wager state. Exported for tests and for
 * the store's reset path.
 */
export function defaultWagerState() {
  return Object.freeze({
    baseScore: 0,
    wagerPct: DEFAULT_WAGER_PCT,
    locked: false,
    questionId: '',
    // Optional bookkeeping: total delta from prior questions
    // (cumulative session gain). Starts at 0; cleared on tab close.
    cumulativeDelta: 0
  })
}

/**
 * Pure: identify whose question-id we're on. Mirrors modifierHelpers
 * so the store can be swapped without changing upstream callers.
 */
export function activeQuestionId(question) {
  if (!question || typeof question !== 'object') return ''
  return question._id || question.id || ''
}

/**
 * Pure: given the current store state + an outcome (`'win'` | `'miss'`),
 * compute the points awarded for this question. Used by `useLocalScore`
 * for read-only derivation. Does not mutate.
 */
export function computeOutcomePoints(state, outcome) {
  if (!state || !state.locked) return 0
  if (outcome === 'win') return payoutOnWin(state.baseScore, state.wagerPct)
  if (outcome === 'miss') return payoutOnMiss(state.baseScore)
  return 0
}