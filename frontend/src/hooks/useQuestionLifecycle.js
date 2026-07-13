import { useCallback, useEffect, useRef, useState } from 'react'
import useModifierStore from '../stores/modifierStore.js'

/**
 * useQuestionLifecycle
 * --------------------
 * Glue hook that fires side-effects when the active question changes.
 * It is intentionally *not* the source of question state — the host
 * component (e.g. StudentRoomPage) owns the question via its own
 * useState, and passes the current `question` object to this hook.
 *
 * On every question id transition the hook:
 *
 *   1. Resets the per-question hand in `modifierStore` (re-deals the
 *      deck, clears all transient effect flags).
 *   2. Closes the modifier deck overlay (the panel that was open for
 *      the previous question no longer makes sense).
 *   3. Bumps a counter so the host can react to a "fresh question"
 *      animation, sound, or HMR-style forced remount.
 *
 * It is a thin adapter — the modifier card engine stores all the
 * lifecycle state; this hook is the trigger.
 *
 * Inputs:
 *
 *   question      — current question object, or null. The hook reads
 *                   `_id` first, then `id`, then a fallback string
 *                   built from `type` and `question` text.
 *   options.onReset(prevId, nextId, question)
 *                 — optional callback fired after the modifier store
 *                   has been reset. Useful for parent components
 *                   that want to play a transition animation.
 *   options.enabled
 *                 — boolean (default true). When false the hook does
 *                   nothing. Lets parents temporarily disable auto-reset.
 *   options.resetOnMount
 *                 — boolean (default true). When true, the very first
 *                   non-null question is treated as a transition from
 *                   "no question" and the modifier store is reset.
 *                   When false, the first non-null question leaves the
 *                   store alone (useful when the store was just seeded
 *                   by a server `prepare_poll` frame).
 *
 * Returns:
 *
 *   {
 *     questionId    : string  (currently active question id),
 *     prevQuestionId: string  (id active before the last transition,
 *                              empty string at startup),
 *     transitionCount: number (increments on every transition),
 *     resetNow      : () => void  (force-reset without waiting for a
 *                                  transition).
 *   }
 */

/**
 * Pure: stable id read for a question.
 */
export function getQuestionId(question) {
  if (!question || typeof question !== 'object') return ''
  return question._id || question.id || ''
}

/**
 * Pure: did the question id change between two renders?
 * Coerces non-string inputs to empty string before comparing.
 */
export function didQuestionChange(prev, next) {
  if (typeof prev !== 'string') prev = ''
  if (typeof next !== 'string') next = ''
  return prev !== next
}

/**
 * Pure: pick the next `prevQuestionId` value.
 * If the id changed, prev becomes the id we last saw; otherwise prev
 * stays the same.
 */
export function nextPrevId(currentPrev, lastId, newId) {
  if (lastId === newId) return currentPrev
  return lastId
}

const DEFAULT_OPTIONS = Object.freeze({
  enabled: true,
  resetOnMount: true,
  onReset: null
})

export function useQuestionLifecycle(question, options) {
  const opts = { ...DEFAULT_OPTIONS, ...(options || {}) }

  const questionId = getQuestionId(question)
  const store = useModifierStore

  // The id we saw on the previous render. Used to detect transitions.
  const lastIdRef = useRef('')
  // The id that was active *before* the last transition.
  const [prevQuestionId, setPrevQuestionId] = useState('')
  // Bumps every time we fire a transition reset.
  const [transitionCount, setTransitionCount] = useState(0)
  // Mirrors the latest question id, so consumers can read it from
  // the returned object without depending on the prop.
  const [, setActiveId] = useState(questionId)

  // Force-reset helper. Errors from the store are caught and logged so
  // the host component is never broken by a throwing resetter.
  const resetNow = useCallback(() => {
    try {
      store.getState().resetForQuestion(question)
      store.getState().closeDeck()
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[useQuestionLifecycle] resetNow failed', err)
      }
    }
    setTransitionCount((n) => n + 1)
  }, [store, question])

  useEffect(() => {
    if (!opts.enabled) return
    const prevId = lastIdRef.current
    const newId = questionId

    // v2: separate "first observation" from "real transition".
    //   - firstObservation: lastIdRef.current === '' -- we've never
    //     recorded an id yet (component just mounted, or store was
    //     just reset by resetNow).
    //   - realTransition:  !firstObservation && prevId !== newId --
    //     we've already recorded a real id and now it differs.
    //   - firstMountReset: firstObservation && newId !== '' &&
    //     opts.resetOnMount -- first non-null render, treated as a
    //     transition only when the caller opts in.
    const isFirstObservation = prevId === ''
    const isRealTransition = !isFirstObservation && prevId !== newId
    const isFirstMountReset =
      isFirstObservation && newId !== '' && opts.resetOnMount
    const shouldFire = isRealTransition || isFirstMountReset

    if (shouldFire) {
      setPrevQuestionId((p) => nextPrevId(p, prevId, newId))
      setTransitionCount((n) => n + 1)
      setActiveId(newId)

      try {
        store.getState().resetForQuestion(question)
        store.getState().closeDeck()
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[useQuestionLifecycle] reset failed', err)
        }
      }
      if (typeof opts.onReset === 'function') {
        try {
          opts.onReset(prevId, newId, question)
        } catch (err) {
          if (typeof console !== 'undefined' && console.error) {
            console.error('[useQuestionLifecycle] onReset threw', err)
          }
        }
      }
    } else {
      // No transition; keep activeId in sync.
      setActiveId(newId)
    }

    // Always remember the last id we observed so the next render
    // can correctly decide whether it's a real transition.
    lastIdRef.current = newId
    // We intentionally only depend on `questionId` and `opts.enabled`.
    // Re-firing the effect on every prop change of the question object
    // would re-trigger resets spuriously when the host rebuilds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, opts.enabled])

  return {
    questionId,
    prevQuestionId,
    transitionCount,
    resetNow
  }
}

export default useQuestionLifecycle