import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import Room from '../models/Room.js'
import Response from '../models/Response.js'
import Question from '../models/Question.js'
import Note from '../models/Note.js'
import { generateQuestionFocusedNote } from '../services/noteService.js'

const router = express.Router()

router.post('/generate-for-question', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { roomId, questionId, provider } = req.body

    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }
    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to generate notes for this room' })
    }

    const targetStudentIds = await Response.find({ roomId, questionId, isCorrect: false }).distinct('studentId')

    if (!targetStudentIds || targetStudentIds.length === 0) {
      return res.status(400).json({ error: 'No students answered this question incorrectly. Cannot generate targeted notes.' })
    }

    const question = await Question.findById(questionId)
    if (!question) {
      return res.status(404).json({ error: 'Question not found' })
    }

    // Attempt AI generation; fall back to a manual draft if the LLM fails or returns empty
    let generated
    try {
      generated = await generateQuestionFocusedNote(question, targetStudentIds.length, provider)
    } catch (llmErr) {
      console.warn('[question-notes] AI generation failed, saving manual draft:', llmErr.message)
      const correctAnswers = Array.isArray(question.options)
        ? question.options.filter(o => o.isCorrect).map(o => o.text).join(', ')
        : 'See question options'
      generated = {
        topic: question.topic || 'Revision Notes',
        title: `Revision Notes: ${question.question}`.slice(0, 200),
        content: `*AI generation failed — please edit this draft before releasing.*\n\n**Question:** ${question.question}\n\n**Correct Answer(s):** ${correctAnswers}\n\nAdd your revision notes here.`
      }
    }

    const note = new Note({
      roomId,
      teacherId: req.user._id,
      questionId,
      targetStudentIds,
      topic: generated.topic || question.topic || 'Revision Notes',
      title: generated.title || 'Revision Notes for Question',
      transcriptSource: 'manual',
      sourceText: `Targeted revision notes for question: ${question.question}`,
      content: generated.content,
      status: 'pending_review'
    })

    await note.save()
    res.status(201).json({ note })
  } catch (error) {
    console.error('Error generating question notes:', error)
    res.status(500).json({ error: 'Failed to generate question notes' })
  }
})

export default router
