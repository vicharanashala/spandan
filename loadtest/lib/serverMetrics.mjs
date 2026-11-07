// Optional: read the backend's opt-in metrics endpoint (backend SERVER_METRICS=on) during a run.
// The endpoint lives at <baseUrl>/internal/metrics (outside /api, not under any proxy prefix) and
// only answers direct local requests, so this only works against a local backend.
//
// mode 'auto'    use it when enabled, otherwise note that and carry on (default)
//      'require' fail the run before it starts if it is not available
//      'off'     never touch it

export const SERVER_METRICS_MODES = ['auto', 'require', 'off']
// The backend refuses POST /internal/metrics/reset without this header (CSRF protection: a web page
// cannot send a custom header cross-origin without a CORS preflight, which the route never approves).
export const RESET_HEADERS = Object.freeze({ 'X-Loadtest-Metrics': 'reset' })

export function serverMetricsUrl(baseUrl) {
  return `${baseUrl.replace(/\/+$/, '')}/internal/metrics`
}

async function call(url, method = 'GET', headers = {}) {
  const res = await fetch(url, { method, headers, signal: AbortSignal.timeout(3000) })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`)
    err.status = res.status
    // The backend's 403s say why (proxy headers, Host, cross-site, missing reset header).
    try { err.serverError = String((await res.json())?.error || '').slice(0, 120) || null } catch { err.serverError = null }
    throw err
  }
  return res.json()
}

/** Pull the few numbers worth charting per second out of a full snapshot. */
export function serverGauges(snap) {
  const p = snap?.process || {}
  return {
    serverCpu: p.cpuPercent?.last ?? null,
    serverRssMb: p.memoryMb?.rss ?? null,
    serverHeapMb: p.memoryMb?.heapUsed ?? null,
    serverLoopP99Ms: p.eventLoopDelayMs?.p99 ?? null,
    serverSockets: snap?.sockets?.active ?? null,
    serverInFlight: snap?.http?.inFlight ?? null
  }
}

/**
 * Has someone else reset the counters (or the backend restarted) since OUR reset? Every snapshot's
 * `since` must equal the value our reset returned. Returns the compromise record, or null.
 */
export function detectForeignReset(resetSince, snap, atSec) {
  if (!resetSince || typeof snap?.since !== 'string' || snap.since === resetSince) return null
  return {
    detectedAtSec: atSec,
    expectedSince: resetSince,
    seenSince: snap.since,
    reason: 'the backend metrics were reset by another client (another simulator run?) or the backend restarted during this run'
  }
}

export async function startServerMetrics(cfg, rec, { intervalMs = 2000, log = console.log } = {}) {
  const url = serverMetricsUrl(cfg.baseUrl)
  const off = { available: false, url, reason: null, compromised: null, preexistingSockets: null, read: async () => null, stop: async () => null }
  if (cfg.serverMetrics === 'off') return { ...off, reason: 'disabled with --server-metrics off' }

  // Before our reset: anything already connected (another simulator run, or app tabs) shares this
  // backend's counters and capacity. Best-effort; a failure here is handled by the reset below.
  let preexistingSockets = null
  try { preexistingSockets = (await call(url))?.sockets?.active ?? null } catch { /* reported by the reset */ }

  let resetSince = null
  try {
    resetSince = (await call(`${url}/reset`, 'POST', RESET_HEADERS))?.since ?? null
  } catch (err) {
    const reason = err.status === 404
      ? 'backend metrics are disabled (start the backend with SERVER_METRICS=on)'
      : err.status === 403
        ? `backend refused: ${err.serverError || 'metrics are local-only and must not go through a proxy'}`
        : `metrics endpoint unreachable (${err.message})`
    if (cfg.serverMetrics === 'require') throw new Error(`--server-metrics require: ${reason}`)
    log(`note: server metrics not collected: ${reason}`)
    return { ...off, reason }
  }

  if (preexistingSockets > 0) {
    log(`WARNING: ${preexistingSockets} socket(s) were already connected to the backend before this run ` +
      '(another simulator run, or open app tabs). Run one simulation per backend at a time; their traffic is in the server figures.')
  }

  let samples = 0, failures = 0
  let compromised = null
  // Checks every snapshot we take; once compromised, the run stays compromised.
  const seen = (snap) => {
    if (!compromised) {
      compromised = detectForeignReset(resetSince, snap, Math.round(rec.elapsedSeconds() * 10) / 10)
      if (compromised) log(`WARNING: server metrics compromised at ${compromised.detectedAtSec}s: ${compromised.reason}.`)
    }
    return snap
  }
  const timer = setInterval(async () => {
    try {
      rec.gauge(serverGauges(seen(await call(url))))
      samples++
    } catch {
      failures++
    }
  }, intervalMs)
  timer.unref()
  log(`server metrics: collecting from ${url} (counters reset)`)

  return {
    available: true,
    url,
    reason: null,
    preexistingSockets,
    /** Non-null once another client's reset (or a backend restart) was detected. */
    get compromised() { return compromised },
    /** One snapshot now (e.g. the event-trace ledger before sockets close); null if the read fails. */
    async read() {
      try { return seen(await call(url)) } catch { failures++; return null }
    },
    async stop() {
      clearInterval(timer)
      let final = null
      try { final = seen(await call(url)) } catch { failures++ }
      return { samples, failures, final, compromised }
    }
  }
}
