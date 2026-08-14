import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { Room } from '../models/index.js'
import {
  setTopic,
  deleteTopic,
  listTopics
} from '../services/topicService.js'

const router = express.Router()

/**
 * POST /api/topics/room/:roomId
 * Teacher sets a topic marker (start time + label). Replaces any existing
 * marker at the same startMs. Body: { startMs, endMs?, label, note? }.
 */
router.post('/room/:roomId', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const { roomId } = req.params
    const room = await Room.findById(roomId).select('_id teacher')
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' })
    if (String(room.teacher) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only the room teacher can set topics' })
    }
    const result = await setTopic({
      roomId,
      teacherId: req.user._id,
      startMs: req.body.startMs,
      endMs: req.body.endMs,
      label: req.body.label,
      note: req.body.note
    })
    if (!result.ok) return res.status(400).json({ success: false, error: result.reason })
    res.json({ success: true, marker: result.marker })
  } catch (err) {
    console.error('[topics] set error:', err)
    res.status(500).json({ success: false, error: 'Failed to set topic' })
  }
})

/**
 * DELETE /api/topics/room/:roomId/:markerId
 * Remove a topic marker. Teacher-only.
 */
router.delete('/room/:roomId/:markerId', authenticate, authorize('teacher', 'admin'), async (req, res) => {
  try {
    const { roomId, markerId } = req.params
    const room = await Room.findById(roomId).select('_id teacher')
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' })
    if (String(room.teacher) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only the room teacher can delete topics' })
    }
    const result = await deleteTopic({ roomId, teacherId: req.user._id, markerId })
    if (!result.ok) return res.status(400).json({ success: false, error: result.reason })
    res.json({ success: true, deletedCount: result.deletedCount })
  } catch (err) {
    console.error('[topics] delete error:', err)
    res.status(500).json({ success: false, error: 'Failed to delete topic' })
  }
})

/**
 * GET /api/topics/room/:roomId
 * List all topic markers for a room (start-time ascending).
 * Anyone in the room can view -- students see topics too.
 */
router.get('/room/:roomId', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params
    const result = await listTopics(roomId)
    if (!result.ok) return res.status(400).json({ success: false, error: result.reason })
    res.json({ success: true, topics: result.topics })
  } catch (err) {
    console.error('[topics] list error:', err)
    res.status(500).json({ success: false, error: 'Failed to list topics' })
  }
})

export default router