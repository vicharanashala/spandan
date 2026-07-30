import express from 'express'
import http from 'http'
import { URL } from 'url'

const router = express.Router()

// Phase 2C: speech-to-text runs in a SEPARATE faster-whisper process
// (backend/transcription_server.py, default :3003). This route only PROXIES to it, so
// the heavy CPU inference never runs on — and never blocks — the Node event loop.
// If the service is still starting up (model load takes ~20-30s), we retry a few times
// so the first mic click after `npm run dev` doesn't hard-fail with 502.
const TRANSCRIPTION_URL = process.env.TRANSCRIPTION_SERVICE_URL || 'http://127.0.0.1:3003'
const TRANSCRIBE_TIMEOUT_MS = Number(process.env.TRANSCRIBE_TIMEOUT_MS) || 30000

// transcription_server.py is built on Python's BaseHTTPRequestHandler, whose default
// protocol_version is HTTP/1.0 — it closes the TCP connection after every single
// response. Node's global fetch() (undici) pools/reuses keep-alive connections, so it
// will eventually try to reuse a socket the Python side already closed, producing
// UND_ERR_SOCKET ("other side closed", bytesRead: 0). Using the plain `http` module
// with a fresh connection per request (no Agent reuse) avoids this entirely, since it
// always opens a brand-new socket that matches the server's close-after-response model.
function rawRequest(targetUrl, { method = 'GET', body, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl)
    const payload = body ? Buffer.from(body) : null

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method,
        agent: false, // no pooling/keep-alive reuse — fresh socket every call
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
          : {}
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8')
          let json
          try {
            json = raw ? JSON.parse(raw) : {}
          } catch (parseErr) {
            reject(new Error(`Invalid JSON from transcription service: ${parseErr.message}`))
            return
          }
          resolve({ status: res.statusCode, data: json })
        })
      }
    )

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Transcription request timed out'))
    })

    req.on('error', reject)

    if (payload) req.write(payload)
    req.end()
  })
}

// Retry a rawRequest up to `maxAttempts` times with `delayMs` between attempts.
// Used to absorb the model-load window at startup (~20-30 s) and transient
// connection issues.
async function requestWithRetry(targetUrl, options, maxAttempts = 4, delayMs = 3000) {
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await rawRequest(targetUrl, options)
    } catch (err) {
      lastErr = err
      if (attempt < maxAttempts) {
        console.warn(`[transcription proxy] Attempt ${attempt}/${maxAttempts} failed (${err.message}), retrying in ${delayMs}ms...`)
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
  }
  throw lastErr
}

// Health/status check (proxied to the transcription service)
router.get('/status', async (req, res) => {
  try {
    const { data } = await rawRequest(`${TRANSCRIPTION_URL}/health`, { method: 'GET', timeoutMs: 3000 })
    res.json({ status: data.loaded ? 'ready' : 'loading', model: data.model || 'unknown' })
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: 'Transcription service not reachable. Make sure the Python server is running (npm run dev starts it automatically).' })
  }
})

// Transcribe an audio chunk — forwarded to the faster-whisper service.
// Retries up to 4 times (12 s total) to absorb the model-load startup window.
router.post('/transcribe', async (req, res) => {
  if (!req.body || !req.body.audio) {
    if (res.headersSent) return
    return res.status(400).json({ error: 'No audio provided' })
  }
  try {
    const { status, data } = await requestWithRetry(
      `${TRANSCRIPTION_URL}/transcribe`,
      {
        method: 'POST',
        body: JSON.stringify(req.body),
        timeoutMs: TRANSCRIBE_TIMEOUT_MS
      },
      4,   // 4 attempts
      3000 // 3 s between each attempt (covers ~12 s of model loading)
    )
    if (res.headersSent) return
    res.status(status).json(data)
  } catch (err) {
    const timedOut = err.message === 'Transcription request timed out'
    console.error('Transcription proxy error (all retries exhausted):', err.message)
    if (res.headersSent) return
    res.status(502).json({
      error: timedOut
        ? 'Transcription timed out'
        : 'Transcription service unavailable. Is transcription_server.py running? Run `npm run dev` from the project root — it starts all three services automatically.'
    })
  }
})

export default router