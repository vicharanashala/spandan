import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { Room, DoubtSignal } from '../models/index.js'
import {
  recordDoubt,
  retractLatestDoubt,
  getDoubtCountsBySegment,
  detectSpikes,
  startRoomSession,
  getRoomSession,
  getSpikeDetails,
  getSignalsForRoom,
  broadcastRecordedDoubt
} from '../services/doubtService.js'

const router = express.Router()

/**
 * POST /api/doubts
 * Student marks "I'm lost". Body: { roomId, segmentIndex, transcriptOffsetMs }
 * Auth: any authenticated user. Students can only signal their own.
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { roomId, segmentIndex, transcriptOffsetMs } = req.body
    if (!roomId) {
      return res.status(400).json({ success: false, error: 'roomId is required' })
    }

    // Verify student is a member of the room (so they cannot spam into rooms
    // they aren't in). Teachers of the room can also signal (for sanity tests).
    const room = await Room.findById(roomId).select('_id teacher isActive code')
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' })

    const isTeacherOfRoom = String(room.teacher) === String(req.user._id)
    const isStudent = req.user.role === 'student'
    if (!isTeacherOfRoom && !isStudent) {
      return res.status(403).json({ success: false, error: 'Forbidden' })
    }

    const result = await recordDoubt({
      roomId,
      userId: req.user._id,
      segmentIndex: segmentIndex || 0,
      transcriptOffsetMs: transcriptOffsetMs || 0,
      recordingOffsetMs: typeof req.body.recordingOffsetMs === 'number' ? req.body.recordingOffsetMs : null,
      utteranceSnapshot: req.body.utteranceSnapshot || '',
      clientSentAt: req.body.clientSentAt || null,
      client: req.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'web'
    })

    if (!result.ok) {
      // Anti-spam is not an error — surface it as 200 with a reason so the
      // client can show "you already marked, try again in N seconds".
      return res.status(200).json({
        success: false,
        error: result.reason,
        retryAfterMs: result.retryAfterMs
      })
    }

    // Notify the teacher (room audience) via Socket.IO. The route handler does
    // not have direct access to io here so we use app.get('io') set in index.js.
    // Broadcast logic is shared with the Socket.IO 'doubt:signal' handler via
    // broadcastRecordedDoubt() so both paths emit identical events.
    const io = req.app.get('io')
    if (io && room.code) {
      await broadcastRecordedDoubt({
        io,
        room,
        userId: req.user._id,
        payload: { roomId, segmentIndex, transcriptOffsetMs },
        signal: result.signal
      })
    }

    res.json({ success: true, signal: { id: result.signal._id } })
  } catch (err) {
    console.error('[doubts] record error:', err)
    res.status(500).json({ success: false, error: 'Failed to record doubt signal' })
  }
})

/**
 * POST /api/doubts/retract
 * Student withdraws their most recent signal (within the retract window).
 */
router.post('/retract', authenticate, async (req, res) => {
  try {
    const { roomId } = req.body
    if (!roomId) {
      return res.status(400).json({ success: false, error: 'roomId is required' })
    }
    const result = await retractLatestDoubt({ roomId, userId: req.user._id })
    if (!result.ok) return res.status(200).json({ success: false, error: result.reason })
    res.json({ success: true })
  } catch (err) {
    console.error('[doubts] retract error:', err)
    res.status(500).json({ success: false, error: 'Failed to retract doubt signal' })
  }
})

/**
 * GET /api/doubts/room/:roomId
 * Aggregated doubt counts per segment. Teacher-only.
 */
router.get('/room/:roomId', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const { roomId } = req.params
    const room = await Room.findById(roomId).select('_id teacher')
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' })
    if (String(room.teacher) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only the room teacher can view doubt signals' })
    }
    const counts = await getDoubtCountsBySegment(roomId)
    res.json({ success: true, segments: counts })
  } catch (err) {
    console.error('[doubts] agg error:', err)
    res.status(500).json({ success: false, error: 'Failed to aggregate doubt signals' })
  }
})

/**
 * GET /api/doubts/room/:roomId/spikes
 * Returns just the segments flagged as confusion spikes, with a transcript
 * snippet so the teacher can see what they were saying at that moment.
 */
router.get('/room/:roomId/spikes', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const { roomId } = req.params
    const room = await Room.findById(roomId).select('_id teacher')
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' })
    if (String(room.teacher) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only the room teacher can view doubt signals' })
    }
    const minMarkCount = parseInt(req.query.minMarkCount, 10) || 3
    const result = await detectSpikes({ roomId, minMarkCount })
    res.json({ success: true, ...result })
  } catch (err) {
    console.error('[doubts] spike error:', err)
    res.status(500).json({ success: false, error: 'Failed to detect spikes' })
  }
})

/**
 * GET /api/doubts/room/:roomId/question/:questionId
 * Returns the doubt count for the segment that a given question is anchored to.
 * Used by RoomResultsPage to show spike warnings next to questions.
 */
router.get('/room/:roomId/question/:questionId', authenticate, async (req, res) => {
  try {
    const { roomId, questionId } = req.params
    const { Question } = await import('../models/index.js')
    const question = await Question.findById(questionId).select('segmentIndex roomId')
    if (!question || String(question.roomId) !== String(roomId)) {
      return res.status(404).json({ success: false, error: 'Question not found in room' })
    }
    const counts = await getDoubtCountsBySegment(roomId)
    const seg = counts.find(c => c.segmentIndex === question.segmentIndex)
    res.json({ success: true, segmentIndex: question.segmentIndex, count: seg?.count || 0 })
  } catch (err) {
    console.error('[doubts] question-doubt error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch question doubt count' })
  }
})

// ============================================================================
// NEW: Session clock endpoints (for accurate "what time?" in doubt signals)
// ============================================================================

/**
 * POST /api/doubts/room/:roomId/session/start
 * Teacher marks the start of the recording session. All subsequent doubt
 * signals anchor their recordingOffsetMs against this. Idempotent -- resets
 * the clock only if the room has no prior start.
 */
router.post('/room/:roomId/session/start', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params
    const room = await Room.findById(roomId).select('_id teacher')
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' })
    if (String(room.teacher) !== String(req.user._id)) {
      return res.status(403).json({ success: false, error: 'Only the room teacher can start the session' })
    }
    const result = await startRoomSession(roomId, req.user._id)
    if (!result.ok) return res.status(400).json({ success: false, error: result.reason })
    // Notify everyone in the room so students can sync their clocks
    const io = req.app.get('io')
    if (io && room.code) {
      io.to(room.code).emit('teacher:session-start', {
        roomId: String(roomId),
        roomStartedAt: result.roomStartedAt,
        timestamp: Date.now()
      })
    }
    res.json({ success: true, roomStartedAt: result.roomStartedAt })
  } catch (err) {
    console.error('[doubts] session/start error:', err)
    res.status(500).json({ success: false, error: 'Failed to start session' })
  }
})

/**
 * GET /api/doubts/room/:roomId/session
 * Get the current session clock + current recording offset. For late-joining
 * students who need to sync up without waiting for the next broadcast.
 */
router.get('/room/:roomId/session', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params
    const result = await getRoomSession(roomId)
    if (!result.ok) return res.status(404).json({ success: false, error: result.reason })
    res.json({ success: true, ...result })
  } catch (err) {
    console.error('[doubts] session/get error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch session' })
  }
})

// ============================================================================
// NEW: Time-anchored spike + signal endpoints (for accurate "what time?" UI)
// ============================================================================

/**
 * GET /api/doubts/room/:roomId/spikes/timeline
 * Returns confusion spikes anchored to recording time (not just segment index).
 * Each spike has a `recordingOffsetLabel` (e.g. "02:34") and `count`.
 * Useful for the teacher to scan "at what moments did the class get lost?"
 */
router.get('/room/:roomId/spikes/timeline', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const { roomId } = req.params
    const room = await Room.findById(roomId).select('_id teacher')
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' })
    if (String(room.teacher) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only the room teacher can view doubt signals' })
    }
    const bucketMs = Math.max(1000, parseInt(req.query.bucketMs, 10) || 5000)
    const minMarkCount = parseInt(req.query.minMarkCount, 10) || 3
    const spikes = await getSpikeDetails({ roomId, bucketMs, minMarkCount })
    res.json({ success: true, ...spikes })
  } catch (err) {
    console.error('[doubts] timeline-spike error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch timeline spikes' })
  }
})

/**
 * GET /api/doubts/room/:roomId/signals
 * Returns every signal for the room with time-anchored metadata so the teacher
 * can see "what each student said when they tapped".
 */
router.get('/room/:roomId/signals', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const { roomId } = req.params
    const room = await Room.findById(roomId).select('_id teacher')
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' })
    if (String(room.teacher) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only the room teacher can view doubt signals' })
    }
    const signals = await getSignalsForRoom(roomId, { limit: parseInt(req.query.limit, 10) || 200 })
    res.json({ success: true, signals })
  } catch (err) {
    console.error('[doubts] signals-list error:', err)
    res.status(500).json({ success: false, error: 'Failed to fetch signals' })
  }
})

export default router