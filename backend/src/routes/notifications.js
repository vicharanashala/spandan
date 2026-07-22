import express from 'express'
import Notification from '../models/Notification.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()

// Get all uncleared notifications for the logged-in student
router.get('/', authenticate, async (req, res) => {
  try {
    const studentEmail = req.user.email ? req.user.email.toLowerCase() : ''
    const userId = req.user._id

    const notifications = await Notification.find({
      clearedBy: { $ne: userId },
      $or: [
        { emails: { $size: 0 } },
        { emails: { $exists: false } },
        { emails: studentEmail }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(50)

    res.json({ notifications })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    res.status(500).json({ error: 'Failed to fetch notifications' })
  }
})

// Clear notification(s) for the logged-in student
router.post('/clear', authenticate, async (req, res) => {
  try {
    const studentEmail = req.user.email ? req.user.email.toLowerCase() : ''
    const userId = req.user._id
    const { notificationId } = req.body

    if (notificationId) {
      // Clear a single specific notification
      await Notification.findByIdAndUpdate(notificationId, {
        $addToSet: { clearedBy: userId }
      })
    } else {
      // Clear all active uncleared notifications for this student
      await Notification.updateMany(
        {
          clearedBy: { $ne: userId },
          $or: [
            { emails: { $size: 0 } },
            { emails: { $exists: false } },
            { emails: studentEmail }
          ]
        },
        {
          $addToSet: { clearedBy: userId }
        }
      )
    }

    res.json({ message: 'Notifications cleared successfully' })
  } catch (error) {
    console.error('Error clearing notifications:', error)
    res.status(500).json({ error: 'Failed to clear notifications' })
  }
})

export default router
