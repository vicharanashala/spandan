import { audioAccess, reserveOrder, publishAudio } from '../services/discussionService.js'
import { broadcastDiscussionTranscript } from '../services/discussionSockets.js'
import express from 'express'
import { authenticate, authorize, requireApprovedTeacher } from '../middleware/auth.js'

const router = express.Router()

// Phase 2C: speech-to-text now runs in a SEPARATE faster-whisper process
// (backend/transcription_server.py, default :3003). This route only PROXIES to it, so
// the heavy CPU inference never runs on — and never blocks — the Node event loop. The
// proxy call is plain async I/O. If the service is down/slow we fail fast with 502/503
// and the API stays fully responsive for everyone else.
const TRANSCRIPTION_URL = process.env.TRANSCRIPTION_SERVICE_URL || 'http://127.0.0.1:3003'
const TRANSCRIBE_TIMEOUT_MS = Number(process.env.TRANSCRIBE_TIMEOUT_MS) || 30000

// Health/status check (proxied to the transcription service)
router.get('/status', authenticate, async (req, res) => {
  try {
    const r = await fetch(`${TRANSCRIPTION_URL}/health`, { signal: AbortSignal.timeout(3000) })
    const data = await r.json()
    res.json({ status: data.loaded ? 'ready' : 'loading', model: data.model || 'unknown' })
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: 'Transcription service not reachable' })
  }
})

// Transcribe an audio chunk — forwarded to the faster-whisper service
router.post('/transcribe', authenticate, authorize('teacher', 'student'), requireApprovedTeacher, async (req, res) => {
  if (!req.body || !req.body.audio) {
    return res.status(400).json({ error: 'No audio provided' })
  }
  try {
    const access = await audioAccess(req.user, req.body)
    const order = await reserveOrder(access)
    const r = await fetch(`${TRANSCRIPTION_URL}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: req.body.audio }),
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS)
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    const discussionEntry = await publishAudio(access, order, data.text)
    if (discussionEntry) await broadcastDiscussionTranscript(req.app.get('io'), access.room.code, discussionEntry)
    res.status(r.status).json({ ...data, discussionEntry })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError'
    console.error('Transcription proxy error:', err.message)
    res.status(502).json({ error: timedOut ? 'Transcription timed out' : 'Transcription service unavailable' })
  }
})

export default router
