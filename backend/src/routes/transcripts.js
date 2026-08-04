import express from 'express'
import Transcript from '../models/Transcript.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import TopicMarker from '../models/TopicMarker.js'
import { authenticate } from '../middleware/auth.js'
import { maybeGenerateAutoTopic } from '../services/topicGenerator.js'

const router = express.Router()

// Create a new transcript entry
router.post('/', authenticate, async (req, res) => {
  try {
    const { roomId, segmentIndex, text, duration, wordCount, source } = req.body

    if (!roomId || segmentIndex === undefined || !text) {
      return res.status(400).json({ error: 'roomId, segmentIndex, and text are required' })
    }

    // Authorization: only the room's OWNING teacher may write a transcript for it. Without this,
    // any authenticated user could POST a transcript against any roomId they knew.
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }
    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to add transcripts to this room' })
    }

    const transcript = new Transcript({
      roomId,
      segmentIndex,
      source: source === 'paste' ? 'paste' : 'audio',
      teacherId: req.user._id,
      text,
      duration: duration || 0,
      wordCount: wordCount || text.split(/\s+/).length
    })

    await transcript.save()

    // Fire-and-forget: maybe create an auto topic marker based on this transcript.
    // Skipped when no recording session has been started yet so we don't pollute
    // pre-lecture transcripts with topic labels.
    ;(async () => {
      try {
        const room = await Room.findById(roomId).select('teacher roomStartedAt').lean()
        if (!room || !room.roomStartedAt) return
        const nowMs = Date.now() - new Date(room.roomStartedAt).getTime()
        if (nowMs < 0) return

        // Fetch last ~90s of transcripts for this room so the detector has context
        const since = new Date(new Date(room.roomStartedAt).getTime() + nowMs - 90000)
        const recentTranscripts = await Transcript.find({
          roomId,
          createdAt: { $gte: since }
        }).select('text segmentIndex createdAt').lean()

        const stampRecent = recentTranscripts.map(t => ({
          text: t.text,
          recordingOffsetMs: new Date(t.createdAt).getTime() - new Date(room.roomStartedAt).getTime()
        }))

        // SESSION-SCOPED auto-marker lookup: only the most recent auto
        // marker created AFTER this session started. Stale auto markers
        // from a previous lecture session are ignored — their labels and
        // range should not influence the current lecture.
        const lastAuto = await TopicMarker.findOne({
          roomId,
          source: 'auto',
          createdAt: { $gte: new Date(room.roomStartedAt) }
        })
          .sort({ startMs: -1 }).lean()

        const proposal = await maybeGenerateAutoTopic({
          roomId,
          recentTranscripts: stampRecent,
          lastAutoTopic: lastAuto ? { label: lastAuto.label, startMs: lastAuto.startMs } : null,
          nowMs
        })

        if (!proposal.createNew || !proposal.label) return

        // ALWAYS close out the prior in-session auto topic when we create
        // a new one. Previously this only ran when lastAuto.endMs was
        // exactly null, but the creator stores endMs = nowMs + 5min, so
        // the null check rarely fired. Now we close based on session
        // scoping plus overlap with the new marker's range.
        if (lastAuto && (lastAuto.endMs == null || lastAuto.endMs > nowMs)) {
          await TopicMarker.updateOne(
            { _id: lastAuto._id },
            { $set: { endMs: nowMs - 1 } }
          )
        }

        const marker = await TopicMarker.create({
          roomId,
          teacherId: req.user._id,
          startMs: nowMs,
          // Auto-markers get a bounded span (default 5 minutes) so a stale
          // marker from a previous session doesn't haunt the current one.
          // The next auto-marker will close out this one via the
          // `lastAuto.endMs == null || endMs > nowMs` branch above.
          endMs: nowMs + 5 * 60 * 1000,
          label: proposal.label,
          source: proposal.source || 'auto',
          confidence: proposal.confidence || null,
          confirmed: false
        })

        // Broadcast to the room (teacher + students)
        const io = req.app.get('io')
        const roomDoc = await Room.findById(roomId).select('code').lean()
        if (io && roomDoc?.code) {
          io.to(roomDoc.code).emit('teacher:topic-set', { marker })
        }
      } catch (err) {
        console.warn('[transcripts] auto-topic failed:', err?.message)
      }
    })()

    res.status(201).json({
      success: true,
      transcript
    })
  } catch (error) {
    console.error('Failed to save transcript:', error)
    res.status(500).json({ error: 'Failed to save transcript' })
  }
})

// Get all transcripts for a room
router.get('/room/:roomId', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params
    const currentUser = req.user

    // Verify room exists and user has access
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    // Check access: teacher owns room OR student is a member
    const isTeacher = room.teacher.toString() === currentUser._id.toString()
    const isStudentMember = await RoomMember.findOne({ roomId, studentId: currentUser._id })

    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({ error: 'Not authorized to access transcripts for this room' })
    }

    const transcripts = await Transcript.find({ 
      roomId: req.params.roomId 
    }).sort({ segmentIndex: 1 })

    res.json({
      success: true,
      transcripts
    })
  } catch (error) {
    console.error('Failed to fetch transcripts:', error)
    res.status(500).json({ error: 'Failed to fetch transcripts' })
  }
})

// Get transcript by room and segment
router.get('/:roomId/:segmentIndex', authenticate, async (req, res) => {
  try {
    const { roomId, segmentIndex } = req.params
    const currentUser = req.user

    // Verify room exists and user has access
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    // Check access: teacher owns room OR student is a member
    const isTeacher = room.teacher.toString() === currentUser._id.toString()
    const isStudentMember = await RoomMember.findOne({ roomId, studentId: currentUser._id })

    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({ error: 'Not authorized to access this transcript' })
    }

    const transcript = await Transcript.findOne({ 
      roomId: roomId,
      segmentIndex: parseInt(segmentIndex)
    })

    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' })
    }

    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' })
    }

    res.json({
      success: true,
      transcript
    })
  } catch (error) {
    console.error('Failed to fetch transcript:', error)
    res.status(500).json({ error: 'Failed to fetch transcript' })
  }
})

export default router