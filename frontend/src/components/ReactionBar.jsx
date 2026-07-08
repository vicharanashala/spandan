import { useEffect, useState } from 'react'
import useReactionStore from '../stores/reactionStore.js'
import {
  REACTION_LIST,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_TRIGGERS
} from '../stores/reactionHelpers.js'

/**
 * ReactionBar
 * -----------
 * Emoji picker row. Tapping an emoji fires `onReact(emojiId)` and
 * the host calls `useReactionStore.spawnFloater(emojiId)` which
 * appends to the ring buffer. The bar also visualises the rate-limit
 * cooldown so the user gets feedback when they hit the 5/sec cap.
 *
 * Audio: the first user gesture here is also where we unlock the
 * AudioContext (browser autoplay policy). We attempt unlock on every
 * tap but it only succeeds on the first one (idempotent).
 *
 * Props:
 *   onReact(emojiId)  -> optional override; if omitted, we call the
 *                       store's spawnFloater directly so the parent
 *                       doesn't need to wire anything.
 *
 * The bar is intentionally thin — presentational only. All
 * coordination lives in the store and helpers.
 */
export function ReactionBar({ onReact }) {
  const cooldowns = useReactionStore((s) => s.cooldowns)
  const muted = useReactionStore((s) => s.muted)
  const setMuted = useReactionStore((s) => s.setMuted)
  const audioReady = useReactionStore((s) => s.audioReady)
  const markAudioReady = useReactionStore((s) => s.markAudioReady)
  const spawnFloater = useReactionStore((s) => s.spawnFloater)

  const [now, setNow] = useState(() => Date.now())
  // Tick at 250ms so the cooldown indicator updates.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  const recentInWindow = Array.isArray(cooldowns)
    ? cooldowns.filter((t) => typeof t === 'number' && now - t < RATE_LIMIT_WINDOW_MS).length
    : 0
  const remaining = Math.max(0, RATE_LIMIT_MAX_TRIGGERS - recentInWindow)
  const isLimited = remaining === 0

  function fireEmoji(emojiId) {
    // Notify store that audio is unlocked on first tap (no-op after).
    if (!audioReady) markAudioReady()
    if (typeof onReact === 'function') {
      try { onReact(emojiId) } catch (_) { /* swallow */ }
    }
    spawnFloater(emojiId)
  }

  function toggleMuted() {
    setMuted(!muted)
  }

  return (
    <div className="reaction-bar" data-testid="reaction-bar" role="toolbar" aria-label="Emoji reactions">
      {REACTION_LIST.map((emoji) => {
        const disabled = isLimited
        return (
          <button
            key={emoji}
            type="button"
            className={
              'reaction-bar__emoji' +
              (disabled ? ' reaction-bar__emoji--disabled' : '')
            }
            aria-label={`React with ${emoji}`}
            disabled={disabled}
            onClick={() => fireEmoji(emoji)}
            data-testid={`reaction-emoji-${emoji}`}
          >
            <span className="reaction-bar__emoji-glyph">{emoji}</span>
          </button>
        )
      })}
      <button
        type="button"
        className={
          'reaction-bar__mute' +
          (muted ? ' reaction-bar__mute--muted' : ' reaction-bar__mute--on')
        }
        aria-label={muted ? 'Unmute hype audio' : 'Mute hype audio'}
        onClick={toggleMuted}
        data-testid="reaction-mute-toggle"
        title={muted ? 'Hype audio muted' : 'Hype audio on'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      {isLimited && (
        <span className="reaction-bar__cooldown" data-testid="reaction-cooldown">
          slow down…
        </span>
      )}
    </div>
  )
}

export default ReactionBar