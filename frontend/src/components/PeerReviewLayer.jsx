import React, { useEffect, useState } from 'react'
import { usePeerReviewStore } from '../stores/peerReviewStore.js'
import PeerReviewPanel from './PeerReviewPanel.jsx'

/**
 * PeerReviewLayer
 * ---------------
 * Full-viewport overlay that hosts the PeerReviewPanel when the
 * store status is anything other than 'idle'. Manages the
 * elapsedMs counter via setInterval (100ms granularity) and
 * auto-pumps tickRound() so ghost-mode and expiry fire correctly.
 *
 * Props:
 *   enabled: boolean — if false, the overlay never renders.
 *   onSubmit: (grade, accuracy) => void
 *   onCancel: () => void
 */
export default function PeerReviewLayer(props) {
  const status = usePeerReviewStore(function (s) { return s.status })
  const startedAt = usePeerReviewStore(function (s) { return s.startedAt })
  const tickRound = usePeerReviewStore(function (s) { return s.tickRound })

  const [elapsedMs, setElapsedMs] = useState(0)

  const enabled = Boolean(props && props.enabled)
  const onSubmit = typeof (props && props.onSubmit) === 'function' ? props.onSubmit : function () {}
  const onCancel = typeof (props && props.onCancel) === 'function' ? props.onCancel : function () {}

  useEffect(function () {
    if (!enabled) return undefined
    if (status === 'idle' || status === 'submitted' || status === 'expired') {
      setElapsedMs(0)
      return undefined
    }
    if (!Number.isFinite(startedAt) || startedAt <= 0) {
      setElapsedMs(0)
      return undefined
    }
    function loop() {
      const now = Date.now()
      const e = Math.max(0, now - startedAt)
      setElapsedMs(e)
      tickRound(e)
    }
    loop()
    const id = setInterval(loop, 100)
    return function cleanup() { clearInterval(id) }
  }, [enabled, status, startedAt, tickRound])

  const shouldRender = enabled && status !== 'idle'

  if (!shouldRender) return null

  return (
    <div className="pr-layer" data-testid="peer-review-layer" role="dialog" aria-modal="true">
      <div className="pr-layer__backdrop" />
      <div className="pr-layer__content">
        <PeerReviewPanel
          elapsedMs={elapsedMs}
          onSubmit={onSubmit}
          onCancel={onCancel}
          disabled={false}
        />
      </div>
    </div>
  )
}