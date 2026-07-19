import express from 'express'

const router = express.Router()

// Phase 2C: speech-to-text runs in a SEPARATE faster-whisper process
// (backend/transcription_server.py, default :3003). This route only PROXIES to it, so
// the heavy CPU inference never runs on — and never blocks — the Node event loop.
// If the service is still starting up (model load takes ~20-30s), we retry a few times
// so the first mic click after `npm run dev` doesn't hard-fail with 502.
const TRANSCRIPTION_URL = process.env.TRANSCRIPTION_SERVICE_URL || 'http://127.0.0.1:3003'
const TRANSCRIBE_TIMEOUT_MS = Number(process.env.TRANSCRIBE_TIMEOUT_MS) || 30000

// Retry a fetch up to `maxAttempts` times with `delayMs` between attempts.
// Used to absorb the model-load window at startup (~20-30 s).
async function fetchWithRetry(url, options, maxAttempts = 4, delayMs = 3000) {
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const r = await fetch(url, options)
      return r
    } catch (err) {
      lastErr = err
      if (attempt < maxAttempts) {
        console.warn(`[transcription proxy] Attempt ${attempt}/${maxAttempts} failed (${err.message}) CAUSE=${err.cause}, retrying in ${delayMs}ms...`)
        await new Promise(r => setTimeout(r, delayMs))
      }
    }
  }
  throw lastErr
}

// Health/status check (proxied to the transcription service)
router.get('/status', async (req, res) => {
  try {
    const r = await fetch(`${TRANSCRIPTION_URL}/health`, { signal: AbortSignal.timeout(3000) })
    const data = await r.json()
    res.json({ status: data.loaded ? 'ready' : 'loading', model: data.model || 'unknown' })
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: 'Transcription service not reachable. Make sure the Python server is running (npm run dev starts it automatically).' })
  }
})

// Transcribe an audio chunk — forwarded to the faster-whisper service.
// Retries up to 4 times (12 s total) to absorb the model-load startup window.
router.post('/transcribe', async (req, res) => {
  if (!req.body || !req.body.audio) {
    return res.status(400).json({ error: 'No audio provided' })
  }
  try {
    const r = await fetchWithRetry(
      `${TRANSCRIPTION_URL}/transcribe`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS)
      },
      4,   // 4 attempts
      3000 // 3 s between each attempt (covers ~12 s of model loading)
    )
    const data = await r.json()
    res.status(r.status).json(data)
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError'
    console.error('Transcription proxy error (all retries exhausted):', err.message, 'CAUSE:', err.cause)
    res.status(502).json({
      error: timedOut
        ? 'Transcription timed out'
        : 'Transcription service unavailable. Is transcription_server.py running? Run `npm run dev` from the project root — it starts all three services automatically.'
    })
  }
})

export default router
