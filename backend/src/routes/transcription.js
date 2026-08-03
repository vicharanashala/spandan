import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { transcribe as sarvamTranscribe } from '../services/sarvamTranscriptionService.js'

const router = express.Router()

// Phase 2C: speech-to-text now runs in a SEPARATE faster-whisper process
// (backend/transcription_server.py, default :3003). This route only PROXIES to it, so
// the heavy CPU inference never runs on — and never blocks — the Node event loop. The
// proxy call is plain async I/O. If the service is down/slow we fail fast with 502/503
// and the API stays fully responsive for everyone else.
const TRANSCRIPTION_URL = process.env.TRANSCRIPTION_SERVICE_URL || 'http://127.0.0.1:3003'
const TRANSCRIBE_TIMEOUT_MS = Number(process.env.TRANSCRIBE_TIMEOUT_MS) || 30000
let whisperDownLogged = false

// Health/status check (proxied to the transcription service)
router.get('/status', authenticate, async (req, res) => {
  try {
    const r = await fetch(`${TRANSCRIPTION_URL}/health`, { signal: AbortSignal.timeout(3000) })
    const data = await r.json()
    res.json({
      status: data.loaded ? 'ready' : 'loading',
      model: data.model || 'unknown',
      sarvamAvailable: !!process.env.SARVAM_API_KEY
    })
  } catch (err) {
    res.status(503).json({
      status: 'unavailable',
      error: 'Transcription service not reachable',
      sarvamAvailable: !!process.env.SARVAM_API_KEY
    })
  }
})

// Transcribe an audio chunk — routes to Whisper (default) or Sarvam based on provider
router.post('/transcribe', authenticate, authorize('teacher'), async (req, res) => {
  if (!req.body || !req.body.audio) {
    return res.status(400).json({ error: 'No audio provided' })
  }

  const provider = req.body.provider || 'whisper'

  // ── Sarvam AI path ──
  if (provider === 'sarvam') {
    try {
      const result = await sarvamTranscribe(req.body.audio, req.body.language)
      return res.json(result)
    } catch (err) {
      console.error('Sarvam transcription error:', err.message)
      return res.status(502).json({ error: err.message })
    }
  }

  // ── Whisper path (default) — falls back to Sarvam if Whisper is unreachable ──
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

    // Auto-fallback to Sarvam when Whisper service is down
    if (!timedOut && process.env.SARVAM_API_KEY) {
      if (!whisperDownLogged) {
        console.warn('Whisper service unreachable — falling back to Sarvam for transcription')
        whisperDownLogged = true
      }
      try {
        const result = await sarvamTranscribe(req.body.audio, req.body.language)
        return res.json(result)
      } catch (sarvamErr) {
        console.error('Sarvam fallback also failed:', sarvamErr.message)
        return res.status(502).json({ error: 'Both Whisper and Sarvam transcription failed' })
      }
    }

    console.error('Transcription proxy error:', err.message)
    res.status(502).json({ error: timedOut ? 'Transcription timed out' : 'Transcription service unavailable' })
  }
})

export default router
