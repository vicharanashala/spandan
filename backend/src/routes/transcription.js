import express from 'express'

const router = express.Router()

// Phase 2C: speech-to-text now runs in a SEPARATE faster-whisper process
// (backend/transcription_server.py, default :3003). This route only PROXIES to it, so
// the heavy CPU inference never runs on — and never blocks — the Node event loop. The
// proxy call is plain async I/O. If the service is down/slow we fail fast with 502/503
// and the API stays fully responsive for everyone else.
const TRANSCRIPTION_URL = process.env.TRANSCRIPTION_SERVICE_URL || 'http://127.0.0.1:3003'
const TRANSCRIBE_TIMEOUT_MS = Number(process.env.TRANSCRIBE_TIMEOUT_MS) || 30000

// Health/status check (proxied to the transcription service)
router.get('/status', async (req, res) => {
  try {
    const r = await fetch(`${TRANSCRIPTION_URL}/health`, { signal: AbortSignal.timeout(3000) })
    const data = await r.json()
    res.json({ status: data.loaded ? 'ready' : 'loading', model: data.model || 'unknown' })
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: 'Transcription service not reachable' })
  }
})

// Transcribe an audio chunk — forwarded to the faster-whisper service
router.post('/transcribe', async (req, res) => {
  if (!req.body || !req.body.audio) {
    return res.status(400).json({ error: 'No audio provided' })
  }
  try {
    const r = await fetch(`${TRANSCRIPTION_URL}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS)
    })
    const data = await r.json()
    res.status(r.status).json(data)
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError'
    console.error('Transcription proxy error:', err.message)
    res.status(502).json({ error: timedOut ? 'Transcription timed out' : 'Transcription service unavailable' })
  }
})

export default router
