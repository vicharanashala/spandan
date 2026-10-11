import express from 'express'
import Class from '../models/Class.js'
import Room from '../models/Room.js'
import Question from '../models/Question.js'
import Response from '../models/Response.js'
import RoomMember from '../models/RoomMember.js'
import { createRoom } from '../services/roomService.js'
import { authenticate, authorize, requireApprovedTeacher } from '../middleware/auth.js'
import { validate, createClassSchema, joinClassSchema, createClassSessionSchema } from '../middleware/validation.js'

const router = express.Router()

// POST /api/classes - Create a new class (Teacher only)
router.post('/', authenticate, authorize('teacher'), requireApprovedTeacher, validate(createClassSchema), async (req, res) => {
  try {
    const { name, settings } = req.validatedBody

    const newClass = new Class({
      name,
      teacher: req.user._id,
      settings: settings || {}
    })

    await newClass.save()

    res.status(201).json({
      message: 'Class created successfully',
      class: newClass
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/classes - Get classes for current user (Teacher sees owned classes, Student sees joined classes)
router.get('/', authenticate, async (req, res) => {
  try {
    let classes = []

    if (req.user.role === 'teacher') {
      classes = await Class.find({ teacher: req.user._id })
        .sort({ createdAt: -1 })
        .populate('teacher', 'name email')
    } else {
      classes = await Class.find({ members: req.user._id, isActive: true })
        .sort({ createdAt: -1 })
        .populate('teacher', 'name email')
    }

    const classIds = classes.map(c => c._id)

    // Aggregate session counts and find active session for each class
    const [sessionCounts, activeRooms] = await Promise.all([
      Room.aggregate([
        { $match: { classId: { $in: classIds } } },
        { $group: { _id: '$classId', count: { $sum: 1 } } }
      ]),
      Room.find({ classId: { $in: classIds }, isActive: true, endedAt: null })
        .select('_id name code classId createdAt')
    ])

    const countMap = new Map(sessionCounts.map(s => [s._id.toString(), s.count]))
    const activeMap = new Map(activeRooms.map(r => [r.classId.toString(), r]))

    const result = classes.map(cls => {
      const clsObj = cls.toObject()
      return {
        ...clsObj,
        memberCount: cls.members ? cls.members.length : 0,
        sessionCount: countMap.get(cls._id.toString()) || 0,
        activeSession: activeMap.get(cls._id.toString()) || null
      }
    })

    res.json({ classes: result })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/classes/join - Join a class by code (Student only)
router.post('/join', authenticate, authorize('student'), validate(joinClassSchema), async (req, res) => {
  try {
    const { code } = req.validatedBody
    const classDoc = await Class.findByCode(code.trim())

    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found. Please verify the 6-character code.' })
    }

    if (!classDoc.isActive) {
      return res.status(400).json({ error: 'This class is no longer active.' })
    }

    // Add student to class members idempotently
    const alreadyMember = classDoc.members.some(
      m => m.toString() === req.user._id.toString()
    )

    if (!alreadyMember) {
      classDoc.members.push(req.user._id)
      await classDoc.save()
    }

    const populated = await Class.findById(classDoc._id)
      .populate('teacher', 'name email')

    // Also check if there is an active session in progress
    const activeSession = await Room.findOne({
      classId: classDoc._id,
      isActive: true,
      endedAt: null
    }).select('_id name code createdAt')

    res.json({
      message: alreadyMember ? 'You are already a member of this class' : 'Joined class successfully',
      class: {
        ...populated.toObject(),
        memberCount: populated.members.length,
        activeSession
      }
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/classes/:id/sessions - Start a new session (Room) under a Class (Teacher only)
router.post('/:id/sessions', authenticate, authorize('teacher'), requireApprovedTeacher, validate(createClassSessionSchema), async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.id)

    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' })
    }

    if (classDoc.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the class teacher can create sessions for this class' })
    }

    // Count existing sessions to auto-generate a meaningful session name if none provided
    const sessionCount = await Room.countDocuments({ classId: classDoc._id })
    const sessionName = req.validatedBody?.name?.trim() || `${classDoc.name} - Session ${sessionCount + 1}`

    // Merge class settings with any session-specific settings
    const mergedSettings = {
      ...(classDoc.settings ? (classDoc.settings.toObject ? classDoc.settings.toObject() : classDoc.settings) : {}),
      ...(req.validatedBody?.settings || {})
    }

    const room = await createRoom(sessionName, req.user._id, mergedSettings, classDoc._id)

    res.status(201).json({
      message: 'Session created successfully',
      room
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/classes/:id - Get class details and its sessions
router.get('/:id', authenticate, async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.id)
      .populate('teacher', 'name email')
      .populate('members', 'name email')

    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' })
    }

    const isTeacher = classDoc.teacher._id.toString() === req.user._id.toString()
    const isMember = classDoc.members.some(
      m => (m._id ? m._id.toString() : m.toString()) === req.user._id.toString()
    )

    if (!isTeacher && !isMember) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this class.' })
    }

    // Fetch all sessions (rooms) belonging to this class
    const rooms = await Room.find({ classId: classDoc._id })
      .sort({ createdAt: -1 })
      .select('_id name code isActive endedAt createdAt settings')

    const roomIds = rooms.map(r => r._id)

    // Aggregate participant counts and question counts for each session
    const [participantCounts, questionCounts] = await Promise.all([
      RoomMember.aggregate([
        { $match: { roomId: { $in: roomIds } } },
        { $group: { _id: '$roomId', count: { $sum: 1 } } }
      ]),
      Question.aggregate([
        { $match: { roomId: { $in: roomIds }, status: 'approved' } },
        { $group: { _id: '$roomId', count: { $sum: 1 } } }
      ])
    ])

    const partMap = new Map(participantCounts.map(p => [p._id.toString(), p.count]))
    const qMap = new Map(questionCounts.map(q => [q._id.toString(), q.count]))

    const sessions = rooms.map(r => ({
      ...r.toObject(),
      participantCount: partMap.get(r._id.toString()) || 0,
      questionCount: qMap.get(r._id.toString()) || 0
    }))

    const classObj = classDoc.toObject()
    // For students, don't expose full member email details if not needed, keep name
    if (!isTeacher) {
      classObj.members = classObj.members.map(m => ({ _id: m._id, name: m.name }))
    }

    res.json({
      class: {
        ...classObj,
        memberCount: classDoc.members.length,
        sessionCount: sessions.length
      },
      sessions
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/classes/:id/stats - Get stats across all sessions of this class (Teacher only)
router.get('/:id/stats', authenticate, authorize('teacher'), requireApprovedTeacher, async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.id)

    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found' })
    }

    if (classDoc.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the class teacher can view class statistics' })
    }

    const rooms = await Room.find({ classId: classDoc._id }).select('_id isActive endedAt')
    const roomIds = rooms.map(r => r._id)

    const [questionCount, responseCount, uniqueRespondents] = await Promise.all([
      Question.countDocuments({ roomId: { $in: roomIds }, status: 'approved' }),
      Response.countDocuments({ roomId: { $in: roomIds } }),
      Response.distinct('studentId', { roomId: { $in: roomIds } })
    ])

    const totalSessions = rooms.length
    const activeSessions = rooms.filter(r => r.isActive && !r.endedAt).length
    const completedSessions = rooms.filter(r => !!r.endedAt).length

    res.json({
      stats: {
        totalSessions,
        activeSessions,
        completedSessions,
        enrolledStudents: classDoc.members.length,
        uniqueStudentsParticipated: uniqueRespondents.length,
        totalQuestionsAsked: questionCount,
        totalResponses: responseCount,
        averageResponsesPerSession: totalSessions > 0 ? Math.round(responseCount / totalSessions) : 0
      }
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
