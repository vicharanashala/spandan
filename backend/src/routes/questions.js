import express from 'express'
import { authenticate, authorize, requireApprovedTeacher } from '../middleware/auth.js'
import { generateQuestions, AI_PROVIDERS } from '../services/questionService.js'
import { getGenerationQueue } from '../services/generationQueue.js'
import { stripObject } from '../utils/sanitize.js'
import { checkRoomOwnership } from '../utils/roomOwnership.js'

const router = express.Router()

// Apply authentication to all routes
router.use(authenticate)

// Get available AI providers - accessible by authenticated users
router.get('/providers', (req, res) => {
  const providers = Object.entries(AI_PROVIDERS).map(([key, value]) => ({
    id: key,
    name: value.name,
    icon: value.icon,
    enabled: value.enabled
  }))
  
  res.json({
    success: true,
    providers
  })
})

// POST /api/questions/generate - Generate questions from transcript
// Authorization: teacher only
router.post('/generate', authorize('teacher'), requireApprovedTeacher, async (req, res) => {
  try {
    const { transcript, config } = req.body
    const { 
      numQuestions = 2, 
      difficulty = 'medium',
      provider = 'minimax',
      questionTypeMix = null,
      tone = 'professional'
    } = config || {}

    if (!transcript || transcript.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required'
      })
    }

    const jobConfig = { numQuestions, difficulty, provider, questionTypeMix, tone }

    // Async path (Redis/BullMQ): enqueue and return a jobId immediately, freeing the connection.
    // The client polls GET /questions/jobs/:jobId for the result.
    const queue = getGenerationQueue()
    if (queue) {
      const job = await queue.add(
        'generate',
        { transcript, config: jobConfig, requestedBy: String(req.user._id) },
        {
          attempts: 2,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: { age: 900 }, // keep the result ~15 min so the client can poll it
          removeOnFail: { age: 900 }
        }
      )
      return res.status(202).json({ success: true, async: true, jobId: job.id })
    }

    // Sync fallback (no Redis): generate inline — today's behavior.
    console.log(`Generating ${numQuestions} questions with ${provider} (tone: ${tone}, sync)...`)
    const questions = await generateQuestions(transcript, jobConfig)
    console.log(`Generated ${questions.length} questions successfully`)
    res.json({ success: true, questions })
  } catch (error) {
    console.error('Question generation error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate questions'
    })
  }
})

// GET /api/questions/jobs/:jobId - poll an async generation job (Phase 2D)
// Authorization: teacher only, and only the teacher who requested it.
router.get('/jobs/:jobId', authorize('teacher'), requireApprovedTeacher, async (req, res) => {
  try {
    const queue = getGenerationQueue()
    if (!queue) {
      return res.status(404).json({ success: false, error: 'Async generation is not enabled' })
    }
    const job = await queue.getJob(req.params.jobId)
    if (!job) {
      return res.status(404).json({ success: false, status: 'not_found', error: 'Job not found or expired' })
    }
    if (job.data?.requestedBy && job.data.requestedBy !== String(req.user._id)) {
      return res.status(403).json({ success: false, error: 'Not authorized to view this job' })
    }
    const state = await job.getState()
    if (state === 'completed') {
      return res.json({ success: true, status: 'completed', questions: job.returnvalue || [] })
    }
    if (state === 'failed') {
      return res.json({ success: false, status: 'failed', error: job.failedReason || 'Generation failed' })
    }
    return res.json({ success: true, status: 'processing' })
  } catch (error) {
    console.error('Job status error:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch job status' })
  }
})

// Create a question (for manual creation)
// Authorization: teacher only
router.post('/', authorize('teacher'), requireApprovedTeacher, async (req, res) => {
  try {
    const Question = (await import('../models/Question.js')).default
    const { 
      roomId, 
      type, 
      question, 
      options, 
      timeToAnswer = 30, 
      points = 100,
      status = 'approved',
      segmentIndex = 0
    } = req.body

    if (!roomId || !type || !question || !options) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Authorization: only the room's OWNING teacher may add questions to it. Without this,
    // any teacher could inject questions into another teacher's room by supplying its roomId.
    const Room = (await import('../models/Room.js')).default
    const room = await Room.findById(roomId)
    const ownership = checkRoomOwnership(room, req.user._id)
    if (!ownership.ok) {
      return res.status(ownership.status).json({ error: ownership.error })
    }

    // Strip any HTML tags but keep text as-is (quotes/apostrophes preserved).
    // The frontend renders these as React text nodes, which auto-escape at
    // render time, so entity-encoding here is unnecessary and would show
    // literally (e.g. &quot;) on the student side.
    const sanitizedData = stripObject({ roomId, type, question, options, timeToAnswer, points, status, segmentIndex })

    const newQuestion = new Question(sanitizedData)

    await newQuestion.save()

    res.status(201).json({
      success: true,
      question: newQuestion
    })
  } catch (error) {
    console.error('Error creating question:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to create question'
    })
  }
})

// GET /api/questions?roomId=xxx - Get all questions for a room
router.get('/', async (req, res) => {
  try {
    const { roomId, page = 1, limit = 50 } = req.query
    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' })
    }

    const Question = (await import('../models/Question.js')).default
    const Room = (await import('../models/Room.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default
    const currentUser = req.user

    // Check access: teacher owns room OR student is member
    const room = await Room.findById(roomId)
    const isTeacher = room && room.teacher.toString() === currentUser._id.toString()
    const isStudentMember = await RoomMember.findOne({ roomId, studentId: currentUser._id })

    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({ error: 'Not authorized to access questions for this room' })
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50))
    const skip = (pageNum - 1) * limitNum

    // Teachers manage the full set (pending/approved/rejected) and need the answers. STUDENTS must
    // never receive answers or un-launched questions from this endpoint: restrict to approved and
    // strip the correct-option flags. Otherwise a member could pull every question with `isCorrect`
    // straight from here, bypassing the UI. (Their legitimate past-question results come from
    // GET /responses/room/:roomId/student/:studentId once a poll is no longer live.)
    const filter = isTeacher ? { roomId } : { roomId, status: 'approved' }

    const [questions, total] = await Promise.all([
      Question.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Question.countDocuments(filter)
    ])

    const stripAnswer = ({ explanation, options, ...rest }) => ({
      ...rest,
      options: Array.isArray(options) ? options.map(({ isCorrect, ...o }) => o) : options
    })

    res.json({
      success: true,
      questions: isTeacher ? questions : questions.map(stripAnswer),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    })
  } catch (error) {
    console.error('Error fetching questions:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch questions'
    })
  }
})

export default router