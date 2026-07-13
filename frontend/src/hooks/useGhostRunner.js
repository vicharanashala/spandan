import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Ghost Runner timing rules
 * ------------------------
 * The runner sweeps a CSS transform: scaleX bar from 1 → 0 over the
 * question's allotted time. We use a small set of type-keyed defaults
 * for the cases where the backend sends no `timeToAnswer`:
 *
 *   - TF  (True/False)        -> 4500 ms  base
 *   - MCQ (single choice)     -> 15000 ms base
 *   - MSQ (multi-select)     -> 15000 ms base
 *
 * If the backend provides an explicit `timeToAnswer` (in seconds), we
 * always trust it. The "default" only applies as a fallback.
 */

export const GHOST_RUNNER_DEFAULTS_MS = Object.freeze({
  TF: 4500,
  MCQ: 15000,
  MSQ: 15000
})

/**
 * Pure: how long should the runner take, in milliseconds, for a given
 * question? Exported for direct unit testing without React.
 *
 * @param {object} question
 * @param {string} question.type
 * @param {number} [question.timeToAnswer] - seconds
 * @returns {number} ms
 */
export function computeGhostDuration(question) {
  if (!question || typeof question !== 'object') {
    return GHOST_RUNNER_DEFAULTS_MS.MCQ
  }
  if (Number.isFinite(question.timeToAnswer) && question.timeToAnswer > 0) {
    return Math.round(question.timeToAnswer * 1000)
  }
  const t = typeof question.type === 'string' ? question.type.toUpperCase() : 'MCQ'
  return GHOST_RUNNER_DEFAULTS_MS[t] || GHOST_RUNNER_DEFAULTS_MS.MCQ
}

/**
 * Pure: stable key used to force a remount/animation reset when the
 * question changes. Exported for testing.
 */
export function ghostRunnerKey(question) {
  if (!question) return 'ghost:none'
  if (question._id) return `ghost:${question._id}`
  if (question.id) return `ghost:${question.id}`
  return `ghost:${question.type || 'MCQ'}:${question.question || 'no-text'}`
}

/**
 * Pure: clamped progress fraction in [0, 1] given elapsed and total.
 * Exported for testing.
 */
export function ghostProgress(elapsedMs, totalMs) {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(totalMs) || totalMs <= 0) {
    return 1
  }
  const p = elapsedMs / totalMs
  if (p < 0) return 1
  if (p > 1) return 0
  return 1 - p
}

/**
 * The hook. Subscribes to a question and returns the values the
 * <GhostRunnerTrack /> component needs to render.
 *
 *   - durationMs : total sweep time
 *   - progress   : 1 → 0, suitable for transform: scaleX
 *   - running    : false once the runner has expired
 *   - key        : stable string to key the element off the question
 *   - reset      : bump the animation (called automatically on question
 *                  change, exposed for manual re-trigger)
 */
export function useGhostRunner(question, { tickMs = 33 } = {}) {
  const durationMs = useMemo(() => computeGhostDuration(question), [question])
  const key = useMemo(() => ghostRunnerKey(question), [question])

  const [progress, setProgress] = useState(() =>
    ghostProgress(0, durationMs)
  )
  const [running, setRunning] = useState(Boolean(question))

  const startedAtRef = useRef(null)
  const rafRef = useRef(0)

  useEffect(() => {
    if (!question) {
      setProgress(1)
      setRunning(false)
      return undefined
    }
    startedAtRef.current =
      typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now()
    setProgress(1)
    setRunning(true)

    const tick = () => {
      const start = startedAtRef.current
      if (start == null) return
      const now =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now()
      const elapsed = now - start
      const p = ghostProgress(elapsed, durationMs)
      setProgress(p)
      if (p <= 0) {
        setRunning(false)
        return
      }
      rafRef.current = window.setTimeout(tick, tickMs)
    }
    rafRef.current = window.setTimeout(tick, tickMs)

    return () => {
      if (rafRef.current) {
        window.clearTimeout(rafRef.current)
        rafRef.current = 0
      }
    }
  }, [key, durationMs, tickMs, question])

  return { durationMs, progress, running, key }
}

export default useGhostRunner
