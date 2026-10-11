import express from 'express'
import { authenticate, authorize, requireApprovedTeacher } from '../middleware/auth.js'
import * as summaryService from '../services/summaryService.js'

const router = express.Router()

// GET /published (any authenticated) — list published, no full transcript
router.get('/published', authenticate, async (req, res, next) => {
  try {
    const summaries = await summaryService.listPublished()
    res.json(summaries)
  } catch (error) {
    next(error)
  }
})

// GET / (teacher + approved) — list my summaries
router.get('/', authenticate, authorize('teacher'), requireApprovedTeacher, async (req, res, next) => {
  try {
    const summaries = await summaryService.listForTeacher(req.user._id)
    res.json(summaries)
  } catch (error) {
    next(error)
  }
})

// GET /:id (authenticated) — detail if owner or published
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const summary = await summaryService.getByIdForUser(req.params.id, req.user)
    res.json(summary)
  } catch (error) {
    // If it's a known error, send 403 or 404
    if (error.message.includes('Not authorized')) {
      return res.status(403).json({ error: error.message })
    }
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message })
    }
    next(error)
  }
})

// POST / (teacher + approved) — createAndSummarize
router.post('/', authenticate, authorize('teacher'), requireApprovedTeacher, async (req, res, next) => {
  try {
    const { title, text, roomId, provider } = req.body
    if (!title || !text) {
      return res.status(400).json({ error: 'Title and text are required' })
    }
    const summary = await summaryService.createAndSummarize({
      title,
      rawText: text,
      roomId,
      provider,
      teacherId: req.user._id
    })
    res.status(201).json(summary)
  } catch (error) {
    next(error)
  }
})

// PUT /:id/publish (teacher + approved) — update published status
router.put('/:id/publish', authenticate, authorize('teacher'), requireApprovedTeacher, async (req, res, next) => {
  try {
    const { published } = req.body
    if (typeof published !== 'boolean') {
      return res.status(400).json({ error: 'published must be a boolean' })
    }
    const summary = await summaryService.setPublished(req.params.id, req.user._id, published)
    res.json(summary)
  } catch (error) {
    if (error.message.includes('Not authorized')) {
      return res.status(403).json({ error: error.message })
    }
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message })
    }
    if (error.message.includes('ready')) {
      return res.status(400).json({ error: error.message })
    }
    next(error)
  }
})

// DELETE /:id (teacher + approved)
router.delete('/:id', authenticate, authorize('teacher'), requireApprovedTeacher, async (req, res, next) => {
  try {
    await summaryService.deleteSummary(req.params.id, req.user._id)
    res.json({ success: true })
  } catch (error) {
    if (error.message.includes('Not authorized')) {
      return res.status(403).json({ error: error.message })
    }
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message })
    }
    next(error)
  }
})

// POST /:id/ask (authenticated) — ask AI about the lecture
router.post('/:id/ask', authenticate, async (req, res, next) => {
  try {
    const { question, provider } = req.body
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'question must be a non-empty string' })
    }
    const result = await summaryService.askQuestionAboutLecture({
      summaryId: req.params.id,
      user: req.user,
      question: question.trim(),
      provider
    })
    res.json({ success: true, answer: result.answer, provider: result.provider })
  } catch (error) {
    if (error.message.includes('Not authorized')) {
      return res.status(403).json({ error: error.message })
    }
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message })
    }
    console.error('Ask AI Error:', error.message)
    return res.status(500).json({ success: false, message: error.message || 'Failed to generate answer' })
  }
})

export default router
