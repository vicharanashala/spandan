import express from 'express'
import User from '../models/User.js'
import Room from '../models/Room.js'
import Question from '../models/Question.js'
import Response from '../models/Response.js'
import { authenticate, authorizeAdmin, clearUserCache } from '../middleware/auth.js'

const router = express.Router()

// Every admin route requires a signed-in admin (isAdmin flag OR SPANDAN_ADMIN_EMAILS allowlist).
router.use(authenticate, authorizeAdmin)

// Platform overview statistics for the Admin role (closes #145)
router.get('/stats', async (req, res) => {
  try {
    const [
      totalTeachers,
      pendingTeachers,
      approvedTeachers,
      rejectedTeachers,
      totalStudents,
      totalRooms,
      activeRoomsCount,
      totalQuestions,
      totalResponses,
      recentActiveRooms,
      dailySignups
    ] = await Promise.all([
      User.countDocuments({ role: 'teacher' }),
      User.countDocuments({ role: 'teacher', teacherApprovalStatus: 'pending' }),
      User.countDocuments({ role: 'teacher', teacherApprovalStatus: 'approved' }),
      User.countDocuments({ role: 'teacher', teacherApprovalStatus: 'rejected' }),
      User.countDocuments({ role: 'student' }),
      Room.countDocuments({}),
      Room.countDocuments({ isActive: true, endedAt: null }),
      Question.countDocuments({}),
      Response.countDocuments({}),
      Room.find({ isActive: true, endedAt: null })
        .populate('teacher', 'name email')
        .select('name code settings.mode createdAt teacher')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      User.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
            teachers: { $sum: { $cond: [{ $eq: ['$role', 'teacher'] }, 1, 0] } },
            students: { $sum: { $cond: [{ $eq: ['$role', 'student'] }, 1, 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ])

    res.json({
      teachers: {
        total: totalTeachers,
        pending: pendingTeachers,
        approved: approvedTeachers,
        rejected: rejectedTeachers
      },
      students: {
        total: totalStudents
      },
      rooms: {
        total: totalRooms,
        active: activeRoomsCount,
        recentActive: recentActiveRooms
      },
      engagement: {
        totalQuestions,
        totalResponses
      },
      dailySignups
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

const STATUSES = ['pending', 'approved', 'rejected']
const SAFE_FIELDS = 'name email teacherApprovalStatus isActive createdAt approvedAt approvedBy rejectionReason'

// List teacher accounts by approval status (default: pending). Used by the admin page.
router.get('/teacher-requests', async (req, res) => {
  try {
    const status = req.query.status
    const filter = { role: 'teacher' }
    if (STATUSES.includes(status)) filter.teacherApprovalStatus = status
    else if (status && status !== 'all') return res.status(400).json({ error: 'Invalid status filter' })

    const requests = await User.find(filter).select(SAFE_FIELDS).sort({ createdAt: -1 }).lean()
    const counts = {}
    for (const s of STATUSES) counts[s] = await User.countDocuments({ role: 'teacher', teacherApprovalStatus: s })
    res.json({ requests, counts })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Approve a pending teacher: they can now sign in and use teacher features.
router.post('/teacher-requests/:id/approve', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
    if (!user || user.role !== 'teacher') return res.status(404).json({ error: 'Teacher account not found' })

    user.teacherApprovalStatus = 'approved'
    user.approvedBy = req.user._id
    user.approvedAt = new Date()
    user.rejectionReason = ''
    user.isActive = true
    await user.save()
    clearUserCache() // reflect immediately, not after the auth-cache TTL

    res.json({ message: 'Teacher approved', user: user.toJSON() })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Reject a teacher request (optionally with a reason). They stay unable to sign in.
router.post('/teacher-requests/:id/reject', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
    if (!user || user.role !== 'teacher') return res.status(404).json({ error: 'Teacher account not found' })

    user.teacherApprovalStatus = 'rejected'
    user.rejectionReason = (req.body?.reason || '').toString().slice(0, 500)
    user.approvedBy = req.user._id
    user.approvedAt = new Date()
    await user.save()
    clearUserCache()

    res.json({ message: 'Teacher request rejected', user: user.toJSON() })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
