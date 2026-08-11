import express from 'express'
import mongoose from 'mongoose'
import { authenticate } from '../middleware/auth.js'
import * as peerPresence from '../services/peerPresence.js'

const router = express.Router()
router.use(authenticate)

// Confirms the current user may see this room's peer-discussion data at all: either the
// room's teacher, or a student who has actually joined it (RoomMember row exists).
async function assertRoomAccess(req, roomId) {
  const Room = (await import('../models/Room.js')).default
  const RoomMember = (await import('../models/RoomMember.js')).default
  const room = await Room.findById(roomId)
  if (!room) return { error: 'Room not found', status: 404 }

  const isTeacher = room.teacher.toString() === req.user._id.toString()
  if (isTeacher) return { room, isTeacher: true }

  const isMember = await RoomMember.exists({ roomId, studentId: req.user._id })
  if (!isMember) return { error: 'Not a member of this room', status: 403 }
  return { room, isTeacher: false }
}

// GET /api/peer/questions/:roomId
// Per-question class accuracy — the "was this question hard for everyone?" signal that decides
// whether peer discussion is even offered for that question. Deliberately returns ONLY accuracy
// numbers, no per-student identities or per-option breakdowns — that's the teacher-only
// /responses/stats/room endpoint's job. Available to any room participant (teacher or student).
router.get('/questions/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params
    const access = await assertRoomAccess(req, roomId)
    if (access.error) return res.status(access.status).json({ error: access.error })

    const Question = (await import('../models/Question.js')).default
    const Response = (await import('../models/Response.js')).default

    const questions = await Question.find({
      roomId,
      status: 'approved',
      launchedAt: { $ne: null },
      type: { $in: ['MCQ', 'TF'] }
    })
      .select('_id question type')
      .lean()

    const grouped = await Response.aggregate([
      { $match: { roomId: new mongoose.Types.ObjectId(roomId) } },
      { $group: { _id: '$questionId', total: { $sum: 1 }, correct: { $sum: { $cond: ['$isCorrect', 1, 0] } } } }
    ])
    const byQuestion = new Map(grouped.map((g) => [g._id.toString(), g]))

    const result = questions.map((q) => {
      const g = byQuestion.get(q._id.toString())
      const total = g?.total || 0
      const correct = g?.correct || 0
      return {
        questionId: q._id,
        question: q.question,
        type: q.type,
        totalResponses: total,
        accuracyPercent: total > 0 ? Math.round((correct / total) * 100) : null
      }
    })

    res.json({ success: true, questions: result })
  } catch (error) {
    console.error('Error fetching peer question stats:', error)
    res.status(500).json({ error: 'Failed to fetch question stats' })
  }
})

// GET /api/peer/candidates/:roomId/:questionId
// Students currently online (on the results page) who answered this question correctly —
// excludes the requester. This is what populates the "who can I ask?" picker.
router.get('/candidates/:roomId/:questionId', async (req, res) => {
  try {
    const { roomId, questionId } = req.params
    const access = await assertRoomAccess(req, roomId)
    if (access.error) return res.status(access.status).json({ error: access.error })

    const Response = (await import('../models/Response.js')).default
    const correctResponders = await Response.find({ roomId, questionId, isCorrect: true })
      .select('studentId')
      .lean()
    const correctIds = new Set(correctResponders.map((r) => r.studentId.toString()))

    const online = await peerPresence.listOnline(roomId)
    const candidates = online.filter(
      (o) => correctIds.has(o.studentId) && o.studentId !== req.user._id.toString()
    )

    res.json({ success: true, candidates })
  } catch (error) {
    console.error('Error fetching peer candidates:', error)
    res.status(500).json({ error: 'Failed to fetch candidates' })
  }
})

// GET /api/peer/discussions/:roomId — teacher dashboard: every discussion (pending/active/past)
// for this room, most recent first.
router.get('/discussions/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params
    const access = await assertRoomAccess(req, roomId)
    if (access.error) return res.status(access.status).json({ error: access.error })
    if (!access.isTeacher) return res.status(403).json({ error: 'Teacher only' })

    const PeerDiscussion = (await import('../models/PeerDiscussion.js')).default
    const discussions = await PeerDiscussion.find({ roomId })
      .select('-messages') // teacher dashboard shows status/pairing, not private chat contents
      .populate('questionId', 'question')
      .sort({ requestedAt: -1 })
      .lean()

    res.json({ success: true, discussions })
  } catch (error) {
    console.error('Error fetching room discussions:', error)
    res.status(500).json({ error: 'Failed to fetch discussions' })
  }
})

// GET /api/peer/my-discussions/:roomId — a student's own discussions in this room (active/pending
// first), so a page refresh can resume an in-progress chat instead of losing it.
router.get('/my-discussions/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params
    const access = await assertRoomAccess(req, roomId)
    if (access.error) return res.status(access.status).json({ error: access.error })

    const PeerDiscussion = (await import('../models/PeerDiscussion.js')).default
    const discussions = await PeerDiscussion.find({
      roomId,
      $or: [{ requesterId: req.user._id }, { partnerId: req.user._id }],
      status: { $in: ['pending', 'active'] }
    }).sort({ requestedAt: -1 }).lean()

    res.json({ success: true, discussions })
  } catch (error) {
    console.error('Error fetching my discussions:', error)
    res.status(500).json({ error: 'Failed to fetch discussions' })
  }
})

// GET /api/peer/discussion/:discussionId — full thread (messages included) for one discussion.
// Only its two participants may read it.
router.get('/discussion/:discussionId', async (req, res) => {
  try {
    const PeerDiscussion = (await import('../models/PeerDiscussion.js')).default
    const discussion = await PeerDiscussion.findById(req.params.discussionId).lean()
    if (!discussion) return res.status(404).json({ error: 'Discussion not found' })

    const uid = req.user._id.toString()
    if (discussion.requesterId.toString() !== uid && discussion.partnerId.toString() !== uid) {
      return res.status(403).json({ error: 'Not a participant in this discussion' })
    }

    res.json({ success: true, discussion })
  } catch (error) {
    console.error('Error fetching discussion:', error)
    res.status(500).json({ error: 'Failed to fetch discussion' })
  }
})

export default router
