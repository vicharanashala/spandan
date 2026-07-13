import React from 'react'
import { PEER_ACCURACY_FLOOR, PEER_ACCURACY_WINDOW, meetsAccuracyFloor } from '../stores/peerReviewHelpers.js'

/**
 * AccuracyMeter
 * -------------
 * Small bar showing the user's rolling accuracy over the last
 * PEER_ACCURACY_WINDOW reviews. Greys out below the
 * PEER_ACCURACY_FLOOR.
 *
 * Props:
 *   rollingAccuracy: number 0..1
 *   rollingGradesCount: number (how many grades are in the window)
 *   meetsFloor: boolean (computed upstream; if omitted, computed here)
 */
export default function AccuracyMeter(props) {
  const accuracy = Number.isFinite(props && props.rollingAccuracy) ? props.rollingAccuracy : 0
  const count = Number.isFinite(props && props.rollingGradesCount) ? props.rollingGradesCount : 0
  const meets = typeof (props && props.meetsFloor) === 'boolean'
    ? props.meetsFloor
    : meetsAccuracyFloor(accuracy)

  const pct = Math.max(0, Math.min(100, Math.round(accuracy * 100)))
  const floorPct = Math.round(PEER_ACCURACY_FLOOR * 100)
  let meterClass = 'pr-accuracy__bar'
  if (!meets) meterClass += ' pr-accuracy__bar--below'

  return (
    <div className="pr-accuracy" data-testid="accuracy-meter">
      <div className="pr-accuracy__label">
        Peer accuracy: {pct}% ({count}/{PEER_ACCURACY_WINDOW})
      </div>
      <div className="pr-accuracy__track" data-testid="pr-accuracy-track">
        <div
          className={meterClass}
          style={{ width: pct + '%' }}
          data-testid="pr-accuracy-bar"
        />
        <div
          className="pr-accuracy__floor"
          style={{ left: floorPct + '%' }}
          data-testid="pr-accuracy-floor"
        />
      </div>
    </div>
  )
}