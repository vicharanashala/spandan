// Live read-only mirror of Spurti (https://samagama.in/spurti), the sibling app that owns the
// official SP ledger and standup attendance minutes. Spurti is the source of truth: Spandan reads
// its numbers and never writes to it.
//
// "If Samagama access is available, mirror it; otherwise use local data" is decided per request:
//
//   access available  -> GET /admin/attendance (admin headers) or /journey/state (SSO cookie)
//   access missing    -> fetchLiveStanding() returns null and the caller keeps Spandan's local
//                        StudentStanding balances. Nothing throws, nothing blocks the dashboard.
//
// Modes (SPURTI_MODE):
//   auto  (default) admin headers if configured, else the student's Samagama SSO cookie, else off
//   admin           force admin headers (off when the credentials are blank)
//   sso             force the cookie path
//   off             never call out, always local
// SPURTI_DISABLED=1 is a hard override for `off`.
//
// After a failed admin call (network error, 5xx, 401/403/404) the mirror stops trying for
// SPURTI_RETRY_MS and serves the last good snapshot, or local data if there is none. That keeps an
// unreachable/unauthorised Spurti from adding a timeout to every dashboard request, and lets the
// mirror recover on its own as soon as access is granted.
//
// Env:
//   SPURTI_API_URL          default https://samagama.in/spurti/api
//   SPURTI_MODE             auto | admin | sso | off (default auto)
//   SPURTI_ADMIN_EMAIL      admin email (x-admin-email)
//   SPURTI_ADMIN_TOKEN      admin token (x-admin-token)
//   SPURTI_CACHE_TTL_MS     default 120000
//   SPURTI_RETRY_MS         default 60000 (retry a failed mirror after this long)
//   SPURTI_TIMEOUT_MS       default 5000
//   SPURTI_DISABLED=1       turn the mirror off entirely

const DEFAULT_API_URL = 'https://samagama.in/spurti/api'
const EMPTY_ROWS = new Map()

const apiUrl = () => String(process.env.SPURTI_API_URL || DEFAULT_API_URL).replace(/\/+$/, '')
const adminEmail = () => String(process.env.SPURTI_ADMIN_EMAIL || '').trim()
const adminToken = () => String(process.env.SPURTI_ADMIN_TOKEN || '').trim()
const cacheTtl = () => {
  const raw = Number(process.env.SPURTI_CACHE_TTL_MS)
  return Number.isFinite(raw) && raw >= 0 ? raw : 120000
}
const retryMs = () => {
  const raw = Number(process.env.SPURTI_RETRY_MS)
  return Number.isFinite(raw) && raw >= 0 ? raw : 60000
}
const timeoutMs = () => {
  const raw = Number(process.env.SPURTI_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : 5000
}

const normalizeEmail = (value) => String(value || '').trim().toLowerCase()

// Resolves the env-only part of the decision. `enabled: false` means there is no way to reach
// Spurti with this configuration, so the dashboard goes straight to local data.
export function spurtiConfig() {
  const hasAdmin = Boolean(adminEmail() && adminToken())
  const requested = String(process.env.SPURTI_MODE || 'auto').trim().toLowerCase()
  let mode
  if (process.env.SPURTI_DISABLED === '1' || requested === 'off') mode = 'off'
  else if (requested === 'admin') mode = hasAdmin ? 'admin' : 'off'
  else if (requested === 'sso') mode = 'sso'
  // auto: admin headers are the cheapest (one request for the whole roster); without them we can
  // still mirror via the Samagama cookie when the browser forwards one.
  else mode = hasAdmin ? 'admin' : 'sso'
  return {
    enabled: mode !== 'off',
    baseUrl: apiUrl(),
    mode,
    requested,
    hasAdmin
  }
}

// One-line description for the boot log, so it is obvious which branch is live.
export function describeSpurti() {
  const config = spurtiConfig()
  if (!config.enabled) return 'off — using local SP/attendance'
  if (config.mode === 'admin') return `admin mirror of ${config.baseUrl}`
  return `SSO mirror of ${config.baseUrl} (needs the chatengine_token cookie)`
}

export function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(index + 1).trim())
    } catch {
      return part.slice(index + 1).trim()
    }
  }
  return null
}

// Admin /admin/attendance -> Map(email -> { spBalance, attendanceMinutes, sessionsAttended }).
export function summarizeAttendancePayload(payload) {
  const rows = new Map()
  if (!payload || typeof payload !== 'object') return rows
  const labels = Array.isArray(payload.sessions) ? payload.sessions.map((s) => s?.label).filter(Boolean) : []
  for (const student of Array.isArray(payload.students) ? payload.students : []) {
    const email = normalizeEmail(student?.email)
    if (!email) continue
    const cells = student?.cells && typeof student.cells === 'object' ? student.cells : {}
    const keys = labels.length ? labels : Object.keys(cells)
    let minutes = 0
    let sessionsAttended = 0
    for (const key of keys) {
      const value = Number(cells[key]?.minutes) || 0
      if (value > 0) {
        minutes += value
        sessionsAttended++
      }
    }
    rows.set(email, {
      email,
      spBalance: Math.max(0, Math.round(Number(student.totalSp) || 0)),
      attendanceMinutes: Math.max(0, Math.round(minutes)),
      sessionsAttended
    })
  }
  return rows
}

// /journey/state -> the same normalized shape, for one student.
export function normalizeJourneyState(payload) {
  if (!payload || typeof payload !== 'object') return null
  const sp = Number(payload.totalSp)
  const minutes = Number(payload.standups?.zoomMinutes)
  if (!Number.isFinite(sp) && !Number.isFinite(minutes)) return null
  return {
    spBalance: Math.max(0, Math.round(Number.isFinite(sp) ? sp : 0)),
    attendanceMinutes: Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0)),
    sessionsAttended: Math.max(0, Math.round(Number(payload.standups?.sessionsAttended) || 0))
  }
}

async function fetchJson(path, headers) {
  const res = await fetch(`${apiUrl()}${path}`, {
    headers: { accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeoutMs())
  })
  if (res.status === 401 || res.status === 403 || res.status === 404) return { status: res.status, body: null }
  if (!res.ok) throw new Error(`Spurti ${path} responded ${res.status}`)
  return { status: res.status, body: await res.json() }
}

// Last good admin snapshot. Only successful payloads are stored, so a transient failure can keep
// serving the previous numbers instead of flipping the dashboard back to local mid-session.
let adminCache = { at: 0, rows: null }

// The mirror's own state: cooldown after a failure, plus the last reported state so a persistent
// outage logs once rather than on every request.
let mirror = { downUntil: 0, lastReported: null, detail: '' }

const fresh = (at) => at > 0 && Date.now() - at < cacheTtl()
const coolingDown = () => mirror.downUntil > Date.now()

function report(state, detail) {
  if (mirror.lastReported === state) return
  mirror.lastReported = state
  mirror.detail = detail
  if (state === 'live') {
    console.info('[spurti] live mirror active —', detail)
  } else {
    console.warn('[spurti] mirror unavailable, showing local SP/attendance —', detail)
  }
}

function markDown(error) {
  mirror.downUntil = Date.now() + retryMs()
  const message = typeof error === 'string' ? error : error?.message || 'unknown error'
  report('local', message)
}

function markUp(detail) {
  mirror.downUntil = 0
  report('live', detail)
}

async function adminSnapshot() {
  if (adminCache.rows && fresh(adminCache.at)) return adminCache.rows
  if (coolingDown()) return adminCache.rows || EMPTY_ROWS
  try {
    const { status, body } = await fetchJson('/admin/attendance', {
      'x-admin-email': adminEmail(),
      'x-admin-token': adminToken()
    })
    if (!body) {
      // 401/403 = wrong or missing admin access; 404 = the route is not deployed. Both mean the
      // snapshot is unavailable right now, so back off instead of hitting it on every request.
      markDown(`admin attendance responded ${status}`)
      return adminCache.rows || EMPTY_ROWS
    }
    adminCache = { at: Date.now(), rows: summarizeAttendancePayload(body) }
    markUp(`${adminCache.rows.size} students via admin headers`)
  } catch (error) {
    // Keep the last good snapshot; only a cold cache has to fall back to local balances.
    markDown(error)
  }
  return adminCache.rows || EMPTY_ROWS
}

const studentCache = new Map() // email -> { at, value }

async function journeyFor(email, chatengineToken) {
  if (!chatengineToken) return null
  const hit = studentCache.get(email)
  if (hit && fresh(hit.at)) return hit.value
  let value = null
  try {
    const { body } = await fetchJson('/journey/state', { cookie: `chatengine_token=${chatengineToken}` })
    if (body) {
      value = { ...normalizeJourneyState(body), email }
      markUp(`journey state for ${email}`)
    }
  } catch (error) {
    // Cookie mode is per student, so remember the miss for this student only; another student
    // with a valid session must still be able to mirror.
    mirror.downUntil = Date.now() + retryMs()
    report('local', error.message)
  }
  studentCache.set(email, { at: Date.now(), value })
  return value
}

// Returns { source: 'spurti', spBalance, attendanceMinutes, sessionsAttended, fetchedAt } or null.
// null is the "use local data" branch: not configured, cooling down, unknown student, or any
// failure. Callers must never treat it as an error.
export async function fetchLiveStanding(email, { chatengineToken } = {}) {
  const config = spurtiConfig()
  if (!config.enabled) return null
  const key = normalizeEmail(email)
  if (!key) return null

  let value = null
  if (config.mode === 'admin') {
    const rows = await adminSnapshot()
    value = rows.get(key) || null
  } else {
    value = await journeyFor(key, chatengineToken)
  }
  if (!value) return null
  return {
    source: 'spurti',
    spBalance: Math.max(0, Math.round(Number(value.spBalance) || 0)),
    attendanceMinutes: Math.max(0, Math.round(Number(value.attendanceMinutes) || 0)),
    sessionsAttended: Math.max(0, Math.round(Number(value.sessionsAttended) || 0)),
    fetchedAt: new Date().toISOString()
  }
}

// Diagnostics for the dashboard/tests: which branch would run right now, and why.
export function spurtiStatus() {
  const config = spurtiConfig()
  return {
    ...config,
    live: config.enabled && !coolingDown() && mirror.lastReported === 'live',
    coolingDown: coolingDown(),
    retryInMs: Math.max(0, mirror.downUntil - Date.now()),
    detail: mirror.detail
  }
}

export function clearSpurtiCache() {
  adminCache = { at: 0, rows: null }
  studentCache.clear()
  mirror = { downUntil: 0, lastReported: null, detail: '' }
}
