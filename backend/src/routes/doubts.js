import express from 'express'
import Doubt from '../models/Doubt.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { checkRoomOwnership } from '../utils/roomOwnership.js'

const router = express.Router()

router.use(authenticate)

// Shape a doubt for the wire, hiding the author when posted anonymously (unless
// the caller IS that author, so they can still see/manage their own doubt).
export function serializeDoubt(doubt, viewerId) {
  const authorId = String(doubt.student?._id ?? doubt.student)
  const isOwner = String(viewerId) === authorId
  return {
    _id: doubt._id,
    roomId: doubt.roomId,
    text: doubt.text,
    status: doubt.status,
    isAnonymous: doubt.isAnonymous,
    upvoteCount: doubt.upvotes.length,
    hasUpvoted: doubt.upvotes.some(id => String(id) === String(viewerId)),
    isOwner,
    author: doubt.isAnonymous && !isOwner
      ? null
      : (doubt.student?.name || doubt.student?.username || 'Student'),
    createdAt: doubt.createdAt,
    resolvedAt: doubt.resolvedAt
  }
}

// Student posts a doubt during a live room.
router.post('/room/:roomId', authorize('student'), async (req, res) => {
  try {
    const { roomId } = req.params
    const { text, isAnonymous = false } = req.body || {}

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Doubt text is required' })
    }
    if (text.trim().length > 500) {
      return res.status(400).json({ error: 'Doubt cannot exceed 500 characters' })
    }

    const room = await Room.findById(roomId).select('code endedAt teacher').lean()
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (room.endedAt) return res.status(400).json({ error: 'This room has ended' })

    const isMember = await RoomMember.findOne({ roomId, studentId: req.user._id }).select('_id').lean()
    if (!isMember) return res.status(403).json({ error: 'Join this room before raising a doubt' })

    const doubt = await Doubt.create({
      roomId,
      student: req.user._id,
      text: text.trim(),
      isAnonymous: !!isAnonymous
    })
    doubt.student = req.user // populate for serializer without another query

    const payload = serializeDoubt(doubt, req.user._id)

    const io = req.app.get('io')
    if (io && room.code) {
      // Broadcast the anonymized shape to the whole room (teacher included — teacher and students
      // share the same socket room). Anyone who wants to know exactly who's still un-resolved can
      // always re-fetch GET /doubts/room/:roomId, which the teacher's own doubts stay non-anonymous for.
      io.to(room.code).emit('doubt:new', { ...payload, author: doubt.isAnonymous ? null : payload.author, isOwner: undefined })
    }

    res.status(201).json({ doubt: payload })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// List doubts for a room — open first, most-upvoted first; used by both the
// teacher's queue view and the student's shared queue.
router.get('/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params
    const room = await Room.findById(roomId).select('teacher').lean()
    if (!room) return res.status(404).json({ error: 'Room not found' })

    if (req.user.role === 'student') {
      const isMember = await RoomMember.findOne({ roomId, studentId: req.user._id }).select('_id').lean()
      if (!isMember) return res.status(403).json({ error: 'Not authorized for this room' })
    } else {
      const ownership = checkRoomOwnership(room, req.user._id)
      if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error })
    }

    const doubts = await Doubt.find({ roomId })
      .populate('student', 'name username')
      .sort({ status: 1, createdAt: -1 })
      .lean()

    doubts.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1
      if (a.status === 'open' && b.upvotes.length !== a.upvotes.length) return b.upvotes.length - a.upvotes.length
      return new Date(b.createdAt) - new Date(a.createdAt)
    })

    res.json({ doubts: doubts.map(d => serializeDoubt(d, req.user._id)) })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Toggle upvote — any room member (student) can upvote/un-upvote a doubt to
// signal "I have this question too", helping the teacher prioritize.
router.post('/:id/upvote', authorize('student'), async (req, res) => {
  try {
    const doubt = await Doubt.findById(req.params.id)
    if (!doubt) return res.status(404).json({ error: 'Doubt not found' })

    const isMember = await RoomMember.findOne({ roomId: doubt.roomId, studentId: req.user._id }).select('_id').lean()
    if (!isMember) return res.status(403).json({ error: 'Not authorized for this room' })

    const idx = doubt.upvotes.findIndex(id => String(id) === String(req.user._id))
    if (idx >= 0) doubt.upvotes.splice(idx, 1)
    else doubt.upvotes.push(req.user._id)
    await doubt.save()

    const room = await Room.findById(doubt.roomId).select('code').lean()
    const io = req.app.get('io')
    if (io && room?.code) {
      io.to(room.code).emit('doubt:upvoted', { doubtId: doubt._id, upvoteCount: doubt.upvotes.length })
    }

    res.json({ doubtId: doubt._id, upvoteCount: doubt.upvotes.length, hasUpvoted: idx < 0 })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Teacher marks a doubt resolved (e.g. after addressing it out loud).
router.patch('/:id/resolve', authorize('teacher'), async (req, res) => {
  try {
    const doubt = await Doubt.findById(req.params.id)
    if (!doubt) return res.status(404).json({ error: 'Doubt not found' })

    const room = await Room.findById(doubt.roomId).select('teacher code').lean()
    const ownership = checkRoomOwnership(room, req.user._id)
    if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.error })

    doubt.status = 'resolved'
    doubt.resolvedAt = new Date()
    await doubt.save()

    const io = req.app.get('io')
    if (io && room?.code) {
      io.to(room.code).emit('doubt:resolved', { doubtId: doubt._id })
    }

    res.json({ doubtId: doubt._id, status: 'resolved' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Author or the room's teacher can delete a doubt (e.g. posted by mistake, or off-topic).
router.delete('/:id', async (req, res) => {
  try {
    const doubt = await Doubt.findById(req.params.id)
    if (!doubt) return res.status(404).json({ error: 'Doubt not found' })

    const room = await Room.findById(doubt.roomId).select('teacher code').lean()
    const isAuthor = String(doubt.student) === String(req.user._id)
    const isOwningTeacher = req.user.role === 'teacher' && checkRoomOwnership(room, req.user._id).ok

    if (!isAuthor && !isOwningTeacher) {
      return res.status(403).json({ error: 'Not authorized to delete this doubt' })
    }

    await doubt.deleteOne()

    const io = req.app.get('io')
    if (io && room?.code) {
      io.to(room.code).emit('doubt:deleted', { doubtId: doubt._id })
    }

    res.json({ message: 'Doubt deleted' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
