import express from 'express'
import { authenticate } from '../middleware/auth.js'

import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import LearningReport from '../models/LearningReport.js'

const router = express.Router()

router.use(authenticate)

// GET /api/learning-reports/:roomId
// Students can retrieve only their own report for a room.
// Teachers can retrieve reports for rooms they own.
router.get('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params
    const userId = req.user._id

    const room = await Room.findById(roomId).lean()

    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      })
    }

    const isTeacher = String(room.teacher) === String(userId)

    if (!isTeacher) {
      const membership = await RoomMember.findOne({
        roomId,
        studentId: userId
      }).lean()

      if (!membership) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to view this learning report'
        })
      }
    }

    if (!room.endedAt) {
      return res.status(409).json({
        success: false,
        error: 'Learning report is available only after the session ends'
      })
    }

    const report = await LearningReport.findOne({
      roomId,
      studentId: userId
    }).lean()

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Learning report not found'
      })
    }

    res.json({
      success: true,
      report
    })
  } catch (error) {
    console.error('Failed to fetch learning report:', error)

    res.status(500).json({
      success: false,
      error: 'Failed to fetch learning report'
    })
  }
})

export default router