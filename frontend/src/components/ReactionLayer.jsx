import { useEffect, useState } from 'react'
import useReactionStore from '../stores/reactionStore.js'
import ReactionFloater from './ReactionFloater.jsx'
import { LANE_COUNT } from '../stores/reactionHelpers.js'

/**
 * ReactionLayer
 * -------------
 * Full-viewport overlay that renders all current emoji floaters.
 * pointer-events: none so it never blocks underlying UI. Also runs
 * a 250ms `tickCull` interval to drop expired floaters.
 *
 * Mount this once at the top of the room page. The CSS positions
 * floaters via `transform: translateY` + lane `translateX` and
 * applies a single `@keyframes float-up` animation per floater.
 */
export function ReactionLayer() {
  const floaters = useReactionStore((s) => s.floaters)
  const tickCull = useReactionStore((s) => s.tickCull)
  const [tick, setTick] = useState(0)

  // Drive a re-render every 250ms so floaters visually advance; also
  // prune the buffer of any floaters whose expiresAt slipped past
  // (e.g. the tab was throttled).
  useEffect(() => {
    const id = setInterval(() => {
      tickCull(Date.now())
      setTick((n) => n + 1)
    }, 250)
    return () => clearInterval(id)
  }, [tickCull])

  const safeList = Array.isArray(floaters) ? floaters : []

  return (
    <div
      className="reaction-layer"
      data-testid="reaction-layer"
      data-lane-count={LANE_COUNT}
      aria-hidden="true"
    >
      {safeList.map((f) => (
        <ReactionFloater key={f && f.id} floater={f} />
      ))}
    </div>
  )
}

export default ReactionLayer