import express from 'express'
import { 
  createQuestion, 
  getQuestionById, 
  getQuestionsByRoom, 
  updateQuestion, 
  deleteQuestion,
  setActiveQuestion,
  submitResponse,
  getResponsesByQuestion,
  getQuestionResults
} from '../services/questionService.js'
import { authenticate } from '../middleware/auth.js'
import { authorize } from '../middleware/auth.js'
import { validate, createQuestionSchema } from '../middleware/validation.js'

const router = express.Router()

// Create question (teacher only)
router.post('/', authenticate, authorize('teacher'), validate(createQuestionSchema), async (req, res) => {
  try {
    const question = await createQuestion(req.validatedBody, req.user._id)
    
    res.status(201).json({
      message: 'Question created successfully',
      question
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get questions by room
router.get('/room/:roomId', authenticate, async (req, res) => {
  try {
    const questions = await getQuestionsByRoom(req.params.roomId)
    res.json({ questions })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get single question
router.get('/:id', authenticate, async (req, res) => {
  try {
    const question = await getQuestionById(req.params.id)
    res.json({ question })
  } catch (error) {
    const status = error.message === 'Question not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Update question
router.put('/:id', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const question = await updateQuestion(req.params.id, req.body, req.user._id)
    res.json({ message: 'Question updated successfully', question })
  } catch (error) {
    const status = error.message === 'Question not found' || error.message.includes('Not authorized') ? 403 : 500
    res.status(status).json({ error: error.message })
  }
})

// Delete question
router.delete('/:id', authenticate, authorize('teacher'), async (req, res) => {
  try {
    await deleteQuestion(req.params.id, req.user._id)
    res.json({ message: 'Question deleted successfully' })
  } catch (error) {
    const status = error.message === 'Question not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Set active question (start question in room)
router.post('/:id/activate', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const question = await setActiveQuestion(req.body.roomId, req.params.id)
    res.json({ message: 'Question activated', question })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Submit response (student)
router.post('/response', authenticate, authorize('student'), async (req, res) => {
  try {
    const response = await submitResponse(req.body, req.user._id)
    
    res.status(201).json({
      message: 'Response submitted',
      response: {
        isCorrect: response.isCorrect,
        responseTime: response.responseTime
      }
    })
  } catch (error) {
    const status = error.message === 'Question not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Get responses for a question
router.get('/:id/responses', authenticate, async (req, res) => {
  try {
    const responses = await getResponsesByQuestion(req.params.id)
    res.json({ responses })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get question results (aggregated)
router.get('/:id/results', authenticate, async (req, res) => {
  try {
    const results = await getQuestionResults(req.params.id)
    res.json({ results })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router