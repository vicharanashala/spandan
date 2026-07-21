import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate, teamBattleConfigSchema } from '../middleware/validation.js'
import { createTeams, getTeamsByRoom, getStudentTeam, deleteTeamsByRoom } from '../services/teamService.js'
import Room from '../models/Room.js'

const router = express.Router()

// Create teams for a room (teacher only)
router.post('/create', authenticate, authorize('teacher'), validate(teamBattleConfigSchema), async (req, res) => {
  try {
    const { roomId, teamSize, groupingMode } = req.validatedBody

    // Verify room exists and teacher owns it
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }
    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the room owner can create teams' })
    }

    // Create teams using the service
    const teams = await createTeams(roomId, groupingMode, teamSize)

    // Update room settings to mark team battle as active
    await Room.findByIdAndUpdate(roomId, {
      'settings.teamBattleActive': true,
      'settings.teamBattleConfig': { teamSize, groupingMode }
    })

    // Notify all students in the room via socket
    const io = req.app.get('io')
    io.to(room.code).emit('team:battle_started', {
      roomId,
      teams,
      teamSize,
      groupingMode
    })

    res.status(201).json({
      message: 'Teams created successfully',
      teams
    })
  } catch (error) {
    const status = error.message.includes('Cannot start') ? 400 : 500
    res.status(status).json({ error: error.message })
  }
})

// Get all teams for a room
router.get('/:roomId', authenticate, async (req, res) => {
  try {
    const teams = await getTeamsByRoom(req.params.roomId)
    res.json({ teams })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get student's own team in a room
router.get('/my-team/:roomId', authenticate, async (req, res) => {
  try {
    const team = await getStudentTeam(req.params.roomId, req.user._id)
    if (!team) {
      return res.status(404).json({ error: 'You are not assigned to a team in this room' })
    }
    res.json({ team })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Delete all teams for a room (teacher only, reset)
router.delete('/:roomId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }
    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the room owner can delete teams' })
    }

    await deleteTeamsByRoom(req.params.roomId)

    // Update room settings
    await Room.findByIdAndUpdate(req.params.roomId, {
      'settings.teamBattleActive': false
    })

    // Notify students
    const io = req.app.get('io')
    io.to(room.code).emit('team:battle_ended', { roomId: req.params.roomId })

    res.json({ message: 'Teams deleted successfully' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
