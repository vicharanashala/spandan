/**
 * peerReviewStore.js
 * ------------------
 * Zustand store for the Phase 6 peer-review layer. Holds all
 * client-local state: my submission, peer submission, my grade,
 * peer grade, rolling accuracy window, timer state, ghost-mode
 * flag. No socket emission, no server roundtrip (server-side
 * consensus happens via socket.emit on submit; this store just
 * tracks UI state).
 *
 * Design contract (locked at 19:40 IST):
 *   - Rolling accuracy over last 20 grades (PEER_ACCURACY_WINDOW).
 *   - 90s round cap (PEER_DURATION_CAP_MS).
 *   - 2.5s ghost-mode fallback (PEER_GHOST_FALLBACK_MS).
 *   - Test reset helpers MUST merge, never replace.
 */

import { create } from 'zustand'
import {
  PEER_ACCURACY_FLOOR,
  PEER_ACCURACY_WINDOW,
  PEER_DURATION_CAP_MS,
  PEER_GHOST_FALLBACK_MS,
  PEER_RUBRIC_MIN,
  PEER_RUBRIC_MAX,
  clampRubric,
  isValidGrade,
  gradesAgree,
  computeRollingAccuracy,
  meetsAccuracyFloor,
  isGhostFallbackActive,
  isRoundExpired,
  remainingMs,
  deadlineFromStart,
  pairingKey,
  recordGrade,
  trimRollingWindow,
  defaultPeerReviewState
} from './peerReviewHelpers.js'

export const PEER_REVIEW_CONSTANTS = Object.freeze({
  PEER_ACCURACY_FLOOR,
  PEER_ACCURACY_WINDOW,
  PEER_DURATION_CAP_MS,
  PEER_GHOST_FALLBACK_MS,
  PEER_RUBRIC_MIN,
  PEER_RUBRIC_MAX
})

const initial = defaultPeerReviewState()

export const usePeerReviewStore = create((set, get) => ({
  ...initial,

  /**
   * beginRound(questionId, mySubmission)
   * -------------------------------------
   * Start a new peer-review round. Resets all per-round state but
   * preserves the rolling accuracy window across rounds.
   */
  beginRound(questionId, mySubmission) {
    const safeQid = typeof questionId === 'string' ? questionId : ''
    const safeSubmission = typeof mySubmission === 'string' ? mySubmission : ''
    const now = Date.now()
    set({
      status: 'requesting',
      questionId: safeQid,
      mySubmission: safeSubmission,
      peerSubmission: '',
      myGrade: null,
      peerGrade: null,
      startedAt: now,
      deadlineAt: deadlineFromStart(now),
      isGhostMode: false,
      roundExpired: false,
      lastBroadcastAt: 0
    })
  },

  /**
   * pairWith(peerSubmission, peerUserId)
   * -------------------------------------
   * Mark this round as paired with a peer. Clears ghost-mode flag.
   */
  pairWith(peerSubmission, peerUserId) {
    const safeSubmission = typeof peerSubmission === 'string' ? peerSubmission : ''
    set({
      status: 'paired',
      peerSubmission: safeSubmission,
      isGhostMode: false
    })
  },

  /**
   * enterGhostMode()
   * ----------------
   * Switch to ghost-mode: review your own past answer. Triggered
   * automatically when no peer pairs within PEER_GHOST_FALLBACK_MS.
   */
  enterGhostMode() {
    const state = get()
    if (state.status === 'submitted' || state.status === 'expired') return false
    set({
      status: 'ghost',
      peerSubmission: state.mySubmission,
      isGhostMode: true
    })
    return true
  },

  /**
   * setMyGrade(grade)
   * -----------------
   * Set the user's grade for the peer's submission. Clamped to
   * [0, 2]. Rejected if round is expired or already submitted.
   */
  setMyGrade(grade) {
    const state = get()
    if (state.status === 'submitted' || state.status === 'expired') return false
    const clamped = clampRubric(grade)
    set({
      myGrade: clamped,
      status: state.status === 'grading' ? 'grading' : 'grading'
    })
    return true
  },

  /**
   * setPeerGrade(grade)
   * -------------------
   * Record the peer's grade for my submission (delivered via
   * BroadcastChannel from the paired tab). Updates the rolling
   * accuracy window against this grade as the "server" reference
   * (since this is the peer consensus signal in the ghost-mode /
   * same-tab case).
   */
  setPeerGrade(grade) {
    const state = get()
    if (!isValidGrade(grade)) return false
    set({ peerGrade: grade })
    return true
  },

  /**
   * submitRound()
   * --------------
   * Mark the round as submitted. Captures the final peer grade
   * (if any) into the rolling accuracy window. Returns the
   * resolved accuracy on success, null on no-op.
   */
  submitRound() {
    const state = get()
    if (state.status === 'submitted' || state.status === 'expired') return null
    const serverGrade = isValidGrade(state.peerGrade) ? state.peerGrade : null
    const myGrade = isValidGrade(state.myGrade) ? state.myGrade : null
    if (myGrade === null || serverGrade === null) {
      set({ status: 'submitted' })
      return null
    }
    const next = recordGrade(state.rollingGrades, serverGrade, myGrade, PEER_ACCURACY_WINDOW)
    const accuracy = computeRollingAccuracy(next)
    set({
      rollingGrades: next,
      rollingAccuracy: accuracy,
      meetsFloor: meetsAccuracyFloor(accuracy),
      status: 'submitted'
    })
    return accuracy
  },

  /**
   * tickRound(elapsedMs)
   * --------------------
   * Advance the round timer. Returns the new status. If elapsedMs
   * >= PEER_DURATION_CAP_MS, marks the round as expired and
   * stops accepting grades.
   */
  tickRound(elapsedMs) {
    const state = get()
    if (state.status === 'submitted' || state.status === 'expired') return state.status
    const t = Number.isFinite(elapsedMs) ? elapsedMs : 0
    if (isRoundExpired(t)) {
      set({ roundExpired: true, status: 'expired' })
      return 'expired'
    }
    // Ghost-mode auto-trigger only if still waiting (status 'requesting')
    // and no peer yet.
    if (state.status === 'requesting' && isGhostFallbackActive(t)) {
      set({
        status: 'ghost',
        peerSubmission: state.mySubmission,
        isGhostMode: true
      })
      return 'ghost'
    }
    return state.status
  },

  /**
   * cancelRound()
   * --------------
   * Abort the round. Preserves the rolling accuracy window but
   * resets per-round state to idle.
   */
  cancelRound() {
    set({
      ...defaultPeerReviewState(),
      rollingGrades: get().rollingGrades,
      rollingAccuracy: get().rollingAccuracy,
      meetsFloor: get().meetsFloor
    })
  },

  /**
   * resetForQuestion(questionId)
   * -----------------------------
   * Called when the question changes. Cancels any active round
   * but preserves the rolling accuracy window.
   */
  resetForQuestion(questionId) {
    const safeQid = typeof questionId === 'string' ? questionId : ''
    set({
      ...defaultPeerReviewState(),
      questionId: safeQid,
      rollingGrades: get().rollingGrades,
      rollingAccuracy: get().rollingAccuracy,
      meetsFloor: get().meetsFloor
    })
  },

  /**
   * noteBroadcast()
   * ---------------
   * Records that a BroadcastChannel message was just sent.
   * Used by the UI to throttle broadcast frequency.
   */
  noteBroadcast() {
    set({ lastBroadcastAt: Date.now() })
  },

  /**
   * clearAll()
   * ----------
   * Full reset including rolling accuracy window. Use between
   * sessions or for hard test reset.
   */
  clearAll() {
    set({ ...defaultPeerReviewState() })
  }
}))

// --- Test-only helpers ---------------------------------------------------

/**
 * _resetPeerReviewStoreForTests()
 * --------------------------------
 * MERGE reset (NOT replace). Preserves methods defined in state
 * creator. Phase 2 / Phase 5 lesson banked.
 */
export function _resetPeerReviewStoreForTests() {
  usePeerReviewStore.setState({ ...defaultPeerReviewState() })
}

export function _hardResetPeerReviewStoreForTests() {
  usePeerReviewStore.setState({ ...defaultPeerReviewState() })
}

export default usePeerReviewStore;