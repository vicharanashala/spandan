import express from 'express'
import { createRoom, getRoomById, getRoomByCode, getRoomsByTeacher, getRoomsByStudent, getActiveRoomsByStudent, updateRoom, deleteRoom } from '../services/roomService.js'
import { authenticate } from '../middleware/auth.js'
import { authorize } from '../middleware/auth.js'
import { validate, createRoomSchema } from '../middleware/validation.js'
import { cleanupRoomThrottles } from './responses.js'

const router = express.Router()

// Create new room
router.post('/', authenticate, authorize('teacher'), validate(createRoomSchema), async (req, res) => {
  try {
    const { name, settings } = req.validatedBody
    const room = await createRoom(name, req.user._id, settings)

    res.status(201).json({
      message: 'Room created successfully',
      room
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get rooms for current teacher
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
    const skip = (pageNum - 1) * limitNum

    if (req.user.role === 'teacher') {
      const [rooms, total] = await Promise.all([
        getRoomsByTeacher(req.user._id, { skip, limit: limitNum }),
        req.user.model || Promise.resolve(null)
      ])
      // Count total rooms for teacher
      const Room = (await import('../models/Room.js')).default
      const totalCount = await Room.countDocuments({ teacher: req.user._id })
      res.json({ 
        rooms,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          pages: Math.ceil(totalCount / limitNum)
        }
      })
    } else {
      res.status(403).json({ error: 'Only teachers can view room list' })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get room by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const room = await getRoomById(req.params.id)
    const RoomMember = (await import('../models/RoomMember.js')).default
    const Response = (await import('../models/Response.js')).default
    
    // Check if user is the room teacher (owner) or a student member
    const isOwner = room.teacher._id.toString() === req.user._id.toString()
    const isStudentMember = await RoomMember.findOne({ roomId: req.params.id, studentId: req.user._id })
    const hasResponses = !isOwner && !isStudentMember && req.user.role === 'student'
      ? await Response.findOne({ roomId: req.params.id, studentId: req.user._id })
      : null
    
    // Only the room owner OR room members OR students with responses can access
    if (!isOwner && !isStudentMember && !hasResponses) {
      return res.status(403).json({ error: 'Access denied' })
    }
    
    res.json({ room })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Join room by code (for students)
router.get('/join/:code', authenticate, authorize('student'), async (req, res) => {
  try {
    const RoomMember = (await import('../models/RoomMember.js')).default
    const room = await getRoomByCode(req.params.code)
    
    // Check if room has ended
    if (room.endedAt) {
      return res.status(400).json({ error: 'This room has ended and can no longer be joined' })
    }
    
    // Ensure student is added to RoomMember (idempotent - safe to call multiple times)
    await RoomMember.findOneAndUpdate(
      { roomId: room._id, studentId: req.user._id },
      { roomId: room._id, studentId: req.user._id, joinedAt: new Date() },
      { upsert: true, new: true }
    )
    
    res.json({ room })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Get rooms student has attended (for room history)
router.get('/student/room-history', authenticate, authorize('student'), async (req, res) => {
  try {
    const rooms = await getRoomsByStudent(req.user._id)
    res.json({ rooms })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get active rooms for student (rooms that can be rejoined)
router.get('/student/active', authenticate, authorize('student'), async (req, res) => {
  try {
    const rooms = await getActiveRoomsByStudent(req.user._id)
    res.json({ rooms })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update room
router.put('/:id', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const room = await getRoomById(req.params.id)
    
    if (room.teacher._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the room owner can update the room' })
    }

    // Prevent reactivating an ended room
    if (room.endedAt && req.body.isActive === true) {
      return res.status(400).json({ error: 'Cannot reactivate an ended room' })
    }

    const updatedRoom = await updateRoom(req.params.id, req.body)
    
    // If room is being ended, emit socket event to notify all participants
    if (req.body.isActive === false && updatedRoom.endedAt) {
      const io = req.app.get('io')
      io.to(room.code).emit('room:ended', { roomId: room._id, endedAt: updatedRoom.endedAt })
      // Cleanup throttle maps
      cleanupRoomThrottles(room.code)
    }
    
    res.json({ message: 'Room updated successfully', room: updatedRoom })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Delete room
router.delete('/:id', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const room = await getRoomById(req.params.id)
    
    if (room.teacher._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the room owner can delete the room' })
    }

    await deleteRoom(req.params.id)
    res.json({ message: 'Room deleted successfully' })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Get room members (teacher only)
router.get('/:id/members', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const room = await getRoomById(req.params.id)
    if (room.teacher._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only room owner can view members' })
    }

    const RoomMember = (await import('../models/RoomMember.js')).default

    const members = await RoomMember.find({ roomId: req.params.id })
      .populate('studentId', 'name email enrollmentNumber role')
      .lean()

    // Filter out null studentIds (deleted users) and teachers
    const students = members
      .filter(m => m.studentId && m.studentId.role === 'student')
      .map(m => ({
        _id: m.studentId._id,
        name: m.studentId.name,
        email: m.studentId.email,
        enrollmentNumber: m.studentId.enrollmentNumber,
        joinedAt: m.joinedAt
      }))

    res.json({ success: true, members: students })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch members' })
  }
})

export default router