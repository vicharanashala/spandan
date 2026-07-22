import express from 'express'
import { authenticate } from '../middleware/auth.js'
import { getRoomState, getActivePoll } from '../services/roomStateService.js'
import { calculateTTAScore } from '../utils/scoring.js'
import mongoose from 'mongoose'
import Response from '../models/Response.js'
import Question from '../models/Question.js'
import Room from '../models/Room.js'

const router = express.Router()

router.use(authenticate)

// POST /api/live/:roomId/join
// Student (or teacher) joins the live room
router.post('/:roomId/join', async (req, res) => {
  const { roomId } = req.params
  const userId = req.user._id.toString()
  const role = req.user.role
  
  // Find room Code
  const room = await Room.findById(roomId)
  if (!room) return res.status(404).json({ error: 'Room not found' })
  
  const roomCode = room.code
  const roomState = getRoomState(roomCode)
  
  if (role === 'student') {
    roomState.students.set(userId, {
      status: 'connected',
      hasAnswered: false,
      lastSeen: Date.now(),
      hasTabSwitched: false,
      joinedAt: roomState.students.get(userId)?.joinedAt || Date.now(),
      totalTimeInRoomMs: roomState.students.get(userId)?.totalTimeInRoomMs || 0
    })
  }

  res.json({ success: true, roomCode })
})

// GET /api/live/:roomCode/sync
// Core polling endpoint
router.get('/:roomCode/sync', async (req, res) => {
  const { roomCode } = req.params
  const userId = req.user._id.toString()
  const role = req.user.role

  const roomState = getRoomState(roomCode)
  
  if (role === 'student' && roomState.students.has(userId)) {
    const studentState = roomState.students.get(userId)
    const now = Date.now()
    
    // Accumulate total time in room based on interval between syncs (capped at 5s to avoid offline jumps)
    const timeSinceLastSeen = now - studentState.lastSeen
    if (timeSinceLastSeen > 0 && timeSinceLastSeen < 5000) {
      studentState.totalTimeInRoomMs = (studentState.totalTimeInRoomMs || 0) + timeSinceLastSeen
    }
    
    studentState.lastSeen = now
    studentState.status = 'connected'
  }

  const pollData = getActivePoll(roomCode)
  
  // Optionally, if Teacher, return the number of connected students or live answers
  let teacherData = null
  if (role === 'teacher') {
    let connectedStudents = 0
    roomState.students.forEach(s => {
      if (s.status === 'connected') connectedStudents++
    })
    teacherData = { connectedStudents }
  }

  res.json({
    success: true,
    pollData,
    teacherData,
    studentHasAnswered: role === 'student' ? roomState.students.get(userId)?.hasAnswered : false
  })
})

// POST /api/live/:roomCode/question
// Teacher pushes a question
router.post('/:roomCode/question', async (req, res) => {
  const { roomCode } = req.params
  const { questionId, text, type, options, category, duration } = req.body
  
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Unauthorized' })
  
  const roomState = getRoomState(roomCode)
  
  // Reset student answers for new poll
  roomState.students.forEach(student => {
    student.hasAnswered = false
  })
  
  const newPoll = {
    questionId, text, type, options, category, duration,
    serverStartTime: Date.now()
  }
  
  roomState.activePoll = newPoll
  
  res.json({ success: true })
})

// POST /api/live/:roomCode/answer
// Student submits an answer
router.post('/:roomCode/answer', async (req, res) => {
  const { roomCode } = req.params
  const { questionId, answer, hasTabSwitched } = req.body
  const userId = req.user._id.toString()
  
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Unauthorized' })
  
  const roomState = getRoomState(roomCode)
  if (!roomState || !roomState.activePoll || roomState.activePoll.questionId !== questionId) {
    return res.status(400).json({ error: 'Poll not active or mismatch' })
  }
  
  const remainingTimeMs = roomState.activePoll.duration - (Date.now() - roomState.activePoll.serverStartTime)
  if (remainingTimeMs <= 0) {
    return res.status(400).json({ error: 'Time is up. Answer not accepted.' })
  }
  
  const studentState = roomState.students.get(userId)
  if (studentState) {
    if (studentState.hasAnswered) {
      return res.status(400).json({ error: 'Answer already locked in.' })
    }
    studentState.hasAnswered = true
    if (hasTabSwitched) {
      studentState.hasTabSwitched = true
      studentState.tabSwitchCount = (studentState.tabSwitchCount || 0) + 1
    }
  }

  // Look up Room ID
  const room = await Room.findOne({ code: roomCode })
  const roomId = room ? room._id : null
  
  const questionDoc = await Question.findById(questionId).catch(() => null)
  const allottedTimeMs = roomState.activePoll.duration
  const basePoints = questionDoc?.points || 1000
  
  const isCorrect = questionDoc ? (questionDoc.correctAnswer === answer) : false
  let score = 0
  if (isCorrect) {
    score = calculateTTAScore(remainingTimeMs, allottedTimeMs, basePoints, 0)
  }
  
  const responseTime = roomState.activePoll.duration - remainingTimeMs

  try {
    const responseDoc = new Response({
      roomId: roomId,
      questionId: questionId.length === 24 ? questionId : new mongoose.Types.ObjectId(),
      studentId: userId.length === 24 ? userId : new mongoose.Types.ObjectId(),
      selectedOption: typeof answer === 'number' ? answer : -1,
      isCorrect: isCorrect,
      responseTime: responseTime,
      points: score,
      tabSwitched: studentState?.hasTabSwitched || false
    })
    await responseDoc.save()
  } catch (e) {
    console.error('Failed to save response to DB:', e.message)
    return res.status(500).json({ error: 'Database save failed' })
  }

  res.json({ success: true, isCorrect, score, responseTime })
})

// POST /api/live/:roomCode/tab-switch
// Increment tab switch count if student unfocuses while NOT answering
router.post('/:roomCode/tab-switch', async (req, res) => {
  const { roomCode } = req.params
  const userId = req.user._id.toString()
  
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Unauthorized' })
  
  const roomState = getRoomState(roomCode)
  const studentState = roomState.students.get(userId)
  
  if (studentState) {
    studentState.hasTabSwitched = true
    studentState.tabSwitchCount = (studentState.tabSwitchCount || 0) + 1
  }
  
  res.json({ success: true })
})

// POST /api/live/:roomCode/leave
// Student leaves the session
router.post('/:roomCode/leave', async (req, res) => {
  const { roomCode } = req.params
  const userId = req.user._id.toString()
  
  const roomState = getRoomState(roomCode)
  if (roomState.students.has(userId)) {
    roomState.students.delete(userId)
  }
  
  // Update RoomMember
  const room = await Room.findOne({ code: roomCode })
  if (room) {
    const mongoose = (await import('mongoose')).default
    await mongoose.model('RoomMember').findOneAndUpdate(
      { roomId: room._id, studentId: userId },
      { $set: { leftAt: new Date() } }
    )
  }
  
  res.json({ success: true })
})

export default router
