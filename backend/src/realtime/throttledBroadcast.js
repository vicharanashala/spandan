// Per-key throttled/debounced broadcaster.
//
// Why this exists (the actual root cause of "it breaks at 800+ people"):
// A broadcast like `io.to(roomCode).emit(...)` fans out to every socket in
// the room. If you call that broadcast once per *incoming* event, and the
// number of incoming events also scales with room size (every student
// joining, every student answering), you get O(n) events x O(n) fanout =
// O(n^2) messages. At 800 people that's already ~640,000 socket writes for
// a single question; at 3000 it's ~9,000,000 - which is what pegs the event
// loop, blocks the process, and cascades into disconnects/reconnect storms.
//
// The fix is to decouple "how often clients are notified" from "how often
// the underlying event fires": collapse bursts into a bounded number of
// broadcasts per room using trailing-edge debounce with a max-wait so
// updates are still guaranteed to flush regularly even under continuous load.

export function createThrottledBroadcaster({ intervalMs, maxWaitMs = intervalMs * 3 }) {
  const timers = new Map() // key -> timeout handle
  const firstQueuedAt = new Map() // key -> timestamp

  return {
    /**
     * Schedule `flush(key)` to run soon. Multiple calls within the window
     * collapse into a single flush call.
     */
    schedule(key, flush) {
      if (timers.has(key)) return // already scheduled, will pick up latest state when it fires

      const startedAt = firstQueuedAt.get(key) || Date.now()
      firstQueuedAt.set(key, startedAt)
      const elapsed = Date.now() - startedAt
      const delay = Math.min(intervalMs, Math.max(0, maxWaitMs - elapsed))

      const timer = setTimeout(() => {
        timers.delete(key)
        firstQueuedAt.delete(key)
        flush(key)
      }, delay)
      timer.unref?.()
      timers.set(key, timer)
    },

    cancel(key) {
      const timer = timers.get(key)
      if (timer) clearTimeout(timer)
      timers.delete(key)
      firstQueuedAt.delete(key)
    }
  }
}
