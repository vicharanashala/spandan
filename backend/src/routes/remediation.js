import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { ensureRemediationQuestion } from '../services/questionService.js'
import * as resultsSnapshot from '../services/resultsSnapshot.js'

const router = express.Router()
router.use(authenticate)

// POST /api/remediation/generate
// Called when room ends — finds the hardest questions class-wide that this student got wrong,
// generates remediation questions (one per parent question, cached so multiple students share the same LLM call result)
// Authorization: student only
router.post('/generate', authorize('student'), async (req, res) => {
  try {
    const Question = (await import('../models/Question.js')).default
    const Response = (await import('../models/Response.js')).default
    const Room = (await import('../models/Room.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default

    const { roomId, maxQuestions: rawMaxQuestions = 2 } = req.body
    // Clamp server-side — maxQuestions comes straight from the client, and the teacher-facing
    // setting only ever offers 0-5, so don't trust a request asking for more (each one is an LLM
    // call in the worst case).
    const maxQuestions = Math.max(0, Math.min(5, Number(rawMaxQuestions) || 0))
    const studentId = req.user._id

    if (!roomId) return res.status(400).json({ error: 'roomId is required' })

    // Verify student is a member of this room
    const isMember = await RoomMember.findOne({ roomId, studentId })
    if (!isMember) return res.status(403).json({ error: 'Not a member of this room' })

    // Get room for provider setting
    const room = await Room.findById(roomId).lean()
    if (!room) return res.status(404).json({ error: 'Room not found' })
    const provider = room.settings?.questionProvider || 'minimax'

    // Step 1: get this student's wrong answers
    const wrongResponses = await Response.find({ roomId, studentId, isCorrect: false }).lean()
    if (wrongResponses.length === 0) {
      return res.json({ success: true, questions: [], message: 'No wrong answers — no remediation needed' })
    }

    // Step 2: get class-wide accuracy per question (one aggregation, no N+1)
    const mongoose = (await import('mongoose')).default
    const roomObjId = new mongoose.Types.ObjectId(roomId)

    const grouped = await Response.aggregate([
      { $match: { roomId: roomObjId } },
      {
        $group: {
          _id: '$questionId',
          totalResponses: { $sum: 1 },
          correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } }
        }
      }
    ])

    // Map questionId -> class accuracy (0 to 1)
    const accuracyMap = new Map()
    for (const g of grouped) {
      accuracyMap.set(String(g._id), g.totalResponses > 0 ? g.correctCount / g.totalResponses : 0)
    }

    // Step 3: sort student's wrong questions by class accuracy ascending (hardest first)
    // then take top maxQuestions
    const wrongQuestionIds = wrongResponses.map(r => String(r.questionId))
    const sortedWrongIds = wrongQuestionIds
      .sort((a, b) => (accuracyMap.get(a) || 0) - (accuracyMap.get(b) || 0))
      .slice(0, maxQuestions)

    // Step 4: fetch the parent questions
    const parentQuestions = await Question.find({ _id: { $in: sortedWrongIds } }).lean()
    const parentMap = new Map(parentQuestions.map(q => [String(q._id), q]))

    // Step 5: for each selected question, get-or-generate its remediation question.
    // ensureRemediationQuestion() is race-safe — if 30 students hit this endpoint at once for the
    // same parent question, only one of them actually calls the LLM; the rest wait on that same
    // in-flight generation instead of firing duplicate calls. In practice this is usually just a
    // cache read, since pre-generation kicks off earlier at question:ended (see index.js) rather
    // than waiting until room end.
    const remediationQuestions = []
    let failedCount = 0

    for (const qid of sortedWrongIds) {
      const parentQuestion = parentMap.get(qid)
      if (!parentQuestion) continue

      const remQ = await ensureRemediationQuestion(roomId, parentQuestion, provider)
      if (remQ) {
        remediationQuestions.push(remQ)
      } else {
        failedCount++
      }
    }

    // If our own timeout middleware already gave up and responded (see index.js's
    // requestTimeout) while we were still waiting on generation, headers are already sent —
    // calling res.json() again would throw and, from inside a catch block, crash the process.
    if (res.headersSent) return

    res.json({
      success: true,
      questions: remediationQuestions,
      // Lets the frontend say "we couldn't prepare N of your remediation questions" instead of
      // silently handing back fewer questions than the student expects.
      failedCount
    })

    // The results snapshot for this room was very likely built (and cached for SNAPSHOT_TTL_MS)
    // BEFORE this remediation question existed — e.g. pre-warmed at room end, or built by whoever
    // hit results first. Without dropping it, this student's freshly-generated (or newly-failed,
    // now-excluded) remediation question never shows up on their results page until the cache
    // happens to expire. Fire-and-forget, after the response so it doesn't add latency to /generate.
    if (remediationQuestions.length > 0) {
      resultsSnapshot.invalidate(roomId).catch(() => {})
    }
  } catch (error) {
    console.error('[remediation] Error:', error)
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate remediation questions' })
  }
})

// POST /api/remediation/submit
// Student submits answer to a remediation question — immediate feedback with explanation
router.post('/submit', authorize('student'), async (req, res) => {
  try {
    const Question = (await import('../models/Question.js')).default
    const Response = (await import('../models/Response.js')).default
    const Room = (await import('../models/Room.js')).default

    const { roomId, questionId, selectedOptions, responseTime } = req.body
    const studentId = req.user._id

    const question = await Question.findById(questionId).lean()
    if (!question || !question.isRemediation || question.generationStatus !== 'ready') {
      // Also guards against a stale client reference to a still-generating/failed placeholder
      // (empty options array), which would otherwise silently mark every answer wrong.
      return res.status(404).json({ error: 'Remediation question not found' })
    }

    // Check if already answered
    const existing = await Response.findOne({ roomId, questionId, studentId })
    if (existing) return res.status(409).json({ error: 'Already answered this remediation question' })

    const selectedOptionData = question.options[selectedOptions[0]]
    const isCorrect = selectedOptionData?.isCorrect || false
    const maxPoints = question.points || 50
    const points = isCorrect ? maxPoints : 0
    const correctOption = question.options.findIndex(o => o.isCorrect)

    const response = new Response({
      roomId,
      questionId,
      studentId,
      selectedOption: selectedOptions[0],
      selectedOptions,
      isCorrect,
      responseTime: responseTime || 0,
      points
    })
    await response.save()

    // A remediation answer happens after the room has ended — i.e. after the results snapshot for
    // this room was already built and cached. Without this, a student who finishes their
    // remediation flow and immediately checks results can get served the frozen pre-remediation
    // snapshot (missing this answer entirely) for up to SNAPSHOT_TTL_MS. Drop it so the next
    // results-page load rebuilds fresh. Best-effort: a failure here shouldn't fail the submit.
    resultsSnapshot.invalidate(roomId).catch(() => {})

    // A teacher who's already sitting on the results page (having ended the room a while ago) has
    // no other way of finding out a remediation answer just came in — nothing re-polls after room
    // end. Broadcast it so their page can refresh itself instead of needing a manual reload.
    // Best-effort: a broadcast failure shouldn't fail the student's submit.
    try {
      const room = await Room.findById(roomId).select('code').lean()
      if (room?.code) {
        req.app.get('io')?.to(room.code).emit('remediation:submitted', {
          roomId,
          questionId,
          studentId,
          isCorrect,
          points
        })
      }
    } catch (broadcastErr) {
      console.error('[remediation] Failed to broadcast submission:', broadcastErr.message)
    }

    if (res.headersSent) return

    res.status(201).json({
      success: true,
      isCorrect,
      points,
      correctOption,
      explanation: question.explanation
    })
  } catch (error) {
    console.error('[remediation] Submit error:', error)
    if (!res.headersSent) res.status(500).json({ error: 'Failed to submit answer' })
  }
})

export default router