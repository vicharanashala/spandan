import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'

const router = express.Router()

// Apply authentication to all routes — teacher only
router.use(authenticate)

// ---------------------------------------------------------------------------
// CONFIG: Default threshold for classifying questions.
// Questions with wrongPercentage >= this value  →  "Revise in class"
// Questions with wrongPercentage <  this value  →  "Provide notes"
// Override via query param ?threshold=60 (or change the default here).
// ---------------------------------------------------------------------------
const DEFAULT_WRONG_THRESHOLD = 50

// GET /api/revision-suggestions/:roomId
router.get('/:roomId', authorize('teacher'), async (req, res) => {
  try {
    const Question = (await import('../models/Question.js')).default
    const Response = (await import('../models/Response.js')).default
    const Room     = (await import('../models/Room.js')).default

    const { roomId } = req.params
    const threshold = Math.min(100, Math.max(0,
      parseInt(req.query.threshold, 10) || DEFAULT_WRONG_THRESHOLD
    ))

    // 1. Verify room exists and the teacher owns it
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }
    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to view suggestions for this room' })
    }

    // 2. Fetch approved questions for this room
    const questions = await Question.find({ roomId, status: 'approved' }).lean()

    // 3. Aggregate response stats per question
    const questionAnalysis = await Promise.all(
      questions.map(async (q) => {
        const responses = await Response.find({ roomId, questionId: q._id }).lean()
        const totalResponses = responses.length
        const correctCount = responses.filter(r => r.isCorrect).length
        const wrongCount = totalResponses - correctCount
        const wrongPercentage = totalResponses > 0
          ? Math.round((wrongCount / totalResponses) * 100)
          : 0

        return {
          questionId: q._id,
          question: q.question,
          type: q.type,
          totalResponses,
          correctCount,
          wrongCount,
          wrongPercentage
        }
      })
    )

    // 4. Only consider questions that received at least one response
    const answeredQuestions = questionAnalysis.filter(q => q.totalResponses > 0)

    // 5. Classify into two buckets
    const reviseInClass = answeredQuestions
      .filter(q => q.wrongPercentage >= threshold)
      .sort((a, b) => b.wrongPercentage - a.wrongPercentage)   // hardest first

    const provideNotes = answeredQuestions
      .filter(q => q.wrongPercentage > 0 && q.wrongPercentage < threshold)
      .sort((a, b) => b.wrongPercentage - a.wrongPercentage)

    // 6. Identify the single hardest question
    const hardestQuestion = answeredQuestions.length > 0
      ? answeredQuestions.reduce((max, q) =>
          q.wrongPercentage > max.wrongPercentage ? q : max
        , answeredQuestions[0])
      : null

    // 7. Generate teacher recommendation message
    let recommendation = ''
    if (reviseInClass.length > 0 && provideNotes.length > 0) {
      recommendation =
        `${reviseInClass.length} question(s) had a high error rate — consider revising these topics in your next class. ` +
        `${provideNotes.length} question(s) were tricky for a few students — share short notes or explanations for them.`
    } else if (reviseInClass.length > 0) {
      recommendation =
        `${reviseInClass.length} question(s) had a high error rate. ` +
        `Repeat the difficult concepts in the next class to help students catch up.`
    } else if (provideNotes.length > 0) {
      recommendation =
        `Most students did well! Share short notes for the ${provideNotes.length} question(s) that some students found tricky.`
    } else {
      recommendation =
        `Great session! All questions were well understood by the class. Keep up the excellent teaching!`
    }

    // 8. Return payload
    res.json({
      success: true,
      reviseInClass,
      provideNotes,
      hardestQuestion,
      recommendation,
      threshold,
      totalQuestions: questions.length,
      totalAnswered: answeredQuestions.length
    })
  } catch (error) {
    console.error('Error generating revision suggestions:', error)
    res.status(500).json({ success: false, error: 'Failed to generate revision suggestions' })
  }
})

export default router
