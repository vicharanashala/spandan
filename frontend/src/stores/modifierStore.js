import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  MODIFIER_IDS,
  defaultHand,
  activeQuestionId,
  consumeHand,
  refundHand
} from './modifierHelpers.js'

/**
 * Modifier Card Engine (store)
 * ----------------------------
 * A per-tab Zustand store that tracks the player's hand of "modifier
 * cards" during a live poll. Each modifier grants a special power that
 * the student can fire once per question (one charge each). Cards reset
 * when the question changes.
 *
 *   fiftyFifty   — collapse the option list to exactly 2 deterministic
 *                  choices (1 correct + 1 representative wrong).
 *   timeFreeze   — pause the timer for 5 seconds. Once per question.
 *   peek         — temporarily reveal the correct option(s) for 3
 *                  seconds. No scoring impact; information only.
 *   clearActive  — clear the student's currently-selected options, so
 *                  they can re-pick. No refund on use; only `unplay`
 *                  refunds a charge.
 *
 * The pure helpers (`MODIFIER_IDS`, `MODIFIER_META`, `defaultHand`,
 * `consumeHand`, `refundHand`, `activeQuestionId`, constants) live in
 * `./modifierHelpers.js` and are NOT re-exported here on purpose — see
 * that file's header. This module only exports the zustand hook as
 * the default export plus a test-only reset function.
 */

const initialState = () => ({
  // Persistent across sessions — how many of each card the player
  // owns in their deck. Volatile per-question state is below.
  owned: {
    fiftyFifty: 1,
    timeFreeze: 1,
    peek: 1,
    clearActive: 1
  },
  // Per-question hand: charges remaining for each card. Reset on
  // question transition.
  hand: defaultHand(),
  // The question id that the current `hand` corresponds to.
  questionId: '',
  // Time-Freeze state
  timeFrozen: false,
  timeFrozenAt: 0,
  // Peek state
  peekActive: false,
  peekExpiresAt: 0,
  // 50/50 state — which option indices are eligible (always 2 if on).
  fiftyFiftyOptionMask: null,
  // Clear-Active state — the option indices that were removed, so the
  // store knows what to restore when "unplayed".
  clearActiveRemoved: null,
  // Deck visibility
  deckOpen: false
})

const useModifierStore = create(
  persist(
    (set, get) => ({
      ...initialState(),

      /**
       * Reset the per-question hand to defaults and zero out effect
       * state. Called by `useQuestionLifecycle` when the question
       * transitions.
       */
      resetForQuestion(question) {
        const qid = activeQuestionId(question)
        const next = initialState()
        // Preserve owned (persistent), zero transient flags.
        next.owned = { ...get().owned }
        next.hand = defaultHand()
        next.questionId = qid
        set(next)
      },

      /**
       * Consume one charge of `id`. Returns `{ ok, reason }`.
       */
      consume(id) {
        const { hand, questionId } = get()
        if (!questionId) return { ok: false, reason: 'no-question' }
        if (!MODIFIER_IDS.includes(id)) {
          return { ok: false, reason: 'unknown-modifier' }
        }
        if (!hand || hand[id] <= 0) {
          return { ok: false, reason: 'no-charges' }
        }
        const nextHand = consumeHand(hand, id)
        set({ hand: nextHand })
        return { ok: true }
      },

      /**
       * Refund one charge when an effect unplays (Peek fading,
       * Time-Freeze expiring with no impact, etc.).
       */
      refund(id) {
        const { hand, owned } = get()
        const cap = owned && Number.isFinite(owned[id]) ? owned[id] : 1
        const nextHand = refundHand(hand, id, cap)
        set({ hand: nextHand })
      },

      /**
       * Toggle the deck overlay visibility.
       */
      toggleDeck() {
        set((s) => ({ deckOpen: !s.deckOpen }))
      },
      openDeck() {
        set({ deckOpen: true })
      },
      closeDeck() {
        set({ deckOpen: false })
      },

      // ------ per-effect setters used by /effects/* modules ----------

      setTimeFrozen(active, at = Date.now()) {
        set({ timeFrozen: !!active, timeFrozenAt: at })
      },
      setPeekActive(active, expiresAt = Date.now() + 3000) {
        set({ peekActive: !!active, peekExpiresAt: expiresAt })
      },
      setFiftyFiftyMask(optionIndices) {
        set({
          fiftyFiftyOptionMask: Array.isArray(optionIndices)
            ? optionIndices.slice()
            : null
        })
      },
      setClearActiveRemoved(removedIndices) {
        set({
          clearActiveRemoved: Array.isArray(removedIndices)
            ? removedIndices.slice()
            : null
        })
      },

      // ------ persistent "inventory" getters ------------------------

      grantOwned(id, count = 1) {
        if (!MODIFIER_IDS.includes(id)) return
        set((s) => {
          const next = { ...(s.owned || {}) }
          next[id] = (next[id] || 0) + count
          return { owned: next }
        })
      }
    }),
    {
      name: 'spandan-modifiers',
      // Persist only the persistent inventory. Everything else is
      // transient and gets re-seeded on question transition.
      partialize: (state) => ({ owned: state.owned })
    }
  )
)

// Test-only escape hatch: reset the entire store to factory state.
// Not exported in `index.js` re-exports — only via this module so the
// store UI never accidentally calls it.
//
// IMPORTANT: we must NOT pass `true` (replace) to setState, because
// that would wipe the methods defined in the state creator. We merge
// instead.
export function _resetModifierStoreForTests() {
  useModifierStore.setState(initialState())
}

export default useModifierStore