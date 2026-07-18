import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import Note from '../models/Note.js'
import RoomMember from '../models/RoomMember.js'
import Room from '../models/Room.js'
import { generateNoteContent } from '../services/noteService.js'

const router = express.Router()

// POST /api/notes/generate
router.post('/generate', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { roomId, segmentIndex, topic, transcript, provider } = req.body

    if (!transcript) return res.status(400).json({ error: 'transcript is required' })

    const generated = await generateNoteContent({ 
      transcriptText: transcript, 
      topicHint: topic, 
      provider 
    })

    const note = new Note({
      roomId,
      teacherId: req.user._id,
      segmentIndex: segmentIndex !== undefined ? segmentIndex : null,
      topic: generated.topic || topic || 'General Notes',
      title: generated.title || 'Class Notes',
      transcriptSource: segmentIndex !== undefined && segmentIndex !== null ? 'auto' : 'manual',
      sourceText: transcript,
      content: generated.content,
      status: 'pending_review'
    })

    await note.save()
    res.status(201).json({ note })
  } catch (error) {
    console.error('Error generating notes:', error)
    res.status(500).json({ error: 'Failed to generate notes' })
  }
})

// GET /api/notes/pending
router.get('/pending', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const notes = await Note.find({ teacherId: req.user._id, status: 'pending_review' })
      .sort({ generatedAt: -1 })
      .populate('roomId', 'name')
    res.json({ notes })
  } catch (error) {
    console.error('Error fetching pending notes:', error)
    res.status(500).json({ error: 'Failed to fetch pending notes' })
  }
})

// GET /api/notes/room/:roomId
router.get('/room/:roomId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.params
    const { status } = req.query
    
    const query = { roomId, teacherId: req.user._id }
    if (status) query.status = status

    const notes = await Note.find(query).sort({ generatedAt: -1 })
    res.json({ notes })
  } catch (error) {
    console.error('Error fetching room notes:', error)
    res.status(500).json({ error: 'Failed to fetch notes' })
  }
})

// PATCH /api/notes/:id
router.patch('/:id', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { title, content, topic } = req.body
    
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, teacherId: req.user._id },
      { title, content, topic },
      { new: true, runValidators: true }
    )
    
    if (!note) return res.status(404).json({ error: 'Note not found' })
    res.json({ note })
  } catch (error) {
    console.error('Error updating note:', error)
    res.status(500).json({ error: 'Failed to update note' })
  }
})

// POST /api/notes/:id/release
router.post('/:id/release', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, teacherId: req.user._id },
      { status: 'released', releasedAt: Date.now() },
      { new: true }
    )
    
    if (!note) return res.status(404).json({ error: 'Note not found' })
    res.json({ note })
  } catch (error) {
    console.error('Error releasing note:', error)
    res.status(500).json({ error: 'Failed to release note' })
  }
})

// POST /api/notes/:id/discard
router.post('/:id/discard', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, teacherId: req.user._id },
      { status: 'discarded' },
      { new: true }
    )
    
    if (!note) return res.status(404).json({ error: 'Note not found' })
    res.json({ note })
  } catch (error) {
    console.error('Error discarding note:', error)
    res.status(500).json({ error: 'Failed to discard note' })
  }
})

// GET /api/notes/student/room/:roomId
router.get('/student/room/:roomId', authenticate, authorize('student'), async (req, res) => {
  try {
    const { roomId } = req.params
    const notes = await Note.find({ roomId, status: 'released' }).sort({ releasedAt: -1 }).populate('teacherId', 'name')
    res.json({ notes })
  } catch (error) {
    console.error('Error fetching student room notes:', error)
    res.status(500).json({ error: 'Failed to fetch notes' })
  }
})

// GET /api/notes/student/history
router.get('/student/history', authenticate, authorize('student'), async (req, res) => {
  try {
    // Find all rooms the student is a member of
    const memberships = await RoomMember.find({ studentId: req.user._id }).lean()
    const roomIds = memberships.map(m => m.roomId)

    // Also find the teachers of those rooms so we can include their independent notes
    const rooms = await Room.find({ _id: { $in: roomIds } }).select('teacher').lean()
    const teacherIds = [...new Set(rooms.map(r => r.teacher?.toString()).filter(Boolean))]

    // Fetch released notes that either:
    // 1. Belong to a room the student has joined, OR
    // 2. Are independent notes (no roomId) created by a teacher from one of their rooms
    const notes = await Note.find({
      status: 'released',
      $or: [
        { roomId: { $in: roomIds } },
        { roomId: null, teacherId: { $in: teacherIds } }
      ]
    })
    .sort({ releasedAt: -1 })
    .populate('roomId', 'name code createdAt endedAt')
    .populate('teacherId', 'name')
    .lean()

    // Format the response to include room details nicely
    const formattedNotes = notes.map(n => ({
      ...n,
      roomName: n.roomId?.name || 'Independent Notes',
      roomCode: n.roomId?.code || null,
      roomDate: n.roomId?.endedAt || n.roomId?.createdAt || n.releasedAt
    }))

    res.json({ notes: formattedNotes })
  } catch (error) {
    console.error('Error fetching student notes history:', error)
    res.status(500).json({ error: 'Failed to fetch notes history' })
  }
})

export default router
