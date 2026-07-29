import React, { useEffect, useRef } from 'react'

// Lazily load the YouTube IFrame Player API exactly once, shared across all players on the page.
let apiReadyPromise = null
function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT)
  if (apiReadyPromise) return apiReadyPromise
  apiReadyPromise = new Promise((resolve) => {
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    const first = document.getElementsByTagName('script')[0]
    first.parentNode.insertBefore(tag, first)
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev()
      resolve(window.YT)
    }
  })
  return apiReadyPromise
}

// Pull the 11-char video id out of watch / live / embed / youtu.be URLs.
export function extractYouTubeId(url) {
  if (!url) return null
  const m = String(url).match(
    /(?:youtube\.com\/(?:watch\?v=|live\/|embed\/)|youtu\.be\/)([\w-]{11})/
  )
  return m ? m[1] : null
}

/**
 * Thin wrapper around a YouTube IFrame player.
 * - `controls`: show native controls (teacher = true).
 * - `onReady` receives the player instance; `playerRef` is also populated with it.
 * - `onPlay` / `onPause` / `onEnd` fire on the matching player state changes.
 */
const YouTubeVideo = ({
  videoId,
  controls = true,
  noForwardSeek = false,
  seekCeilingRef,
  capSuppressUntilRef,
  onReady,
  onPlay,
  onPause,
  onEnd,
  onLiveStatus,
  playerRef
}) => {
  const mountRef = useRef(null)
  const instanceRef = useRef(null)
  const liveRef = useRef(false)
  // The player is created once, so its event handlers would otherwise capture stale closures.
  // Keep the latest callbacks in a ref and always invoke through it.
  const cbRef = useRef({})
  useEffect(() => {
    cbRef.current = { onReady, onPlay, onPause, onEnd }
  })

  useEffect(() => {
    let cancelled = false
    if (!videoId || !mountRef.current) return

    // YT replaces this inner node with an <iframe>; the outer wrapper stays React-owned.
    const host = document.createElement('div')
    mountRef.current.appendChild(host)

    loadYouTubeAPI().then((YT) => {
      if (cancelled) return
      instanceRef.current = new YT.Player(host, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { controls: controls ? 1 : 0, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: (e) => {
            if (playerRef) playerRef.current = e.target
            cbRef.current.onReady && cbRef.current.onReady(e.target)
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) cbRef.current.onPlay && cbRef.current.onPlay(e.target)
            else if (e.data === YT.PlayerState.PAUSED) cbRef.current.onPause && cbRef.current.onPause(e.target)
            else if (e.data === YT.PlayerState.ENDED) cbRef.current.onEnd && cbRef.current.onEnd(e.target)
          }
        }
      })
    })

    return () => {
      cancelled = true
      try { instanceRef.current && instanceRef.current.destroy() } catch (e) { /* already gone */ }
      instanceRef.current = null
      if (playerRef) playerRef.current = null
    }
  }, [videoId, controls])

  // No-forward-seek guard (students): allow pause + rewind, block seeking past the furthest point
  // already watched. YouTube has no "seek attempted" event, so we poll and revert forward jumps.
  useEffect(() => {
    if (!noForwardSeek) return
    const id = setInterval(() => {
      const p = instanceRef.current
      if (!p || typeof p.getCurrentTime !== 'function') return
      // Briefly suspended right after a poll resume (live-edge jump) so we don't snap the student
      // backward before the teacher's fresh position broadcast arrives.
      if (capSuppressUntilRef?.current && performance.now() < capSuppressUntilRef.current) return
      const info = seekCeilingRef?.current
      if (!info || !Number.isFinite(info.time)) return // no teacher frontier yet — don't cap
      // Ceiling = the teacher's CURRENT position: their last reported time, extrapolated forward
      // while they are playing (the broadcast is periodic). Students may rewind freely but cannot
      // move past the teacher — by seeking OR by natural playback. Applies to live too, with a wider
      // tolerance to absorb the buffer-latency difference between the two players' live edges.
      let ceiling = info.time
      if (info.playing) ceiling += (performance.now() - info.at) / 1000
      const tol = liveRef.current ? 2.5 : 0.75
      const t = p.getCurrentTime()
      if (t > ceiling + tol) {
        p.seekTo(ceiling, true)
      }
    }, 250)
    return () => clearInterval(id)
  }, [noForwardSeek, videoId])

  // Detect whether this is a live stream. getProgressState() is undocumented and returns undefined on
  // some players (observed on watch?v= live URLs), so we can't rely on it. Fallback: sample
  // getDuration() — for a live stream it GROWS in real time (the live edge advances ~1s per wall-clock
  // second, even while paused), for a recorded video it's constant. Detection is sticky once true, so a
  // paused/frozen-duration live stream doesn't flap back to "not live".
  useEffect(() => {
    let last = null
    let prevDur = null
    const id = setInterval(() => {
      const p = instanceRef.current
      if (!p) return
      let isLive = false
      try {
        const ps = typeof p.getProgressState === 'function' ? p.getProgressState() : null
        if (ps && typeof ps.isLive === 'boolean') {
          isLive = ps.isLive
        } else if (typeof p.getDuration === 'function') {
          const d = p.getDuration()
          // Steady ~1s/s growth = live. Exclude the one-off 0→fullDuration metadata jump of a
          // recorded video (a big leap) and any seek by bounding the per-tick increment.
          if (prevDur != null && d > prevDur + 0.3 && d < prevDur + 5) isLive = true
          prevDur = d
        }
      } catch (e) { /* ignore */ }
      if (last === true) isLive = true // sticky: never revert a confirmed live stream
      if (isLive !== last) {
        last = isLive
        liveRef.current = isLive
        onLiveStatus && onLiveStatus(isLive)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [videoId])

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      aspectRatio: '16 / 9',
      background: '#000',
      borderRadius: '10px',
      overflow: 'hidden'
    }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  )
}

export default YouTubeVideo
