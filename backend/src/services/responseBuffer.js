// Fix 3b (Stage 2) — OPTIONAL, env-gated write-buffering for POST /responses. DEFAULT OFF.
//
// When RESPONSE_BATCH=on, student answers are held briefly in memory and written in BATCHES via
// insertMany, instead of one save() per answer. Under a synchronized burst (hundreds of answers in
// a second) this collapses many individual inserts into a few bulk writes, cutting event-loop and
// DB round-trip pressure so the loop stays free to deliver the next question's broadcast.
//
// WHY IT IS OFF BY DEFAULT (the trade-offs — see also the kill-switch note in the route):
//   1. Durability window: answers buffered but not yet flushed are LOST if the process dies mid-
//      window (crash/OOM/hard-kill). A graceful shutdown (SIGTERM/SIGINT, as pm2 restart sends)
//      flushes first, but a hard crash cannot. The default save() path has no such window.
//   2. Read-after-write lag: a just-buffered answer isn't queryable for up to one flush interval,
//      so a student's own results view and the live counts/leaderboard can lag briefly.
//
// WHAT IS NOT AT RISK: dedup and no-double-scoring are still guaranteed by the unique index
// {roomId,questionId,studentId}. insertMany({ordered:false}) inserts the first of any duplicate
// and the DB rejects the rest with E11000 — identical dedup outcome to the save() path. Points and
// responseTime are computed in the route BEFORE buffering, so scoring is unaffected either way.

let ResponseModel = null
const FLUSH_MS = Number(process.env.RESPONSE_FLUSH_MS) || 250
const FLUSH_MAX = Number(process.env.RESPONSE_FLUSH_MAX) || 500

let buffer = []
let flushTimer = null
let shutdownHooked = false

export function isBatchEnabled() {
  return (process.env.RESPONSE_BATCH || 'off').toLowerCase() === 'on'
}

async function getModel() {
  if (!ResponseModel) ResponseModel = (await import('../models/Response.js')).default
  return ResponseModel
}

// Queue a response doc for the next batched write. Points/isCorrect/responseTime must already be
// computed by the caller (they are returned to the student synchronously by the route).
export async function bufferResponse(doc) {
  buffer.push(doc)
  ensureShutdownHook()
  if (buffer.length >= FLUSH_MAX) { await flushNow(); return }
  if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flushNow() }, FLUSH_MS)
}

// Write the current buffer in one insertMany. Safe to call anytime (no-op if empty). Exported so
// the shutdown hook and tests can force a flush.
export async function flushNow() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  if (!buffer.length) return
  const batch = buffer
  buffer = []
  try {
    const M = await getModel()
    await M.insertMany(batch, { ordered: false })
  } catch (err) {
    // ordered:false → all valid, non-duplicate docs ARE inserted. Duplicate-key errors (E11000)
    // are EXPECTED and correct — the unique index dropped a re-submit, same as the save() path, so
    // we stay silent on those. Anything else means some answers in this batch did NOT persist
    // (the durability window) — log loudly so it is never silent.
    const writeErrors = err?.writeErrors || []
    const nonDup = writeErrors.filter(e => (e.code ?? e.err?.code) !== 11000)
    if (!writeErrors.length || nonDup.length) {
      console.error(`[response-batch] flush failed for up to ${batch.length} responses:`, err?.message)
    }
  }
}

// Flush remaining answers on a graceful shutdown so a planned restart/deploy doesn't drop the
// in-flight buffer. Registered lazily on first use, so when batching is OFF the process's shutdown
// behavior is entirely unchanged (the main backend has no other signal handlers).
function ensureShutdownHook() {
  if (shutdownHooked) return
  shutdownHooked = true
  const graceful = async () => {
    const force = setTimeout(() => process.exit(0), 2000) // never hang shutdown on a slow flush
    try { await flushNow() } catch (e) { console.error('[response-batch] shutdown flush error:', e?.message) }
    clearTimeout(force)
    process.exit(0)
  }
  process.once('SIGTERM', graceful)
  process.once('SIGINT', graceful)
}
