import { create } from 'zustand'
import {
  WAGER_STOPS,
  DEFAULT_WAGER_PCT,
  isValidWagerPct,
  clampToStop,
  defaultWagerState,
  activeQuestionId,
  computeOutcomePoints
} from './wagerHelpers.js'

/**
 * Wager Store (session-only)
 * --------------------------
 * Per-tab Zustand store that tracks the student's high-stakes wager
 * state for the active question.
 *
 * Spec (locked at 17:16 IST, file `wagerHelpers.js`):
 *   - baseScore snapshot is captured at question-start
 *   - win  payout = round(baseScore * (1 + wagerPct/100))
 *   - miss payout = 0 (lose the base)
 *   - discrete stops: 0 / 25 / 50 / 75 / 100
 *   - default wagerPct = 0 (no risk)
 *   - session-only — no `persist` middleware. Cleared on tab close.
 *
 * The store does NOT compute or broadcast the final score; that is
 * `useLocalScore`'s job. This store is the source of truth for the
 * in-flight wager only.
 *
 * Pure helpers live in `./wagerHelpers.js` and are NOT re-exported
 * here on purpose — same lesson as `modifierHelpers.js`.
 */

const initialState = () => defaultWagerState()

const useWagerStore = create((set, get) => ({
  ...initialState(),

  /**
   * Capture the baseScore snapshot at question-start. Idempotent: a
   * second call with the same question id is a no-op so the host
   * component can call this freely on every render without losing
   * the player's in-flight wager.
   *
   * If a different question is supplied, the wager state is reset
   * (locked=false, wagerPct=default, baseScore=incoming) so the
   * store cleanly transitions between questions.
   */
  startQuestion(question, baseScore) {
    const qid = activeQuestionId(question)
    const cur = get()
    const safeBase = Number.isFinite(baseScore) && baseScore > 0
      ? Math.round(baseScore)
      : 0

    if (cur.questionId === qid && qid !== '') {
      // Same question — leave the player's wager alone. But if the
      // host passed a fresh baseScore (e.g. server-pushed correction),
      // adopt it ONLY if the player hasn't locked yet.
      if (!cur.locked) {
        set({ baseScore: safeBase })
      }
      return
    }

    // Different question (or first call). Reset to a fresh wager state
    // for the new question, taking the snapshot.
    set({
      baseScore: safeBase,
      wagerPct: DEFAULT_WAGER_PCT,
      locked: false,
      questionId: qid
    })
  },

  /**
   * Set the wager percentage (clamped to a valid stop). Does NOT
   * lock; locking is a separate explicit action.
   */
  setWagerPct(pct) {
    const safePct = isValidWagerPct(pct) ? pct : clampToStop(pct)
    const { locked } = get()
    if (locked) return   // can't change a locked wager
    set({ wagerPct: safePct })
  },

  /**
   * Lock the current wager. After this, setWagerPct is a no-op
   * until the next question is started. Returns `true` if the lock
   * succeeded, `false` if there is no question or no base score.
   */
  lockWager() {
    const { questionId, baseScore, locked, wagerPct } = get()
    if (locked) return true
    if (!questionId) return false
    if (!Number.isFinite(baseScore) || baseScore <= 0) return false
    if (!isValidWagerPct(wagerPct)) return false
    set({ locked: true })
    return true
  },

  /**
   * Unlock (e.g. host decided to reset). WagerPct stays the same;
   * the student can pick a different value or re-lock.
   */
  unlockWager() {
    set({ locked: false })
  },

  /**
   * Reset the wager state to defaults. Used on question transition
   * and on host-pushed "prepare_poll" frames.
   */
  resetForQuestion(question) {
    const qid = activeQuestionId(question)
    set({
      ...defaultWagerState(),
      questionId: qid
    })
  },

  /**
   * Record the outcome of the active question. Bumps
   * `cumulativeDelta` by the awarded points. Does NOT reset the
   * wager state — that happens on the next `startQuestion` call.
   * Returns the points awarded.
   */
  recordOutcome(outcome) {
    const { questionId, locked, cumulativeDelta } = get()
    if (!questionId) return 0
    if (!locked) return 0
    const points = computeOutcomePoints(get(), outcome)
    set({ cumulativeDelta: (cumulativeDelta || 0) + points })
    return points
  }
}))

// Test-only escape hatch: reset the entire store to factory state.
// IMPORTANT: do NOT pass `true` (replace) to setState — that would
// wipe the methods defined in the state creator. We merge instead.
export function _resetWagerStoreForTests() {
  useWagerStore.setState(initialState())
}

export default useWagerStore