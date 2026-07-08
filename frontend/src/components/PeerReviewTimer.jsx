import React from 'react'
import { remainingMs, PEER_DURATION_CAP_MS, PEER_GHOST_FALLBACK_MS } from '../stores/peerReviewHelpers.js'

/**
 * PeerReviewTimer
 * ---------------
 * Linear countdown bar for the 90s round. Colour flips to red below
 * 10s. Ghost-mode badge appears when isGhostMode is true.
 *
 * Props:
 *   elapsedMs: number (time since round start)
 *   isGhostMode: boolean
 *   roundExpired: boolean
 */
export default function PeerReviewTimer(props) {
  const elapsed = Number.isFinite(props && props.elapsedMs) ? props.elapsedMs : 0
  const ghost = Boolean(props && props.isGhostMode)
  const expired = Boolean(props && props.roundExpired)

  const left = remainingMs(elapsed)
  const ratio = Math.max(0, Math.min(1, left / PEER_DURATION_CAP_MS))
  const widthPct = Math.round(ratio * 100)

  const seconds = Math.ceil(left / 1000)
  const isCritical = left <= 10000 && left > 0

  let barClass = 'pr-timer__bar'
  if (isCritical) barClass += ' pr-timer__bar--critical'
  if (expired) barClass += ' pr-timer__bar--expired'

  let label = 'Peer review: ' + seconds + 's left'
  if (ghost) label = 'Ghost mode: ' + seconds + 's left'
  if (expired) label = 'Round expired'

  return (
    <div className="pr-timer" data-testid="peer-review-timer">
      <div className="pr-timer__label">{label}</div>
      <div className="pr-timer__track" data-testid="pr-timer-track">
        <div
          className={barClass}
          style={{ width: widthPct + '%' }}
          data-testid="pr-timer-bar"
        />
      </div>
      {ghost && (
        <span className="pr-timer__badge" data-testid="pr-timer-ghost-badge">
          ghost
        </span>
      )}
    </div>
  )
}

export { PEER_DURATION_CAP_MS, PEER_GHOST_FALLBACK_MS }