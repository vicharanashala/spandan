import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import {
  getStudentNotifications,
  acceptNotification,
  declineNotification,
  markNotificationAsRead
} from '../services/notificationService.js'

const router = express.Router()

// List pending notifications for the current student
router.get('/', authenticate, authorize('student'), async (req, res) => {
  try {
    const data = await getStudentNotifications(req.user._id)
    res.json(data)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// Accept a class invite
router.post('/:id/accept', authenticate, authorize('student'), async (req, res) => {
  try {
    const result = await acceptNotification(req.params.id, req.user._id)

    const io = req.app.get('io')
    if (io) {
      io.emit('class:member-updated', {
        classId: result.class._id,
        studentId: req.user._id,
        status: 'active',
        member: result.member
      })
      io.emit('class:updated', { classId: result.class._id })
      io.emit('notification:updated', { userId: req.user._id })
    }

    res.json(result)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// Decline a class invite
router.post('/:id/decline', authenticate, authorize('student'), async (req, res) => {
  try {
    const result = await declineNotification(req.params.id, req.user._id)

    const io = req.app.get('io')
    if (io) {
      io.emit('class:member-updated', {
        classId: result.classId,
        studentId: req.user._id,
        status: 'declined'
      })
      io.emit('notification:updated', { userId: req.user._id })
    }

    res.json(result)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// Mark notification as read
router.patch('/:id/read', authenticate, authorize('student'), async (req, res) => {
  try {
    const notification = await markNotificationAsRead(req.params.id, req.user._id)
    res.json({ notification })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

export default router
