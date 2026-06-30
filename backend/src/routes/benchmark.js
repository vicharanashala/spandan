import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import Room from '../models/Room.js'
import Question from '../models/Question.js'
import Transcript from '../models/Transcript.js'
import BenchmarkAttempt from '../models/BenchmarkAttempt.js'
import FrozenLeaderboard from '../models/FrozenLeaderboard.js'
import { generateSummary } from '../services/summaryService.js'

const router = express.Router()

// Apply authentication to all benchmark endpoints
router.use(authenticate)

// Helper function to calculate points (matching live formula)
const calculatePoints = (isCorrect, maxPoints, tta, responseTime) => {
  if (!isCorrect) return 0
  const timeRemaining = Math.max(0, tta - responseTime)
  const timeDecayFactor = Math.max(0.1, timeRemaining / tta) // Min 10% points
  return Math.round(maxPoints * timeDecayFactor)
}

// GET /api/benchmark/session/:roomId - Get session summary + polls
router.get('/session/:roomId', authorize('student'), async (req, res) => {
  try {
    const { roomId } = req.params
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Session not found' })
    }

    // Retrieve approved questions and transcripts
    const [questions, transcripts] = await Promise.all([
      Question.find({ roomId, status: 'approved' }).lean(),
      Transcript.find({ roomId }).sort({ segmentIndex: 1 }).lean()
    ])

    // Find the max segment index
    const maxSegment = Math.max(
      ...transcripts.map(t => t.segmentIndex),
      ...questions.map(q => q.segmentIndex),
      0
    )

    // Group transcripts and polls by segment
    const segmentsData = []
    for (let i = 0; i <= maxSegment; i++) {
      const transcript = transcripts.find(t => t.segmentIndex === i)
      const segmentQuestions = questions.filter(q => q.segmentIndex === i)

      // Only include segments that have either a transcript or questions
      if (transcript || segmentQuestions.length > 0) {
        segmentsData.push({
          segmentIndex: i,
          rawText: transcript?.text || null,
          polls: segmentQuestions.map(q => ({
            _id: q._id,
            type: q.type,
            question: q.question,
            options: q.options.map(o => ({ text: o.text })), // Hide correctness until submission
            timeToAnswer: q.timeToAnswer,
            points: q.points
          }))
        })
      }
    }

    const segments = await Promise.all(segmentsData.map(async (seg) => {
      let topicSummary = `Summary for Topic ${seg.segmentIndex + 1}`
      if (seg.rawText) {
        topicSummary = await generateSummary(seg.rawText)
      }
      return {
        segmentIndex: seg.segmentIndex,
        topicSummary,
        polls: seg.polls
      }
    }))

    res.json({
      success: true,
      roomName: room.name,
      roomCode: room.code,
      segments
    })
  } catch (error) {
    console.error('Error fetching benchmark session:', error)
    res.status(500).json({ error: 'Failed to fetch session summary' })
  }
})

// GET /api/benchmark/attempt/:roomId - Get student's attempt state
router.get('/attempt/:roomId', authorize('student'), async (req, res) => {
  try {
    const { roomId } = req.params
    const studentId = req.user._id

    const attempt = await BenchmarkAttempt.findOne({ roomId, studentId }).lean()
    if (!attempt) {
      return res.json({ hasAttempt: false, attempt: null })
    }

    // If completed, compute rank on the fly to return
    if (attempt.isCompleted) {
      const frozenEntries = await FrozenLeaderboard.find({ roomId }).lean()
      
      let strictlyBetter = 0
      let outperformedCount = 0
      for (const entry of frozenEntries) {
        if (entry.accuracy > attempt.accuracy) {
          strictlyBetter++
        } else if (Math.abs(entry.accuracy - attempt.accuracy) < 0.001) {
          if (entry.averageResponseTime < attempt.averageResponseTime) {
            strictlyBetter++
          }
        }

        if (entry.accuracy < attempt.accuracy) {
          outperformedCount++
        } else if (Math.abs(entry.accuracy - attempt.accuracy) < 0.001) {
          if (entry.averageResponseTime > attempt.averageResponseTime) {
            outperformedCount++
          }
        }
      }

      const simulatedRank = strictlyBetter + 1
      const percentile = frozenEntries.length > 0 
        ? (outperformedCount / frozenEntries.length) * 100 
        : 100

      return res.json({
        hasAttempt: true,
        attempt: {
          ...attempt,
          simulatedRank,
          percentile,
          totalLiveParticipants: frozenEntries.length
        }
      })
    }

    res.json({ hasAttempt: true, attempt })
  } catch (error) {
    console.error('Error fetching attempt state:', error)
    res.status(500).json({ error: 'Failed to fetch attempt state' })
  }
})

// POST /api/benchmark/attempt/:roomId/start-poll - Start timer for benchmark poll
router.post('/attempt/:roomId/start-poll', authorize('student'), async (req, res) => {
  try {
    const { roomId } = req.params
    const { questionId } = req.body
    const studentId = req.user._id

    if (!questionId) {
      return res.status(400).json({ error: 'questionId is required' })
    }

    const question = await Question.findById(questionId)
    if (!question) {
      return res.status(404).json({ error: 'Question not found' })
    }

    let attempt = await BenchmarkAttempt.findOne({ roomId, studentId })

    if (attempt && attempt.isCompleted) {
      return res.status(400).json({ error: 'Benchmark attempt already completed' })
    }

    if (!attempt) {
      attempt = new BenchmarkAttempt({
        roomId,
        studentId,
        responses: [],
        timerState: { questionId, startTime: new Date() }
      })
    } else {
      // Check if there is already an active question timer
      const prevActiveQuestionId = attempt.timerState?.questionId
      const prevStartTime = attempt.timerState?.startTime

      if (prevActiveQuestionId && prevActiveQuestionId.toString() === questionId) {
        // Resume existing timer
        return res.json({ success: true, startTime: prevStartTime })
      }

      // If switching to a new question, handle possible timeout of the old one
      if (prevActiveQuestionId) {
        const prevQuestion = await Question.findById(prevActiveQuestionId)
        if (prevQuestion) {
          const tta = prevQuestion.timeToAnswer || 30
          const elapsed = (Date.now() - new Date(prevStartTime).getTime()) / 1000
          if (elapsed >= tta) {
            // Unanswered/timeout penalty
            const alreadyResponded = attempt.responses.some(r => r.questionId.toString() === prevActiveQuestionId.toString())
            if (!alreadyResponded) {
              attempt.responses.push({
                questionId: prevActiveQuestionId,
                selectedOptions: [],
                responseTime: tta,
                isCorrect: false,
                points: 0
              })
            }
          }
        }
      }

      attempt.timerState = { questionId, startTime: new Date() }
    }

    await attempt.save()
    res.json({ success: true, startTime: attempt.timerState.startTime })
  } catch (error) {
    console.error('Error starting poll timer:', error)
    res.status(500).json({ error: 'Failed to start poll timer' })
  }
})

// POST /api/benchmark/attempt/:roomId/submit-poll - Submit answer for benchmark poll
router.post('/attempt/:roomId/submit-poll', authorize('student'), async (req, res) => {
  try {
    const { roomId } = req.params
    const { questionId, selectedOptions } = req.body
    const studentId = req.user._id

    if (!questionId || !selectedOptions || !Array.isArray(selectedOptions)) {
      return res.status(400).json({ error: 'Missing questionId or selectedOptions array' })
    }

    const attempt = await BenchmarkAttempt.findOne({ roomId, studentId })
    if (!attempt) {
      return res.status(404).json({ error: 'Benchmark attempt not found' })
    }

    if (attempt.isCompleted) {
      return res.status(400).json({ error: 'Benchmark attempt already completed' })
    }

    // Verify timer state
    if (!attempt.timerState?.questionId || attempt.timerState.questionId.toString() !== questionId) {
      return res.status(400).json({ error: 'Timer not initialized for this question' })
    }

    // Calculate response time
    const tta = (await Question.findById(questionId))?.timeToAnswer || 30
    const elapsed = (Date.now() - new Date(attempt.timerState.startTime).getTime()) / 1000
    const responseTime = Math.min(tta, Math.max(0.1, elapsed))

    // Retrieve question correctness
    const question = await Question.findById(questionId)
    if (!question) {
      return res.status(404).json({ error: 'Question not found' })
    }

    // Prevent duplicates
    const alreadyResponded = attempt.responses.some(r => r.questionId.toString() === questionId)
    if (alreadyResponded) {
      return res.status(409).json({ error: 'Already responded to this question' })
    }

    let isCorrect = false
    if (question.type === 'MSQ') {
      const correctIndices = question.options
        .map((opt, idx) => opt.isCorrect ? idx : -1)
        .filter(idx => idx !== -1)
      
      const selectedSet = new Set(selectedOptions)
      const correctSet = new Set(correctIndices)
      
      const allCorrectSelected = correctIndices.every(idx => selectedSet.has(idx))
      const noIncorrectSelected = selectedOptions.every(idx => correctSet.has(idx))
      
      isCorrect = allCorrectSelected && noIncorrectSelected
    } else {
      const selectedOptionData = question.options[selectedOptions[0]]
      isCorrect = selectedOptionData?.isCorrect || false
    }

    const points = calculatePoints(isCorrect, question.points || 10, tta, responseTime)

    // Add response
    attempt.responses.push({
      questionId,
      selectedOptions,
      responseTime,
      isCorrect,
      points
    })

    // Clear timer
    attempt.timerState = { questionId: null, startTime: null }

    await attempt.save()

    res.json({
      success: true,
      isCorrect,
      responseTime,
      points,
      correctOptions: question.options.map((o, i) => o.isCorrect ? i : -1).filter(i => i !== -1),
      explanation: question.explanation
    })
  } catch (error) {
    console.error('Error submitting poll response:', error)
    res.status(500).json({ error: 'Failed to submit response' })
  }
})

// POST /api/benchmark/attempt/:roomId/complete - Complete attempt & calculate score/rank
router.post('/attempt/:roomId/complete', authorize('student'), async (req, res) => {
  try {
    const { roomId } = req.params
    const studentId = req.user._id

    const attempt = await BenchmarkAttempt.findOne({ roomId, studentId })
    if (!attempt) {
      return res.status(404).json({ error: 'Benchmark attempt not found' })
    }

    if (attempt.isCompleted) {
      return res.status(400).json({ error: 'Benchmark attempt already completed' })
    }

    // Retrieve all approved questions in the room
    const approvedQuestions = await Question.find({ roomId, status: 'approved' }).lean()
    
    // Penalize any unanswered questions with a timeout (max timeToAnswer, incorrect, 0 pts)
    for (const q of approvedQuestions) {
      const answered = attempt.responses.some(r => r.questionId.toString() === q._id.toString())
      if (!answered) {
        attempt.responses.push({
          questionId: q._id,
          selectedOptions: [],
          responseTime: q.timeToAnswer || 30,
          isCorrect: false,
          points: 0
        })
      }
    }

    // Calculate final metrics
    const totalQuestions = approvedQuestions.length
    const correctCount = attempt.responses.filter(r => r.isCorrect).length
    const accuracy = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0

    const totalTime = attempt.responses.reduce((sum, r) => sum + r.responseTime, 0)
    const averageResponseTime = totalQuestions > 0 ? totalTime / totalQuestions : 0

    attempt.accuracy = accuracy
    attempt.averageResponseTime = averageResponseTime
    attempt.isCompleted = true
    attempt.completedAt = new Date()
    attempt.timerState = { questionId: null, startTime: null }

    await attempt.save()

    // Query frozen leaderboard for ranking simulation
    const frozenEntries = await FrozenLeaderboard.find({ roomId }).lean()

    let strictlyBetter = 0
    let outperformedCount = 0
    for (const entry of frozenEntries) {
      if (entry.accuracy > accuracy) {
        strictlyBetter++
      } else if (Math.abs(entry.accuracy - accuracy) < 0.001) {
        if (entry.averageResponseTime < averageResponseTime) {
          strictlyBetter++
        }
      }

      if (entry.accuracy < accuracy) {
        outperformedCount++
      } else if (Math.abs(entry.accuracy - accuracy) < 0.001) {
        if (entry.averageResponseTime > averageResponseTime) {
          outperformedCount++
        }
      }
    }

    const simulatedRank = strictlyBetter + 1
    const percentile = frozenEntries.length > 0 
      ? (outperformedCount / frozenEntries.length) * 100 
      : 100

    res.json({
      success: true,
      accuracy,
      averageResponseTime,
      simulatedRank,
      percentile,
      totalLiveParticipants: frozenEntries.length
    })
  } catch (error) {
    console.error('Error completing benchmark attempt:', error)
    res.status(500).json({ error: 'Failed to complete benchmark attempt' })
  }
})

export default router
