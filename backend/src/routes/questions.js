import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { generateQuestions, AI_PROVIDERS } from '../services/questionService.js'
import { getGenerationQueue } from '../services/generationQueue.js'
import { stripObject } from '../utils/sanitize.js'

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
router.post('/generate', authorize('teacher'), async (req, res) => {
  try {
    const { transcript, config } = req.body
    const { 
      numQuestions = 2, 
      difficulty = 'medium',
      provider = 'minimax',
      questionTypeMix = null
    } = config || {}

    if (!transcript || transcript.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required'
      })
    }

    const jobConfig = { numQuestions, difficulty, provider, questionTypeMix }

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
    console.log(`Generating ${numQuestions} questions with ${provider} (sync)...`)
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
router.get('/jobs/:jobId', authorize('teacher'), async (req, res) => {
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
router.post('/', authorize('teacher'), async (req, res) => {
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

    // Strip any HTML tags but keep text as-is (quotes/apostrophes preserved).
    // The frontend renders these as React text nodes, which auto-escape at
    // render time, so entity-encoding here is unnecessary and would show
    // literally (e.g. &quot;) on the student side.
    const sanitizedData = stripObject({ roomId, type, question, options, timeToAnswer, points, status, segmentIndex })

    const newQuestion = new Question(sanitizedData)

    await newQuestion.save()

    // Populate Room.currentQuestion so the student-side "catch up" poll can find it.
    // Cleared when the batch completes or the room ends.
    const Room = (await import('../models/Room.js')).default
    await Room.findByIdAndUpdate(roomId, { $set: { currentQuestion: newQuestion._id } })

    // --- Batch-based auto join-gate (Mechanism 2) ---
    // The joinControl helpers live in index.js and are shared via app.set().
    const joinControl = req.app.get('joinControl')

    // Snapshot batchSize when a NEW batch starts (currentBatchSize === 0 means no batch is
    // running). If a batch is already running, a new question extends it — cancel any idle
    // timer that was armed during a gap between questions in this batch.
    // We access the live roomLive state via the joinControl arm/cancel helpers rather than
    // importing roomLive directly (avoids tight coupling with index.js internals).
    // Read the current batch state from joinControl's perspective via a helper we export.
    let meta = joinControl?.getBatchState(roomId)
    if (!meta || meta.currentBatchSize === 0) {
      // Fresh batch — snapshot the teacher's chosen batchSize.
      const freshRoom = await Room.findById(roomId).select('settings').lean()
      const batchSize = freshRoom?.settings?.batchSize || 1
      joinControl?.updateBatchState(roomId, { currentBatchSize: batchSize, batchQuestionsCompleted: 0 })
      meta = { currentBatchSize: batchSize, batchQuestionsCompleted: 0 }
      console.log(`[joingate] New batch started for room ${roomId}: batchSize=${batchSize}`)
    } else {
      // Batch in progress — a new question arrived, cancel the idle timer (room not abandoned).
      joinControl?.cancelIdleTimer(String(roomId))
      console.log(`[joingate] Question added to running batch for room ${roomId} (${meta.batchQuestionsCompleted}/${meta.currentBatchSize} done)`)
    }

    // Increment activeQuestionCount, then decrement after timeToAnswer seconds.
    await Room.findByIdAndUpdate(roomId, { $inc: { activeQuestionCount: 1 } })

    const gateMs = (sanitizedData.timeToAnswer || 30) * 1000
    setTimeout(async () => {
      try {
        // Decrement activeQuestionCount (clamped to 0) atomically.
        await Room.findByIdAndUpdate(roomId, [{
          $set: { activeQuestionCount: { $max: [0, { $subtract: ['$activeQuestionCount', 1] }] } }
        }])

        // Increment the per-batch completed counter.
        const currentMeta = joinControl?.getBatchState(roomId)
        if (!currentMeta) return // room state cleared (e.g. server restart)
        currentMeta.batchQuestionsCompleted += 1
        joinControl?.updateBatchState(roomId, { batchQuestionsCompleted: currentMeta.batchQuestionsCompleted })
        console.log(`[joingate] Question finished for room ${roomId}: ${currentMeta.batchQuestionsCompleted}/${currentMeta.currentBatchSize}`)

        if (currentMeta.batchQuestionsCompleted >= currentMeta.currentBatchSize) {
          // Batch complete — clear currentQuestion, reset meta, flush pending joiners
          // (unless the teacher still has the manual lock engaged).
          joinControl?.updateBatchState(roomId, { currentBatchSize: 0, batchQuestionsCompleted: 0 })
          await Room.findByIdAndUpdate(roomId, { $set: { currentQuestion: null } })

          const updatedRoom = await Room.findById(roomId).select('isLocked code').lean()
          if (!updatedRoom?.isLocked) {
            console.log(`[joingate] Batch complete for room ${roomId} — flushing pending joiners`)
            await joinControl?.flush(String(roomId), updatedRoom?.code)
          } else {
            console.log(`[joingate] Batch complete for room ${roomId} but manual lock still set — not flushing`)
          }
        } else {
          // Batch incomplete. Read activeQuestionCount to see if the room went quiet.
          const quietRoom = await Room.findById(roomId).select('activeQuestionCount').lean()
          if (quietRoom?.activeQuestionCount === 0) {
            // No questions are live but batch is not done — arm the abandoned-batch safety valve.
            const idleMs = Math.max(60000, (sanitizedData.timeToAnswer || 30) * 2 * 1000)
            console.log(`[joingate] Room ${roomId} quiet with incomplete batch — arming idle timer (${idleMs}ms)`)
            joinControl?.armIdleTimer(String(roomId), idleMs)
          }
        }
      } catch (e) {
        console.error('[questions] Failed to update batch gate:', e.message)
      }
    }, gateMs)

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

    const [questions, total] = await Promise.all([
      Question.find({ roomId }).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Question.countDocuments({ roomId })
    ])
    
    res.json({
      success: true,
      questions,
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