/**
 * Modifier Card Engine — pure helpers
 * ------------------------------------
 * Stateless math for the modifier system. Kept in a separate file so
 * that the zustand store can import them with a single default-or-
 * named import pattern (avoids mixed-import pitfalls under babel-jest).
 */

export const MODIFIER_IDS = Object.freeze([
  'fiftyFifty',
  'timeFreeze',
  'peek',
  'clearActive'
])

export const MODIFIER_META = Object.freeze({
  fiftyFifty: {
    id: 'fiftyFifty',
    label: '50 / 50',
    description: 'Halve the option list to two deterministic choices.',
    icon: '✂️'
  },
  timeFreeze: {
    id: 'timeFreeze',
    label: 'Time Freeze',
    description: 'Pause the countdown for 5 seconds.',
    icon: '⏸️'
  },
  peek: {
    id: 'peek',
    label: 'Peek',
    description: 'Reveal the correct option(s) for 3 seconds.',
    icon: '👁️'
  },
  clearActive: {
    id: 'clearActive',
    label: 'Clear Choice',
    description: 'Clear your currently-selected options.',
    icon: '↩️'
  }
})

export const TIME_FREEZE_MS = 5000
export const PEEK_MS = 3000

/**
 * Pure: build the default per-question hand. Exported for testing.
 */
export function defaultHand() {
  return Object.freeze({
    fiftyFifty: 1,
    timeFreeze: 1,
    peek: 1,
    clearActive: 1
  })
}

/**
 * Pure: identify whose question-id we're on. Stable for null/undefined.
 */
export function activeQuestionId(question) {
  if (!question || typeof question !== 'object') return ''
  return question._id || question.id || ''
}

/**
 * Pure: pure reducer-like helper that returns the next hand after
 * `consume` of `id`. Exported so effect modules can reuse the math
 * without importing the store.
 */
export function consumeHand(hand, id) {
  const next = { ...(hand || defaultHand()) }
  if (typeof next[id] !== 'number') return next
  if (next[id] <= 0) return next
  next[id] = next[id] - 1
  return next
}

/**
 * Pure: refund one charge when an effect is unplayed (e.g. Peek ending).
 */
export function refundHand(hand, id, owned = 1) {
  const next = { ...(hand || defaultHand()) }
  if (typeof next[id] !== 'number') {
    next[id] = 0
  }
  const cap = Number.isFinite(owned) && owned > 0 ? owned : 1
  if (next[id] < cap) next[id] = next[id] + 1
  return next
}
