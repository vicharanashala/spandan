import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import SavedQuestion from '../models/SavedQuestion.js'
import Question from '../models/Question.js'
import Room from '../models/Room.js'

const router = express.Router()

// Get all saved questions for the logged-in teacher
router.get('/', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const questions = await SavedQuestion.find({ teacherId: req.user._id }).sort({ createdAt: -1 })
    res.json({ questions })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Save a new question to the library
router.post('/', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { type, question, options, explanation, timeToAnswer, points, tags } = req.body
    
    const newSavedQ = new SavedQuestion({
      teacherId: req.user._id,
      type: type || 'MCQ',
      question,
      options,
      explanation,
      timeToAnswer,
      points,
      tags: tags || []
    })

    await newSavedQ.save()
    res.status(201).json({ question: newSavedQ })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update a saved question
router.put('/:id', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const savedQ = await SavedQuestion.findOne({ _id: req.params.id, teacherId: req.user._id })
    if (!savedQ) return res.status(404).json({ error: 'Question not found' })

    const { type, question, options, explanation, timeToAnswer, points, tags } = req.body
    
    if (type) savedQ.type = type
    if (question) savedQ.question = question
    if (options) savedQ.options = options
    if (explanation !== undefined) savedQ.explanation = explanation
    if (timeToAnswer) savedQ.timeToAnswer = timeToAnswer
    if (points) savedQ.points = points
    if (tags) savedQ.tags = tags

    await savedQ.save()
    res.json({ question: savedQ })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Delete a saved question
router.delete('/:id', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const result = await SavedQuestion.findOneAndDelete({ _id: req.params.id, teacherId: req.user._id })
    if (!result) return res.status(404).json({ error: 'Question not found' })
    res.json({ message: 'Question deleted' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Import saved questions to a live room
router.post('/import-to-room', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { roomId, savedQuestionIds } = req.body
    
    const room = await Room.findOne({ _id: roomId, teacher: req.user._id })
    if (!room) return res.status(404).json({ error: 'Room not found' })

    const savedQs = await SavedQuestion.find({ 
      _id: { $in: savedQuestionIds }, 
      teacherId: req.user._id 
    })

    if (savedQs.length === 0) return res.status(400).json({ error: 'No valid questions found to import' })

    const newQuestions = savedQs.map(sq => ({
      roomId: room._id,
      question: sq.question,
      options: sq.options,
      type: sq.type,
      status: 'approved',
      segmentIndex: 0,
      timeToAnswer: sq.timeToAnswer || 30,
      points: sq.points || 100,
      explanation: sq.explanation,
      createdBy: req.user._id
    }))

    const inserted = await Question.insertMany(newQuestions)
    res.status(201).json({ importedCount: inserted.length, questions: inserted })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
