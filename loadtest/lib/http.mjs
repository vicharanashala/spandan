// Minimal JSON client for the Spandan REST API. A non-2xx response throws an Error carrying
// `status` and the server's `error` string as `code` (e.g. 409 + "poll_closed"), so metrics can
// group failures precisely.

export class HttpError extends Error {
  constructor(status, code, path) {
    super(`HTTP ${status}${code ? ` ${code}` : ''} on ${path}`)
    this.name = 'HttpError'
    this.status = status
    // Keep codes short and stable for grouping; long human messages are truncated.
    this.code = code ? String(code).slice(0, 60) : null
  }
}

export function makeApi(baseApi, { timeoutMs = 15000 } = {}) {
  return async function api(path, { method = 'GET', token, body } = {}) {
    const res = await fetch(`${baseApi}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs)
    })
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { /* non-JSON (e.g. proxy error page) */ }
    if (!res.ok) throw new HttpError(res.status, data?.error || data?.code || null, path)
    return data
  }
}
