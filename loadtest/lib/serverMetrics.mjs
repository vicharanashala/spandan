// Optional: read the backend's opt-in metrics endpoint (backend SERVER_METRICS=on) during a run.
// The endpoint lives at <baseUrl>/internal/metrics (outside /api, not under any proxy prefix) and
// only answers direct local requests, so this only works against a local backend.
//
// mode 'auto'    use it when enabled, otherwise note that and carry on (default)
//      'require' fail the run before it starts if it is not available
//      'off'     never touch it

export const SERVER_METRICS_MODES = ['auto', 'require', 'off']

export function serverMetricsUrl(baseUrl) {
  return `${baseUrl.replace(/\/+$/, '')}/internal/metrics`
}

async function call(url, method = 'GET') {
  const res = await fetch(url, { method, signal: AbortSignal.timeout(3000) })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`)
    err.status = res.status
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

export async function startServerMetrics(cfg, rec, { intervalMs = 2000, log = console.log } = {}) {
  const url = serverMetricsUrl(cfg.baseUrl)
  const off = { available: false, url, reason: null, stop: async () => null }
  if (cfg.serverMetrics === 'off') return { ...off, reason: 'disabled with --server-metrics off' }

  try {
    await call(`${url}/reset`, 'POST')
  } catch (err) {
    const reason = err.status === 404
      ? 'backend metrics are disabled (start the backend with SERVER_METRICS=on)'
      : err.status === 403
        ? 'backend refused: metrics are local-only and must not go through a proxy'
        : `metrics endpoint unreachable (${err.message})`
    if (cfg.serverMetrics === 'require') throw new Error(`--server-metrics require: ${reason}`)
    log(`note: server metrics not collected: ${reason}`)
    return { ...off, reason }
  }

  let samples = 0, failures = 0
  const timer = setInterval(async () => {
    try {
      rec.gauge(serverGauges(await call(url)))
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
    async stop() {
      clearInterval(timer)
      let final = null
      try { final = await call(url) } catch { failures++ }
      return { samples, failures, final }
    }
  }
}
