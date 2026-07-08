import { useState } from 'react'
import useWagerStore from '../stores/wagerStore.js'
import {
  DEFAULT_WAGER_PCT,
  payoutOnWin
} from '../stores/wagerHelpers.js'
import WagerSlider from './WagerSlider.jsx'

/**
 * WagerOverlay
 * ------------
 * Modal-style centered overlay that blocks the question UI until the
 * student commits a wager. Spec requirement #4: "Modal-style centered,
 * blocking the question UI until committed."
 *
 * The overlay reads from `useWagerStore` directly and writes back via
 * its setters. It is purely presentational on top of the store: it
 * never holds its own wager state. The host should mount it before
 * rendering the question UI, or render it conditionally on a
 * "showWager" flag from the parent.
 *
 * Props:
 *   baseScore : number  -- current `baseScore` snapshot to display in
 *                          the payout preview. Required so the user can
 *                          see what each stop is worth.
 *   question  : question object  -- passed through to store on commit
 *   onCommit  : () => void  -- optional, fires AFTER lockWager succeeds
 *   onSkip    : () => void  -- optional, fires if the student picks 0%
 *                              (no risk) and chooses to skip the overlay
 *                              without committing. Disabled by default
 *                              (host decides via `allowSkip`).
 *   allowSkip : boolean  -- if true, a "No risk — skip" button is shown
 *
 * Returns `null` (renders nothing) once the wager is locked. The host
 * is responsible for showing the question UI underneath.
 *
 * The overlay does NOT try to talk to the back-end. It updates the
 * client-side store only.
 */
export function WagerOverlay({
  baseScore = 0,
  question = null,
  onCommit,
  onSkip,
  allowSkip = false
}) {
  const wagerPct = useWagerStore((s) => s.wagerPct)
  const locked = useWagerStore((s) => s.locked)
  const setWagerPct = useWagerStore((s) => s.setWagerPct)
  const lockWager = useWagerStore((s) => s.lockWager)
  const unlockWager = useWagerStore((s) => s.unlockWager)

  // Local UI-only state for the "Confirming…" press feedback.
  const [submitting, setSubmitting] = useState(false)

  if (locked) return null

  function handleChange(next) {
    setWagerPct(next)
  }

  function handleCommit() {
    if (submitting) return
    setSubmitting(true)
    try {
      const ok = lockWager()
      if (!ok) return
      if (typeof onCommit === 'function') {
        try { onCommit() } catch (_) { /* swallow */ }
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleUnlock() {
    unlockWager()
  }

  function handleSkip() {
    // Skip = commit at 0%. Make sure wagerPct is 0, then lock.
    setWagerPct(DEFAULT_WAGER_PCT)
    const ok = lockWager()
    if (ok && typeof onSkip === 'function') {
      try { onSkip() } catch (_) { /* swallow */ }
    }
  }

  const safeBase = Number.isFinite(baseScore) && baseScore > 0 ? baseScore : 0
  const projectedWin = payoutOnWin(safeBase, wagerPct)
  const showSkip = allowSkip

  return (
    <div
      className="wager-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wager-overlay-title"
      data-testid="wager-overlay"
    >
      <div
        className="wager-overlay__backdrop"
        aria-hidden="true"
      />
      <div className="wager-overlay__panel">
        <header className="wager-overlay__header">
          <h2 className="wager-overlay__title" id="wager-overlay-title">
            Lock your wager
          </h2>
          <p className="wager-overlay__subtitle">
            Pick your risk. Once locked, you can't change it for this question.
          </p>
        </header>

        <div className="wager-overlay__snapshot">
          <div className="wager-overlay__snapshot-label">Base score at question-start</div>
          <div className="wager-overlay__snapshot-value" data-testid="wager-base-score">
            {safeBase}
          </div>
        </div>

        <WagerSlider value={wagerPct} onChange={handleChange} />

        <div className="wager-overlay__preview" aria-live="polite">
          <div className="wager-overlay__preview-row">
            <span>Correct answer</span>
            <strong data-testid="wager-payout-win">+{projectedWin}</strong>
          </div>
          <div className="wager-overlay__preview-row wager-overlay__preview-row--muted">
            <span>Wrong / no answer</span>
            <strong data-testid="wager-payout-miss">-0 (lose base)</strong>
          </div>
        </div>

        <footer className="wager-overlay__footer">
          <button
            type="button"
            className="wager-overlay__button wager-overlay__button--primary"
            disabled={submitting}
            onClick={handleCommit}
            data-testid="wager-lock"
          >
            {submitting ? 'Locking…' : 'Lock wager'}
          </button>
          {showSkip && (
            <button
              type="button"
              className="wager-overlay__button wager-overlay__button--ghost"
              onClick={handleSkip}
              data-testid="wager-skip"
            >
              No risk — skip
            </button>
          )}
          <button
            type="button"
            className="wager-overlay__button wager-overlay__button--text"
            onClick={handleUnlock}
            data-testid="wager-unlock"
            disabled={wagerPct === DEFAULT_WAGER_PCT}
          >
            Reset to 0%
          </button>
        </footer>
      </div>
    </div>
  )
}

export default WagerOverlay