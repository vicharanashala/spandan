import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import QuestionBank from '../models/QuestionBank.js'
import Room from '../models/Room.js'

const router = express.Router()

// Apply auth to all routes
router.use(authenticate)

// GET /api/question-bank/categories — Get all categories for this teacher's bank
router.get('/categories', authorize('teacher'), async (req, res) => {
  try {
    const categories = await QuestionBank.aggregate([
      { $match: { teacherId: req.user._id } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ])

    const result = categories.map(c => ({ name: c._id, count: c.count }))
    res.json({ success: true, categories: result })
  } catch (error) {
    console.error('Error fetching bank categories:', error)
    res.status(500).json({ error: 'Failed to fetch categories' })
  }
})

// GET /api/question-bank — Get all saved questions for this teacher (optional category filter)
router.get('/', authorize('teacher'), async (req, res) => {
  try {
    const { category } = req.query
    const filter = { teacherId: req.user._id }
    if (category) filter.category = category

    const questions = await QuestionBank.find(filter)
      .sort({ createdAt: -1 })
      .lean()

    res.json({ success: true, questions })
  } catch (error) {
    console.error('Error fetching question bank:', error)
    res.status(500).json({ error: 'Failed to fetch question bank' })
  }
})

// POST /api/question-bank — Save a question to the bank
router.post('/', authorize('teacher'), async (req, res) => {
  try {
    const { question, type, options, explanation, points, timeToAnswer, sourceRoomId, category } = req.body

    if (!question || !type || !options) {
      return res.status(400).json({ error: 'Missing required fields: question, type, options' })
    }

    const bankEntry = new QuestionBank({
      teacherId: req.user._id,
      question,
      type,
      options,
      explanation: explanation || '',
      points: points || 100,
      timeToAnswer: timeToAnswer || 30,
      sourceRoomId: sourceRoomId || null,
      category: category || 'Uncategorized'
    })

    await bankEntry.save()

    res.status(201).json({ success: true, question: bankEntry })
  } catch (error) {
    console.error('Error saving to question bank:', error)
    res.status(500).json({ error: 'Failed to save question' })
  }
})

// POST /api/question-bank/bulk — Save multiple questions to the bank
router.post('/bulk', authorize('teacher'), async (req, res) => {
  try {
    const { questions, sourceRoomId, category } = req.body

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'No questions provided' })
    }

    const docs = questions.map(q => ({
      teacherId: req.user._id,
      question: q.question,
      type: q.type,
      options: q.options,
      explanation: q.explanation || '',
      points: q.points || 100,
      timeToAnswer: q.timeToAnswer || 30,
      sourceRoomId: sourceRoomId || null,
      category: q.category || category || 'Uncategorized'
    }))

    const saved = await QuestionBank.insertMany(docs)

    res.status(201).json({ success: true, count: saved.length, questions: saved })
  } catch (error) {
    console.error('Error bulk saving to question bank:', error)
    res.status(500).json({ error: 'Failed to save questions' })
  }
})

// PUT /api/question-bank/:id — Update a question's category or details
router.put('/:id', authorize('teacher'), async (req, res) => {
  try {
    const { category, question, type, options, explanation, points, timeToAnswer } = req.body
    const updates = {}
    if (category !== undefined) updates.category = category
    if (question !== undefined) updates.question = question
    if (type !== undefined) updates.type = type
    if (options !== undefined) updates.options = options
    if (explanation !== undefined) updates.explanation = explanation
    if (points !== undefined) updates.points = points
    if (timeToAnswer !== undefined) updates.timeToAnswer = timeToAnswer

    const updated = await QuestionBank.findOneAndUpdate(
      { _id: req.params.id, teacherId: req.user._id },
      { $set: updates },
      { new: true }
    )

    if (!updated) {
      return res.status(404).json({ error: 'Question not found' })
    }

    res.json({ success: true, question: updated })
  } catch (error) {
    console.error('Error updating question bank:', error)
    res.status(500).json({ error: 'Failed to update question' })
  }
})

// DELETE /api/question-bank/:id — Remove a question from the bank
router.delete('/:id', authorize('teacher'), async (req, res) => {
  try {
    const deleted = await QuestionBank.findOneAndDelete({
      _id: req.params.id,
      teacherId: req.user._id
    })

    if (!deleted) {
      return res.status(404).json({ error: 'Question not found' })
    }

    res.json({ success: true, message: 'Question removed from bank' })
  } catch (error) {
    console.error('Error deleting from question bank:', error)
    res.status(500).json({ error: 'Failed to delete question' })
  }
})

// PUT /api/question-bank/:id/use — Mark a question as used
router.put('/:id/use', authorize('teacher'), async (req, res) => {
  try {
    await QuestionBank.findOneAndUpdate(
      { _id: req.params.id, teacherId: req.user._id },
      { $inc: { timesUsed: 1 }, lastUsedAt: new Date() }
    )
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to update' })
  }
})

export default router
