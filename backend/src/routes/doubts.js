import express from 'express'
import { authenticate } from '../middleware/auth.js'
import Doubt from '../models/Doubt.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'

const router = express.Router()
router.use(authenticate)

// GET /api/doubts/:roomId - Get all doubts for a room (sorted by upvotes desc)
router.get('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params
    const userId = req.user._id

    const room = await Room.findById(roomId).select('teacher code isActive').lean()
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    const isTeacher = room.teacher.toString() === userId.toString()
    if (!isTeacher) {
      const isMember = await RoomMember.findOne({ roomId, studentId: userId }).select('_id').lean()
      if (!isMember) {
        return res.status(403).json({ error: 'You are not a member of this room' })
      }
    }

    const doubts = await Doubt.find({ roomId })
      .sort({ isResolved: 1, upvoteCount: -1, createdAt: 1 })
      .populate('studentId', 'name email')
      .lean()

    // Sanitize payload: Doubts are anonymous to peers.
    // To prevent harassment/abusive posts, the owning teacher retains accountability audit fields.
    const sanitizedDoubts = doubts.map(d => ({
      _id: d._id,
      text: d.text,
      upvoteCount: d.upvoteCount || 0,
      isResolved: !!d.isResolved,
      createdAt: d.createdAt,
      hasUpvoted: (d.upvotes || []).some(id => id.toString() === userId.toString()),
      ...(isTeacher && d.studentId ? {
        authorName: d.studentId.name,
        authorEmail: d.studentId.email
      } : {})
    }))

    res.json({ success: true, doubts: sanitizedDoubts })
  } catch (error) {
    console.error('Error fetching doubts:', error)
    res.status(500).json({ error: 'Failed to fetch doubts' })
  }
})

// POST /api/doubts - Post a new anonymous doubt (members only, max 500 chars, blocked after room ends)
router.post('/', async (req, res) => {
  try {
    const { roomId, text } = req.body
    const userId = req.user._id

    if (!roomId || !text || !text.trim()) {
      return res.status(400).json({ error: 'Room ID and doubt text are required' })
    }

    if (text.trim().length > 500) {
      return res.status(400).json({ error: 'Doubt cannot exceed 500 characters' })
    }

    const room = await Room.findById(roomId).select('code endedAt teacher').lean()
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    if (room.endedAt) {
      return res.status(400).json({ error: 'Cannot post doubts to an ended room' })
    }

    // Verify caller is a member of the room (or teacher)
    const isTeacher = room.teacher && room.teacher.toString() === userId.toString()
    if (!isTeacher) {
      const isMember = await RoomMember.findOne({ roomId, studentId: userId }).select('_id').lean()
      if (!isMember) {
        return res.status(403).json({ error: 'Only room members can post doubts' })
      }
    }

    const doubt = new Doubt({
      roomId,
      studentId: userId,
      text: text.trim().slice(0, 500),
      upvotes: [],
      upvoteCount: 0
    })

    await doubt.save()

    const sanitized = {
      _id: doubt._id,
      text: doubt.text,
      upvoteCount: 0,
      isResolved: false,
      createdAt: doubt.createdAt,
      hasUpvoted: false
    }

    // Broadcast new doubt to the room via Socket.IO (100% anonymous to all)
    const io = req.app.get('io')
    if (io && room.code) {
      io.to(room.code).emit('doubt:new', sanitized)
    }

    res.status(201).json({ success: true, doubt: sanitized })
  } catch (error) {
    console.error('Error posting doubt:', error)
    res.status(500).json({ error: 'Failed to post doubt' })
  }
})

// POST /api/doubts/:id/upvote - Idempotent upvote on a doubt (a second tap must not raise the count)
router.post('/:id/upvote', async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user._id

    const doubt = await Doubt.findById(id)
    if (!doubt) {
      return res.status(404).json({ error: 'Doubt not found' })
    }

    const room = await Room.findById(doubt.roomId).select('code endedAt teacher').lean()
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    if (room.endedAt) {
      return res.status(400).json({ error: 'Cannot upvote doubts in an ended room' })
    }

    const isTeacher = room.teacher && room.teacher.toString() === userId.toString()
    if (!isTeacher) {
      const isMember = await RoomMember.findOne({ roomId: doubt.roomId, studentId: userId }).select('_id').lean()
      if (!isMember) {
        return res.status(403).json({ error: 'Only room members can upvote doubts' })
      }
    }

    // Idempotent upvote: if already upvoted, keep hasUpvoted: true and do NOT increment count
    const alreadyUpvoted = doubt.upvotes.some(uId => uId.toString() === userId.toString())
    if (!alreadyUpvoted) {
      doubt.upvotes.push(userId)
      doubt.upvoteCount = doubt.upvotes.length
      await doubt.save()

      // Broadcast upvote update to room
      const io = req.app.get('io')
      if (io && room?.code) {
        io.to(room.code).emit('doubt:upvoted', {
          doubtId: doubt._id,
          upvoteCount: doubt.upvoteCount
        })
      }
    }

    res.json({
      success: true,
      doubtId: doubt._id,
      upvoteCount: doubt.upvoteCount,
      hasUpvoted: true
    })
  } catch (error) {
    console.error('Error toggling doubt upvote:', error)
    res.status(500).json({ error: 'Failed to process upvote' })
  }
})

// PATCH /api/doubts/:id/resolve - Teacher marks doubt as addressed/resolved
router.patch('/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user._id

    const doubt = await Doubt.findById(id)
    if (!doubt) {
      return res.status(404).json({ error: 'Doubt not found' })
    }

    const room = await Room.findById(doubt.roomId).select('teacher code').lean()
    if (!room || room.teacher.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only the room teacher can resolve doubts' })
    }

    doubt.isResolved = !doubt.isResolved
    await doubt.save()

    const io = req.app.get('io')
    if (io && room.code) {
      io.to(room.code).emit('doubt:resolved', {
        doubtId: doubt._id,
        isResolved: doubt.isResolved
      })
    }

    res.json({ success: true, isResolved: doubt.isResolved })
  } catch (error) {
    console.error('Error resolving doubt:', error)
    res.status(500).json({ error: 'Failed to resolve doubt' })
  }
})

// DELETE /api/doubts/:id - Teacher deletes an inappropriate, spam, or abusive doubt
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user._id

    const doubt = await Doubt.findById(id)
    if (!doubt) {
      return res.status(404).json({ error: 'Doubt not found' })
    }

    const room = await Room.findById(doubt.roomId).select('teacher code').lean()
    if (!room || room.teacher.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only the room teacher can delete doubts' })
    }

    await Doubt.findByIdAndDelete(id)

    const io = req.app.get('io')
    if (io && room.code) {
      io.to(room.code).emit('doubt:deleted', { doubtId: id })
    }

    res.json({ success: true, doubtId: id })
  } catch (error) {
    console.error('Error deleting doubt:', error)
    res.status(500).json({ error: 'Failed to delete doubt' })
  }
})

export default router
