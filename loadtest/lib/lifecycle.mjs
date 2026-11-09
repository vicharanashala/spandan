// Run lifecycle helpers for run.mjs: how a run ended, and a shutdown that always finishes.
// Pure (no sockets or I/O of their own), so they are unit-tested.

/** 'failed' (an error stopped the run) wins over 'aborted' (Ctrl+C); otherwise 'completed'. */
export function runStatus({ aborted = false, failure = null } = {}) {
  return failure ? 'failed' : aborted ? 'aborted' : 'completed'
}

/** The error that stopped a run, trimmed for the result file (never a stack trace). */
export function failureInfo(err, phase) {
  return { phase: String(phase), message: String(err?.message || err || 'unknown error').slice(0, 300) }
}

/**
 * Wait for `promises` to settle, but at most `ms`. Resolves { timedOut, pending } where pending is
 * how many had not settled. Never rejects; its timer is unref'd, so it never holds the process open.
 */
export function settleWithin(promises, ms) {
  let settled = 0
  const tracked = promises.map(p => Promise.resolve(p).then(() => { settled++ }, () => { settled++ }))
  return Promise.race([
    Promise.all(tracked).then(() => ({ timedOut: false, pending: 0 })),
    new Promise(resolve => setTimeout(() => resolve({ timedOut: true, pending: promises.length - settled }), ms).unref())
  ])
}

/**
 * Run every step in order, even when an earlier one throws, so one failing step (e.g. ending the room
 * on a backend that just went down) can never skip closing sockets, timers or monitors after it.
 * Returns the errors as { step, message }.
 */
export async function runSteps(steps) {
  const errors = []
  for (const [step, fn] of steps) {
    try {
      await fn()
    } catch (err) {
      errors.push({ step, message: String(err?.message || err).slice(0, 200) })
    }
  }
  return errors
}
