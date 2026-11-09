import express from 'express'
import {
  createClass,
  archiveClass,
  restoreClass,
  getTeacherClasses,
  getStudentClasses,
  getClassById,
  joinClassByCode,
  updateMemberStatus,
  createClassSession,
  getClassSessions,
  getClassMembersWithPerformance,
  getStudentPerformanceInClass,
  exportClassCsv,
  getClassStats
} from '../services/classService.js'
import { authenticate, authorize, requireApprovedTeacher } from '../middleware/auth.js'

const router = express.Router()

// Create new class (teacher only)
router.post('/', authenticate, authorize('teacher'), requireApprovedTeacher, async (req, res) => {
  try {
    const { name, settings } = req.body
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Class name is required' })
    }

    const newClass = await createClass({
      name: name.trim(),
      teacherId: req.user._id,
      settings: settings || {}
    })

    const io = req.app.get('io')
    if (io) {
      io.emit('class:created', newClass)
    }

    res.status(201).json({
      message: 'Class created successfully',
      class: newClass
    })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// Get classes for current user (teacher: own classes; student: enrolled classes)
router.get('/', authenticate, async (req, res) => {
  try {
    if (req.user.role === 'teacher') {
      const classes = await getTeacherClasses(req.user._id)
      return res.json({ classes })
    } else {
      const classes = await getStudentClasses(req.user._id)
      return res.json({ classes })
    }
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// Student joins class by code
router.post('/join', authenticate, authorize('student'), async (req, res) => {
  try {
    const { code } = req.body
    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Class code is required' })
    }

    const result = await joinClassByCode(code.trim(), req.user._id)

    const io = req.app.get('io')
    if (io) {
      io.emit('class:member-updated', {
        classId: result.class._id,
        studentId: req.user._id,
        status: result.status,
        member: result.member
      })
    }

    res.json({
      message: result.message,
      class: result.class,
      member: result.member,
      status: result.status
    })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// Get class by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const data = await getClassById(req.params.id, req.user)
    res.json(data)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// Archive a class (teacher owner only)
router.post('/:id/archive', authenticate, authorize('teacher'), requireApprovedTeacher, async (req, res) => {
  try {
    const cls = await archiveClass(req.params.id, req.user._id)
    const io = req.app.get('io')
    if (io) {
      io.emit('class:updated', { classId: req.params.id, isActive: false })
    }
    res.json({ message: 'Class archived successfully', class: cls })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// Restore an archived class (teacher owner only)
router.post('/:id/restore', authenticate, authorize('teacher'), requireApprovedTeacher, async (req, res) => {
  try {
    const cls = await restoreClass(req.params.id, req.user._id)
    const io = req.app.get('io')
    if (io) {
      io.emit('class:updated', { classId: req.params.id, isActive: true })
    }
    res.json({ message: 'Class restored successfully', class: cls })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// Update / PATCH class (e.g. { isActive: false/true })
router.patch('/:id', authenticate, authorize('teacher'), requireApprovedTeacher, async (req, res) => {
  try {
    const { isActive } = req.body
    let cls
    if (isActive === false) {
      cls = await archiveClass(req.params.id, req.user._id)
    } else if (isActive === true) {
      cls = await restoreClass(req.params.id, req.user._id)
    } else {
      cls = (await getClassById(req.params.id, req.user))?.class
    }

    const io = req.app.get('io')
    if (io) {
      io.emit('class:updated', { classId: req.params.id, isActive: cls.isActive })
    }
    res.json({ message: 'Class updated successfully', class: cls })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// Get sessions for a class
router.get('/:id/sessions', authenticate, async (req, res) => {
  try {
    // Check access first
    await getClassById(req.params.id, req.user)
    const sessions = await getClassSessions(req.params.id)
    res.json({ sessions })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// Start a new session under a class (blocked if active session exists)
router.post('/:id/sessions', authenticate, authorize('teacher'), requireApprovedTeacher, async (req, res) => {
  try {
    const { name, settings } = req.body
    const room = await createClassSession(req.params.id, req.user._id, {
      name,
      settings: settings || {}
    })

    const io = req.app.get('io')
    if (io) {
      io.emit('class:session-started', {
        classId: req.params.id,
        room: {
          _id: room._id,
          name: room.name,
          code: room.code,
          createdAt: room.createdAt,
          settings: room.settings
        }
      })
      io.emit('class:updated', { classId: req.params.id, hasActiveSession: true })
    }

    res.status(201).json({
      message: 'Session started successfully',
      room
    })
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      code: error.code,
      activeRoomId: error.activeRoomId
    })
  }
})

// Get class overall stats (teacher only)
router.get('/:id/stats', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const stats = await getClassStats(req.params.id, req.user._id)
    res.json({ stats })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// Get class members with aggregated performance (teacher only)
router.get('/:id/members', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const membersData = await getClassMembersWithPerformance(req.params.id, req.user._id)
    res.json(membersData)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// Get performance for a specific student in the class
router.get('/:id/members/:studentId/performance', authenticate, async (req, res) => {
  try {
    // Teachers can view any student; students can only view their own
    if (req.user.role === 'student' && String(req.user._id) !== String(req.params.studentId)) {
      return res.status(403).json({ error: 'You can only view your own performance' })
    }

    const performance = await getStudentPerformanceInClass(req.params.id, req.params.studentId)
    res.json(performance)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// Teacher approves, removes, or rejects student membership
router.patch('/:id/members/:studentId', authenticate, authorize('teacher'), requireApprovedTeacher, async (req, res) => {
  try {
    const { action } = req.body
    if (!action || !['approve', 'remove', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve, remove, or reject' })
    }

    const result = await updateMemberStatus(req.params.id, req.params.studentId, req.user._id, action)

    const io = req.app.get('io')
    if (io) {
      io.emit('class:member-updated', {
        classId: req.params.id,
        studentId: req.params.studentId,
        status: result.member.status,
        member: result.member,
        action
      })
    }

    res.json(result)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

// Export entire class roster and cross-session performance as CSV
router.get('/:id/export', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { csv, filename } = await exportClassCsv(req.params.id, req.user._id)

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csv)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

export default router
