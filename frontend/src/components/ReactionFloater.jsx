import { useEffect, useRef } from 'react'
import useReactionStore from '../stores/reactionStore.js'
import { FLOATER_LIFETIME_MS } from '../stores/reactionHelpers.js'
import hype from '../utils/hype.js'

/**
 * ReactionFloater
 * ---------------
 * Single animated emoji that rises across one of 5 horizontal lanes
 * and fades out at end of life. Pure presentational: receives a
 * floater record from the parent and self-expires when its time is up.
 *
 * The actual visual animation is CSS-driven (keyframes in
 * `reactions.css`). This component only:
 *   1. Renders the glyph in the right lane.
 *   2. Plays the hype blip ONCE at mount (if audio unmuted).
 *   3. Fires `onExpire(id)` once the lifetime elapses, so the parent
 *      can remove it from the store and free the ring-buffer slot.
 */
export function ReactionFloater({ floater }) {
  const expireFloater = useReactionStore((s) => s.expireFloater)
  const muted = useReactionStore((s) => s.muted)
  const audioReady = useReactionStore((s) => s.audioReady)
  const firedRef = useRef(false)

  // Schedule expiry. We use the floater's own expiresAt so test
  // clocks and Date.now() advances are handled identically.
  useEffect(() => {
    if (!floater || typeof floater.id !== 'string') return
    const now = Date.now()
    const ms = Math.max(0, floater.expiresAt - now)
    const id = setTimeout(() => {
      expireFloater(floater.id)
    }, ms)
    return () => clearTimeout(id)
  }, [floater && floater.id, expireFloater, floater && floater.expiresAt])

  // Fire audio exactly once at mount (or when emoji/audio state flips).
  useEffect(() => {
    if (firedRef.current) return
    if (!floater || typeof floater.emojiId !== 'string') return
    if (muted || !audioReady) return
    firedRef.current = true
    try {
      hype.playHypeBlip(floater.emojiId)
    } catch (_) { /* swallow */ }
  }, [floater && floater.emojiId, muted, audioReady])

  if (!floater || typeof floater.emojiId !== 'string') return null

  const lane = Number.isFinite(floater.lane) ? floater.lane : 0
  const styleVars = {
    '--reaction-lane': lane,
    '--reaction-lifetime-ms': FLOATER_LIFETIME_MS + 'ms'
  }

  return (
    <span
      className="reaction-floater"
      data-testid="reaction-floater"
      data-lane={lane}
      style={styleVars}
      aria-hidden="true"
    >
      <span className="reaction-floater__glyph">{floater.emojiId}</span>
    </span>
  )
}

export default ReactionFloater