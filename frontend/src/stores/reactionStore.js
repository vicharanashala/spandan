import { create } from 'zustand'
import {
  REACTION_LIST,
  RING_BUFFER_MAX,
  FLOATER_LIFETIME_MS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_TRIGGERS,
  defaultReactionState,
  isValidEmojiId,
  makeFloater,
  cullExpired,
  cullOldest,
  applyRateLimit
} from './reactionHelpers.js'

/**
 * reactionStore.js
 * ----------------
 * Zustand store for Phase 5 emoji reaction streams.
 *
 * Holds:
 *   - floaters:   ring buffer of active emoji floaters (capped at RING_BUFFER_MAX)
 *   - cooldowns:  sliding-window timestamps of recent triggers
 *   - muted:      user toggle for hype audio
 *   - audioReady: true once the AudioContext has been unlocked by a gesture
 *
 * No `persist` middleware — session-only. No socket emission — all
 * state is local to this tab. The store is intentionally framework
 * agnostic so the audio singleton (`hype.js`) and React components
 * can read/write via the standard zustand hook API.
 *
 * Design contract (locked at 19:22 IST):
 *   1. Ring buffer cap = 50 concurrent reactions.
 *   2. Lane allocation via timestamp-based pseudo-random hash.
 *   3. Rate limit: 5 triggers per second per tab (sliding window).
 *   4. Audio: single shared AudioContext managed by hype.js.
 *   5. Floater lifetime: 2,500 ms from spawn to unmount.
 *   6. State reset helpers MUST merge, never replace (Phase 2 lesson).
 */

export const useReactionStore = create((set, get) => ({
  ...defaultReactionState(),

  /**
   * spawnFloater(emojiId)
   * ---------------------
   * The main public action. Validates the emoji, checks the rate
   * limit, builds a new floater, appends to the ring buffer (culling
   * oldest if over cap), updates cooldowns, and returns the floater
   * record (or null if rejected).
   */
  spawnFloater(emojiId) {
    const now = Date.now()
    if (!isValidEmojiId(emojiId, REACTION_LIST)) return null
    const { allowed, history } = applyRateLimit(now, get().cooldowns)
    if (!allowed) return null
    const floater = makeFloater(emojiId, { now, lifetimeMs: FLOATER_LIFETIME_MS })
    const current = Array.isArray(get().floaters) ? get().floaters : []
    const next = cullOldest(current.concat([floater]), RING_BUFFER_MAX)
    set({ floaters: next, cooldowns: history })
    return floater
  },

  /**
   * expireFloater(id)
   * -----------------
   * Removes a single floater by id. Idempotent. Used by
   * ReactionFloater's onAnimationEnd and by the periodic tick.
   */
  expireFloater(id) {
    if (typeof id !== 'string' || id.length === 0) return false
    const before = Array.isArray(get().floaters) ? get().floaters : []
    const after = before.filter((f) => f && f.id !== id)
    if (after.length === before.length) return false
    set({ floaters: after })
    return true
  },

  /**
   * tickCull(now)
   * -------------
   * Drops any floaters whose expiresAt <= now. Called by a 250ms
   * interval in ReactionLayer (or by tests).
   */
  tickCull(now) {
    const t = Number.isFinite(now) ? now : Date.now()
    const before = Array.isArray(get().floaters) ? get().floaters : []
    const after = cullExpired(before, t)
    if (after.length === before.length) return false
    set({ floaters: after })
    return true
  },

  /**
   * setMuted(value)
   * ---------------
   * User-facing mute toggle for hype audio.
   */
  setMuted(value) {
    set({ muted: !!value })
  },

  /**
   * markAudioReady()
   * ----------------
   * Called once hype.js successfully unlocks the AudioContext via
   * a user gesture. Idempotent.
   */
  markAudioReady() {
    if (get().audioReady) return false
    set({ audioReady: true })
    return true
  },

  /**
   * clearAll()
   * ----------
   * Drops every floater and clears cooldowns. Used by Question
   * Lifecycle reset and host navigation.
   */
  clearAll() {
    set({ floaters: [], cooldowns: [] })
  }
}))

/**
 * _resetReactionStoreForTests()
 * -----------------------------
 * Test-only helper. Resets the store to its initial state WITHOUT
 * wiping methods. **Critical Phase 2 lesson**: do NOT call
 * `useReactionStore.setState(initial, true)` — the `true` arg means
 * REPLACE, which would wipe the action methods.
 *
 * We explicitly MERGE (no second arg) so actions like spawnFloater,
 * expireFloater, etc. remain functional after reset.
 */
export function _resetReactionStoreForTests() {
  const fresh = defaultReactionState()
  useReactionStore.setState({ ...fresh })
}

/**
 * _hardResetReactionStoreForTests()
 * ---------------------------------
 * Same as above but uses the frozen initial-state factory directly.
 * Still merges — never replaces.
 */
export function _hardResetReactionStoreForTests() {
  useReactionStore.setState(defaultReactionState())
}

/**
 * Re-exported constants for consumers that only want to import
 * one place. Frozen to prevent runtime mutation.
 */
export const REACTION_CONSTANTS = Object.freeze({
  REACTION_LIST,
  RING_BUFFER_MAX,
  FLOATER_LIFETIME_MS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_TRIGGERS
})

export default useReactionStore