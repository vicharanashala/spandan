import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'

const router = express.Router()

// Apply authentication to all routes
router.use(authenticate)

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/teams
// Teacher creates a new team inside a room.
// Body: { roomId, name }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', authorize('teacher'), async (req, res) => {
  try {
    const Team = (await import('../models/Team.js')).default
    const Room = (await import('../models/Room.js')).default

    const { roomId, name } = req.body

    if (!roomId || !name) {
      return res.status(400).json({ error: 'roomId and name are required' })
    }

    // Verify room exists and requester is its teacher
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }
    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to manage teams in this room' })
    }

    const team = new Team({ roomId, name, memberIds: [], totalPoints: 0 })
    await team.save()

    res.status(201).json({ success: true, team })
  } catch (error) {
    console.error('Error creating team:', error)
    res.status(500).json({ success: false, error: 'Failed to create team' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/teams?roomId=xxx
// Get all teams for a room (teacher or any room member may call this).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const Team = (await import('../models/Team.js')).default
    const Room = (await import('../models/Room.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default

    const { roomId } = req.query
    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' })
    }

    // Verify room exists
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    // Allow if teacher owns room OR student is a member
    const isTeacher = room.teacher.toString() === req.user._id.toString()
    const isStudentMember = await RoomMember.findOne({ roomId, studentId: req.user._id })
    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({ error: 'Not authorized to view teams in this room' })
    }

    const teams = await Team.find({ roomId })
      .populate('memberIds', 'name email')
      .sort({ totalPoints: -1 })
      .lean()

    res.json({ success: true, teams })
  } catch (error) {
    console.error('Error fetching teams:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch teams' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/teams/:teamId/members
// Teacher assigns students to a team.
// Body: { memberIds: [userId, ...] }
// This REPLACES the team's memberIds with the provided array.
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:teamId/members', authorize('teacher'), async (req, res) => {
  try {
    const Team = (await import('../models/Team.js')).default
    const Room = (await import('../models/Room.js')).default

    const { teamId } = req.params
    const { memberIds } = req.body

    if (!Array.isArray(memberIds)) {
      return res.status(400).json({ error: 'memberIds must be an array' })
    }

    // Find team
    const team = await Team.findById(teamId)
    if (!team) {
      return res.status(404).json({ error: 'Team not found' })
    }

    // Verify the teacher owns the room this team belongs to
    const room = await Room.findById(team.roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }
    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to manage teams in this room' })
    }

    team.memberIds = memberIds
    await team.save()

    const populated = await team.populate('memberIds', 'name email')
    res.json({ success: true, team: populated })
  } catch (error) {
    console.error('Error updating team members:', error)
    res.status(500).json({ success: false, error: 'Failed to update team members' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/teams/:teamId
// Teacher deletes a team.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:teamId', authorize('teacher'), async (req, res) => {
  try {
    const Team = (await import('../models/Team.js')).default
    const Room = (await import('../models/Room.js')).default

    const { teamId } = req.params

    const team = await Team.findById(teamId)
    if (!team) {
      return res.status(404).json({ error: 'Team not found' })
    }

    // Verify teacher owns the room
    const room = await Room.findById(team.roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }
    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete teams in this room' })
    }

    await Team.deleteOne({ _id: teamId })
    res.json({ success: true, message: 'Team deleted' })
  } catch (error) {
    console.error('Error deleting team:', error)
    res.status(500).json({ success: false, error: 'Failed to delete team' })
  }
})

export default router
