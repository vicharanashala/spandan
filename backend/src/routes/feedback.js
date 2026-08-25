import express from 'express'
import mongoose from 'mongoose'
import ExcelJS from 'exceljs'
import { authenticate, authorize } from '../middleware/auth.js'
import Feedback, { FEEDBACK_FACILITATORS } from '../models/Feedback.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import { maskEmail } from '../utils/maskEmail.js'

const router = express.Router()

const SESSION_SUMMARY_MAX_LENGTH = 150
const WHAT_WORKED_WELL_MAX_LENGTH = 250
const WHAT_UNCLEAR_MAX_LENGTH = 250

router.use(authenticate)

function isNonEmptyText(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength
}

function isOptionalText(value, maxLength) {
  return value === undefined || (typeof value === 'string' && value.trim().length <= maxLength)
}

async function getOwnedRoom(roomId, currentUser) {
  if (!mongoose.Types.ObjectId.isValid(roomId)) return null
  const room = await Room.findById(roomId).lean()
  if (!room) return null
  return room.teacher.toString() === currentUser._id.toString() ? room : false
}

function serializeFeedback(feedback) {
  const student = feedback.studentId
  return {
    studentId: String(student?._id || student),
    name: student?.name || '',
    maskedEmail: maskEmail(student?.email),
    rating: feedback.rating,
    sessionSummary: feedback.sessionSummary,
    whatWorkedWell: feedback.whatWorkedWell,
    whatUnclear: feedback.whatUnclear || '',
    facilitators: feedback.facilitators || [],
    submittedAt: feedback.createdAt
  }
}

async function getRoomFeedback(roomId) {
  const feedback = await Feedback.find({ roomId })
    .populate('studentId', 'name email')
    .sort({ createdAt: -1 })
    .lean()
  return feedback.map(serializeFeedback)
}

// POST /api/feedback - A student submits feedback once a room has ended.
router.post('/', authorize('student'), async (req, res) => {
  try {
    const { roomId, rating, sessionSummary, whatWorkedWell, whatUnclear, facilitators } = req.body

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(404).json({ error: 'Room not found' })
    }

    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    if (!room.endedAt) {
      return res.status(400).json({ error: 'Room must be ended to submit feedback' })
    }

    const membership = await RoomMember.findOne({ roomId, studentId: req.user._id }).select('_id').lean()
    if (!membership) {
      return res.status(403).json({ error: 'You have not joined this room' })
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' })
    }

    if (!isNonEmptyText(sessionSummary, SESSION_SUMMARY_MAX_LENGTH)) {
      return res.status(400).json({ error: 'Session summary is required and must not exceed 150 characters' })
    }

    if (!isNonEmptyText(whatWorkedWell, WHAT_WORKED_WELL_MAX_LENGTH)) {
      return res.status(400).json({ error: 'What worked well is required and must not exceed 250 characters' })
    }

    if (!isOptionalText(whatUnclear, WHAT_UNCLEAR_MAX_LENGTH)) {
      return res.status(400).json({ error: 'What was unclear must not exceed 250 characters' })
    }

    if (!Array.isArray(facilitators) || facilitators.length === 0 ||
      facilitators.some((facilitator) => !FEEDBACK_FACILITATORS.includes(facilitator))) {
      return res.status(400).json({ error: 'Select at least one valid facilitator' })
    }

    const feedback = await Feedback.create({
      roomId,
      studentId: req.user._id,
      rating,
      sessionSummary,
      whatWorkedWell,
      whatUnclear,
      facilitators
    })

    res.status(201).json({ success: true, feedback })
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "You've already submitted feedback for this room" })
    }
    console.error('Error submitting feedback:', error)
    res.status(500).json({ success: false, error: 'Failed to submit feedback' })
  }
})

// GET /api/feedback/room/:roomId/status - Current student's submission status.
router.get('/room/:roomId/status', authorize('student'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.roomId)) {
      return res.json({ submitted: false })
    }
    const feedback = await Feedback.exists({ roomId: req.params.roomId, studentId: req.user._id })
    res.json({ submitted: !!feedback })
  } catch (error) {
    console.error('Error fetching feedback status:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch feedback status' })
  }
})

// GET /api/feedback/room/:roomId - Owner-only feedback list for a completed room.
router.get('/room/:roomId', authorize('teacher'), async (req, res) => {
  try {
    const room = await getOwnedRoom(req.params.roomId, req.user)
    if (room === null) return res.status(404).json({ error: 'Room not found' })
    if (room === false) return res.status(403).json({ error: 'Not authorized to view this room\'s feedback' })

    const feedback = await getRoomFeedback(req.params.roomId)
    res.json({ success: true, count: feedback.length, feedback })
  } catch (error) {
    console.error('Error fetching room feedback:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch room feedback' })
  }
})

// GET /api/feedback/room/:roomId/export - Owner-only XLSX feedback export.
router.get('/room/:roomId/export', authorize('teacher'), async (req, res) => {
  try {
    const room = await getOwnedRoom(req.params.roomId, req.user)
    if (room === null) return res.status(404).json({ error: 'Room not found' })
    if (room === false) return res.status(403).json({ error: 'Not authorized to export this room\'s feedback' })

    const feedback = await getRoomFeedback(req.params.roomId)
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Feedback')
    sheet.columns = [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Masked Email', key: 'maskedEmail', width: 30 },
      { header: 'Rating', key: 'rating', width: 10 },
      { header: 'Session Summary', key: 'sessionSummary', width: 35 },
      { header: 'What Worked Well', key: 'whatWorkedWell', width: 45 },
      { header: "What's Unclear", key: 'whatUnclear', width: 45 },
      { header: 'Facilitators', key: 'facilitators', width: 30 },
      { header: 'Submitted At', key: 'submittedAt', width: 24 }
    ]
    sheet.getRow(1).font = { bold: true }
    feedback.forEach((entry) => {
      sheet.addRow({
        ...entry,
        facilitators: entry.facilitators.join(', '),
        submittedAt: entry.submittedAt
          ? new Date(entry.submittedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
          : ''
      })
    })

    const safeName = (room.name || String(room._id)).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="Spandan_Feedback_${safeName}.xlsx"`)
    await workbook.xlsx.write(res)
    res.end()
  } catch (error) {
    console.error('Feedback XLSX export error:', error)
    if (!res.headersSent) res.status(500).json({ error: 'Failed to export feedback' })
    else res.end()
  }
})

export default router
