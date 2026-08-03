import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { detectTerms, getTermDetails, getTermMindmap } from '../services/termService.js'
import RoomTerm from '../models/RoomTerm.js'
import Room from '../models/Room.js'

const router = express.Router()

router.use(authenticate)

// ---------------------------------------------------------------------------
// POST /api/terminology/detect
// Called automatically from handleSegmentComplete() alongside quiz generation.
// Teacher-only. Fire-and-forget from the frontend's perspective — responds
// immediately, detects + dedupes + broadcasts in the background, same pattern
// as routes/mindmap.js.
// ---------------------------------------------------------------------------
router.post('/detect', authorize('teacher'), async (req, res) => {
  const { roomId, roomCode, transcript, segmentIndex = -1 } = req.body
  const io = req.app.get('io') // captured now, while we still have req

  if (!roomId || !roomCode || !transcript) {
    return res.status(400).json({ success: false, error: 'roomId, roomCode, and transcript are required' })
  }

  res.status(202).json({ success: true, message: 'Term detection started in the background' })

  setImmediate(async () => {
    try {
      const detected = await detectTerms(transcript)
      if (detected.length === 0) return

      for (const term of detected) {
        const termLower = term.toLowerCase()
        try {
          // The unique index on {roomId, termLower} is the real dedupe guarantee —
          // this insert simply fails silently (caught below) if the term already
          // exists for this room, which is exactly the behavior we want.
          const doc = await RoomTerm.create({ roomId, term, termLower, segmentIndex })
          io.to(roomCode).emit('terminology_update', { _id: doc._id, term: doc.term })
          console.log(`[terminology] New term "${term}" broadcast to room ${roomCode}`)
        } catch (err) {
          if (err.code !== 11000) { // 11000 = duplicate key, expected/harmless here
            console.error(`[terminology] Failed to save term "${term}":`, err.message)
          }
        }
      }
    } catch (error) {
      console.error('[terminology] Background detection error:', error)
    }
  })
})

// ---------------------------------------------------------------------------
// GET /api/terminology/room/:roomId
// Fetch terms already detected so far — used on page load/refresh so a student
// joining mid-lecture (or refreshing) doesn't miss earlier terms.
// ---------------------------------------------------------------------------
router.get('/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params
    const terms = await RoomTerm.find({ roomId }).sort({ createdAt: 1 }).select('term')
    res.json({ success: true, terms })
  } catch (error) {
    console.error('[terminology] Failed to fetch room terms:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch terms' })
  }
})

// ---------------------------------------------------------------------------
// GET /api/terminology/:termId/details
// Lazy — only hit when a student clicks a term. termId is a RoomTerm _id;
// looked up to get its `term` string, then resolved via the GLOBAL Term cache.
// ---------------------------------------------------------------------------
router.get('/:termId/details', async (req, res) => {
  try {
    const roomTerm = await RoomTerm.findById(req.params.termId)
    if (!roomTerm) {
      return res.status(404).json({ success: false, error: 'Term not found' })
    }
    const details = await getTermDetails(roomTerm.term)
    res.json({ success: true, ...details })
  } catch (error) {
    console.error('[terminology] Failed to get term details:', error)
    res.status(500).json({ success: false, error: 'Failed to get term details' })
  }
})

// ---------------------------------------------------------------------------
// GET /api/terminology/:termId/mindmap
// Lazy — only hit when a student clicks "Generate Mindmap" for a term.
// ---------------------------------------------------------------------------
router.get('/:termId/mindmap', async (req, res) => {
  try {
    const roomTerm = await RoomTerm.findById(req.params.termId)
    if (!roomTerm) {
      return res.status(404).json({ success: false, error: 'Term not found' })
    }
    const mermaidCode = await getTermMindmap(roomTerm.term)
    res.json({ success: true, mermaidCode })
  } catch (error) {
    console.error('[terminology] Failed to get term mindmap:', error)
    res.status(500).json({ success: false, error: 'Failed to get term mindmap' })
  }
})

// ---------------------------------------------------------------------------
// DELETE /api/terminology/room/:roomId?roomCode=XXX
// Clears all previously detected terms for this room — called when the teacher
// starts a FRESH recording session, so terms from a previous test/lecture run
// in the same room don't linger. Within a single continuous session, terms
// still accumulate normally (that part is unchanged).
// ---------------------------------------------------------------------------
router.delete('/room/:roomId', authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.params
    const { roomCode } = req.query
    await RoomTerm.deleteMany({ roomId })

    if (roomCode) {
      const io = req.app.get('io')
      io.to(roomCode).emit('terminology_cleared')
    }

    res.json({ success: true })
  } catch (error) {
    console.error('[terminology] Failed to clear room terms:', error)
    res.status(500).json({ success: false, error: 'Failed to clear terms' })
  }
})

export default router