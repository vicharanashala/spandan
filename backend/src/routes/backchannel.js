import express from 'express'
import mongoose from 'mongoose'
import { authenticate, authorize } from '../middleware/auth.js'
import BackchannelQuestion from '../models/BackchannelQuestion.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import { sanitize } from '../utils/sanitize.js'

const router = express.Router()

router.use(authenticate)

const getAuthorizedRoom = async (roomId, user) => {
  if (!mongoose.Types.ObjectId.isValid(roomId)) {
    const error = new Error('Invalid roomId')
    error.status = 400
    throw error
  }

  const room = await Room.findById(roomId)
  if (!room) {
    const error = new Error('Room not found')
    error.status = 404
    throw error
  }

  const isTeacher = room.teacher.toString() === user._id.toString()
  const isStudentMember = await RoomMember.findOne({ roomId, studentId: user._id })

  if (!isTeacher && !isStudentMember) {
    const error = new Error('Not authorized to access backchannel for this room')
    error.status = 403
    throw error
  }

  return { room, isTeacher }
}

const sortBackchannelQuestions = (questions) => {
  return questions.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes
    return new Date(a.createdAt) - new Date(b.createdAt)
  })
}

const emitBackchannelUpdate = (req, room) => {
  const io = req.app.get('io')
  if (io && room?.code) {
    io.to(room.code).emit('backchannel:updated', { roomId: room._id })
  }
}

router.get('/', async (req, res) => {
  try {
    const { roomId } = req.query
    if (!roomId) return res.status(400).json({ error: 'roomId is required' })

    await getAuthorizedRoom(roomId, req.user)

    const questions = await BackchannelQuestion.find({ roomId })
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      questions: sortBackchannelQuestions(questions.map(question => question.toClient(req.user._id)))
    })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch backchannel questions' })
  }
})

router.post('/', authorize('student'), async (req, res) => {
  try {
    const { roomId, text } = req.body
    if (!roomId || !text || !String(text).trim()) {
      return res.status(400).json({ error: 'roomId and question text are required' })
    }

    const { room } = await getAuthorizedRoom(roomId, req.user)
    if (room.endedAt) {
      return res.status(400).json({ error: 'Cannot submit questions after the room has ended' })
    }

    const question = await BackchannelQuestion.create({
      roomId,
      text: sanitize(String(text).trim()).slice(0, 500),
      createdBy: req.user._id,
      upvotedBy: [req.user._id]
    })

    emitBackchannelUpdate(req, room)

    res.status(201).json({
      success: true,
      question: question.toClient(req.user._id)
    })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to submit backchannel question' })
  }
})

router.put('/:id/upvote', authorize('student'), async (req, res) => {
  try {
    const question = await BackchannelQuestion.findById(req.params.id)
    if (!question) return res.status(404).json({ error: 'Question not found' })

    const { room } = await getAuthorizedRoom(question.roomId, req.user)
    if (question.status === 'resolved') {
      return res.status(400).json({ error: 'Cannot upvote a resolved question' })
    }

    const userId = req.user._id.toString()
    const hasUpvoted = question.upvotedBy.some(id => id.toString() === userId)

    if (hasUpvoted) {
      question.upvotedBy = question.upvotedBy.filter(id => id.toString() !== userId)
    } else {
      question.upvotedBy.push(req.user._id)
    }

    await question.save()
    emitBackchannelUpdate(req, room)

    res.json({
      success: true,
      question: question.toClient(req.user._id)
    })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to update upvote' })
  }
})

router.put('/:id/resolve', authorize('teacher'), async (req, res) => {
  try {
    const question = await BackchannelQuestion.findById(req.params.id)
    if (!question) return res.status(404).json({ error: 'Question not found' })

    const { room, isTeacher } = await getAuthorizedRoom(question.roomId, req.user)
    if (!isTeacher) return res.status(403).json({ error: 'Only the room teacher can resolve questions' })

    question.status = 'resolved'
    question.resolvedAt = new Date()
    question.resolvedBy = req.user._id
    await question.save()

    emitBackchannelUpdate(req, room)

    res.json({
      success: true,
      question: question.toClient(req.user._id)
    })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to resolve question' })
  }
})

export default router
