import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { generateQuestions, AI_PROVIDERS } from '../services/questionService.js'
import { sanitizeObject } from '../utils/sanitize.js'

const router = express.Router()

// Apply authentication to all routes
router.use(authenticate)

// Get available AI providers - accessible by authenticated users
router.get('/providers', async (req, res) => {
  const { detectAvailableProviders, selectProvider } = await import('../services/providerSelector.js')
  
  const available = detectAvailableProviders()
  const active = selectProvider()
  
  // Legacy AI_PROVIDERS for backward compat
  const legacyProviders = Object.entries(AI_PROVIDERS).map(([key, value]) => ({
    id: key,
    name: value.name,
    icon: value.icon,
    enabled: value.enabled
  }))
  
  res.json({
    success: true,
    providers: legacyProviders,
    availableProviders: available,
    activeProvider: active,
    usingLocal: active.id === 'local'
  })
})

// POST /api/questions/generate - Generate questions from transcript
// Authorization: teacher only
// Uses automatic provider detection with fallback by default
router.post('/generate', authorize('teacher'), async (req, res) => {
  try {
    const { transcript, config } = req.body
    const { 
      numQuestions = 2, 
      difficulty = 'medium',
      provider = 'auto',
      questionTypeMix = null,
      grokApiKey = null,
      grokModel = null,
      geminiApiKey = null,
      geminiModel = null,
      groqApiKey = null,
      groqModel = null
    } = config || {}

    if (!transcript || transcript.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required'
      })
    }

    console.log(`Generating ${numQuestions} questions with provider="${provider}"...`)

    const { selectProvider, getSelectedProvider } = await import('../services/providerSelector.js')

    // Detect active provider (for logging/response)
    let activeProvider
    try {
      activeProvider = selectProvider()
    } catch {
      activeProvider = { id: 'local', name: 'Local Question Generator', icon: '🖥️' }
    }

    const questions = await generateQuestions(transcript, {
      numQuestions,
      difficulty,
      provider: provider === 'auto' ? 'auto' : provider,
      questionTypeMix,
      grokApiKey,
      grokModel,
      geminiApiKey,
      geminiModel,
      groqApiKey,
      groqModel
    })

    console.log(`Generated ${questions.length} questions successfully using ${activeProvider?.name || provider}`)

    res.json({
      success: true,
      questions,
      provider: activeProvider
    })
  } catch (error) {
    console.error('Question generation error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate questions',
      provider: null
    })
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

    // Sanitize user input to prevent XSS
    const sanitizedData = sanitizeObject({ roomId, type, question, options, timeToAnswer, points, status, segmentIndex })

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

// POST /api/questions/:questionId/end-poll - End a poll, calculate stats and generate AI summary
router.post('/:questionId/end-poll', authorize('teacher'), async (req, res) => {
  try {
    const { questionId } = req.params
    const { generateAndSavePollSummary } = await import('../services/pollSummaryService.js')
    const ioInstance = req.app.get('io')

    const pollSummary = await generateAndSavePollSummary(questionId, ioInstance)

    // Also trigger misconception analysis + revision sheet generation (async, non-blocking)
    try {
      const { analyzeMisconceptions } = await import('../services/misconceptionService.js')
      const { generateRevisionSheet } = await import('../services/revisionService.js')
      const Question = (await import('../models/Question.js')).default
      const Response = (await import('../models/Response.js')).default

      const question = await Question.findById(questionId)
      if (question) {
        const responses = await Response.find({ questionId })
        const analysis = await analyzeMisconceptions(question, responses, question.roomId)
        const revisionSheet = await generateRevisionSheet(question.roomId, question, responses)

        if (ioInstance) {
          ioInstance.to(question.roomId.toString()).emit('misconception_updated', {
            analysis: analysis?.toObject?.() || analysis,
            questionId
          })
          if (revisionSheet) {
            ioInstance.to(question.roomId.toString()).emit('revision_sheet_generated', { sheet: revisionSheet?.toObject?.() || revisionSheet })
          }
        }
      }
    } catch (postError) {
      console.error('Post-poll analysis error (non-blocking):', postError.message)
    }

    res.json(pollSummary)
  } catch (error) {
    console.error('Error ending poll:', error)
    res.status(500).json({ success: false, error: error.message || 'Failed to end poll and generate summary' })
  }
})

export default router