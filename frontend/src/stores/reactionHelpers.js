/**
 * reactionHelpers.js
 * ------------------
 * Pure constants and helper functions for the Phase 5 emoji-reaction
 * streams. Everything in this file is intentionally framework-free so
 * it can be imported by the zustand store, the components, and the
 * test suite without dragging React, DOM, or audio APIs into unit
 * tests.
 *
 * Design contract (locked at 19:22 IST):
 *   1. Ring buffer cap = 50 concurrent reactions.
 *   2. Lane allocation via timestamp-based pseudo-random hash
 *      (minimises layout collisions; never round-robin).
 *   3. Rate limit: 5 triggers per second, per tab, sliding window.
 *   4. Audio: single shared AudioContext managed by hype.js.
 *   5. Floater lifetime: 2,500 ms from spawn to unmount.
 *   6. State reset helpers MUST merge, never replace (Phase 2 lesson).
 */

// --- Frozen constants ----------------------------------------------------

export const REACTION_LIST = Object.freeze(['\u{1F525}', '\u{1F44F}', '\u{1F602}', '\u{1F62E}', '\u{1F4AF}', '\u{1F914}'])

export const RING_BUFFER_MAX = 50

export const LANE_COUNT = 5

export const FLOATER_LIFETIME_MS = 2500

export const RATE_LIMIT_WINDOW_MS = 1000
export const RATE_LIMIT_MAX_TRIGGERS = 5

// --- Pure helpers --------------------------------------------------------

/**
 * pickLane(now)
 * -------------
 * Returns a deterministic-ish lane index in [0, LANE_COUNT). The
 * spec calls for "timestamp-based pseudo-random hash" so that two
 * reactions fired within the same millisecond do NOT land in the
 * same lane (which would visually collide) but the spread is
 * well-distributed over time. Uses a splitmix32 xorshift mixer with
 * an extra round of mixing to break clustering on consecutive
 * sequential timestamps.
 */
export function pickLane(now) {
  const t = Number.isFinite(now) ? now : Date.now()
  let h = (t | 0) ^ 0x9e3779b9
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  // Extra mixing: shift then add a second constant, then xor.
  h = Math.imul(h ^ (h >>> 7), 0x165667b1) ^ 0xd3a2646c
  const lane = Math.abs(h | 0) % LANE_COUNT
  return lane
}

/**
 * isValidEmojiId(emojiId, list = REACTION_LIST)
 * ---------------------------------------------
 * Type- and value-safe validator for incoming emoji ids.
 */
export function isValidEmojiId(emojiId, list = REACTION_LIST) {
  if (typeof emojiId !== 'string') return false
  if (!Array.isArray(list) || list.length === 0) return false
  return list.indexOf(emojiId) !== -1
}

/**
 * makeFloater(emojiId, opts)
 * ---------------------------
 * Builds a floater record. Pure.
 */
export function makeFloater(emojiId, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now()
  const lifetime = Number.isFinite(opts.lifetimeMs) ? opts.lifetimeMs : FLOATER_LIFETIME_MS
  const lane = pickLane(now)
  const idBase = (now | 0) ^ hashString(emojiId)
  return {
    id: 'r_' + Math.abs(idBase).toString(36),
    emojiId,
    lane,
    spawnedAt: now,
    expiresAt: now + lifetime
  }
}

/**
 * cullExpired(floaterList, now)
 * -----------------------------
 * Drops floaters whose expiresAt <= now. Pure.
 */
export function cullExpired(floaterList, now) {
  if (!Array.isArray(floaterList)) return []
  const t = Number.isFinite(now) ? now : Date.now()
  return floaterList.filter((f) => f && typeof f.expiresAt === 'number' && f.expiresAt > t)
}

/**
 * cullOldest(floaterList, max)
 * ----------------------------
 * Caps the array at `max` items, dropping oldest first. cap=0 (or
 * negative) returns empty. Pure.
 */
export function cullOldest(floaterList, max) {
  if (!Array.isArray(floaterList)) return []
  const rawCap = Number.isFinite(max) ? Math.floor(max) : 0
  const cap = rawCap > 0 ? rawCap : 0
  if (cap === 0) return []
  if (floaterList.length <= cap) return floaterList.slice()
  const sorted = floaterList.slice().sort((a, b) => {
    const sa = a && typeof a.spawnedAt === 'number' ? a.spawnedAt : 0
    const sb = b && typeof b.spawnedAt === 'number' ? b.spawnedAt : 0
    return sa - sb
  })
  return sorted.slice(-cap)
}

/**
 * applyRateLimit(now, history)
 * ----------------------------
 * Sliding-window rate limit. RATE_LIMIT_MAX_TRIGGERS per
 * RATE_LIMIT_WINDOW_MS. Returns { allowed, history }.
 */
export function applyRateLimit(now, history) {
  const t = Number.isFinite(now) ? now : Date.now()
  const safeHistory = Array.isArray(history)
    ? history.filter((x) => typeof x === 'number' && x > 0)
    : []
  const cutoff = t - RATE_LIMIT_WINDOW_MS
  const recent = safeHistory.filter((x) => x > cutoff)
  if (recent.length >= RATE_LIMIT_MAX_TRIGGERS) {
    return { allowed: false, history: recent }
  }
  recent.push(t)
  return { allowed: true, history: recent }
}

/**
 * defaultReactionState()
 * ----------------------
 * Fresh, frozen initial state for the reaction store.
 */
export function defaultReactionState() {
  const state = {
    floaters: [],
    cooldowns: [],
    muted: true,
    audioReady: false
  }
  return Object.freeze(state)
}

// --- internal ------------------------------------------------------------

function hashString(str) {
  if (typeof str !== 'string' || str.length === 0) return 0
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0
  }
  return h
}