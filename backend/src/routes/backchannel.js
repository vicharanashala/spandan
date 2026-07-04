import express from 'express'
import mongoose from 'mongoose'
import { authenticate, authorize } from '../middleware/auth.js'
import BackchannelQuestion from '../models/BackchannelQuestion.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import Transcript from '../models/Transcript.js'
import { sanitize } from '../utils/sanitize.js'

const router = express.Router()

router.use(authenticate)

const MIN_QUESTION_LENGTH = 8
const MAX_QUESTION_LENGTH = 500
const POST_COOLDOWN_MS = 15000
const MAX_POSTS_PER_MINUTE = 3
const AUTO_HIDE_REPORTS = 3
const INAPPROPRIATE_LANGUAGE_MESSAGE = 'Your question contains inappropriate language.\nPlease rephrase and try again.'
const OFF_TOPIC_WARNING_MESSAGE = 'Your question may not be related to the current class transcript. Please keep backchannel questions focused on the class discussion.'

const profanityPatterns = [
  /\bf+u+c+k+\b/i,
  /\bs+h+i+t+\b/i,
  /\bb+i+t+c+h+\b/i,
  /\ba+s+s+h+o+l+e+\b/i,
  /\bb+a+s+t+a+r+d+\b/i,
  /\bd+a+m+n+\b/i
]

const toxicityPatterns = [
  /\b(kill|die|hurt|attack)\s+(you|him|her|them|teacher|student)\b/i,
  /\b(stupid|idiot|moron|dumb|loser)\b/i,
  /\b(hate|harass|bully)\b/i
]

const spamPatterns = [
  /(.)\1{7,}/,
  /\b(.{2,20})\b(?:\s+\1\b){3,}/i,
  /(https?:\/\/|www\.)/i
]

const normalizeForModeration = (value) => String(value || '').trim()

const stopWords = new Set([
  'about', 'after', 'again', 'also', 'because', 'before', 'being', 'between', 'class', 'could',
  'does', 'doing', 'during', 'each', 'explain', 'from', 'have', 'help', 'just', 'like', 'more',
  'please', 'question', 'repeat', 'should', 'that', 'their', 'there', 'these', 'thing', 'this',
  'those', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your'
])

const classroomFollowUpPatterns = [
  /\b(can|could|please)\s+you\s+(repeat|explain|clarify|show|give)\b/i,
  /\b(what|why|how)\s+(does|do|did|is|are|was|were)\s+(that|this|it)\b/i,
  /\b(example|examples|clarify|repeat|elaborate|again)\b/i
]

const tokenizeForRelevance = (value) => {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word))
}

const getTranscriptContext = async (roomId) => {
  const transcripts = await Transcript.find({ roomId })
    .sort({ segmentIndex: 1 })
    .select('text')
    .lean()

  return transcripts.map(segment => segment.text).join(' ')
}

const checkTranscriptRelevance = (questionText, transcriptText) => {
  const transcriptTokens = tokenizeForRelevance(transcriptText)
  if (transcriptTokens.length < 8) return { isRelevant: true, overlap: 0 }

  if (classroomFollowUpPatterns.some(pattern => pattern.test(questionText))) {
    return { isRelevant: true, overlap: 1 }
  }

  const questionTokens = Array.from(new Set(tokenizeForRelevance(questionText)))
  if (questionTokens.length === 0) return { isRelevant: true, overlap: 0 }

  const transcriptTokenSet = new Set(transcriptTokens)
  const matchingTerms = questionTokens.filter(token => transcriptTokenSet.has(token))
  const overlap = matchingTerms.length / questionTokens.length

  return {
    isRelevant: matchingTerms.length >= 1 || overlap >= 0.25,
    overlap: Number(overlap.toFixed(2))
  }
}

const moderateBackchannelText = async (text, roomId) => {
  const normalized = normalizeForModeration(text)
  const reasons = []
  let score = 0
  let hasInappropriateLanguage = false

  if (normalized.length < MIN_QUESTION_LENGTH) {
    reasons.push(`Question must be at least ${MIN_QUESTION_LENGTH} characters`)
    score += 0.25
  }

  if (normalized.length > MAX_QUESTION_LENGTH) {
    reasons.push(`Question cannot exceed ${MAX_QUESTION_LENGTH} characters`)
    score += 0.25
  }

  if (profanityPatterns.some(pattern => pattern.test(normalized))) {
    reasons.push('Profanity or offensive language')
    score += 0.65
    hasInappropriateLanguage = true
  }

  if (toxicityPatterns.some(pattern => pattern.test(normalized))) {
    reasons.push('Personal attack or toxic language')
    score += 0.45
    hasInappropriateLanguage = true
  }

  if (spamPatterns.some(pattern => pattern.test(normalized))) {
    reasons.push('Spam-like or irrelevant content')
    score += 0.35
  }

  const questionLike = /\?|\b(what|why|how|when|where|which|can|could|please|explain|clarify|repeat|example)\b/i.test(normalized)
  if (!questionLike && normalized.length >= MIN_QUESTION_LENGTH) {
    reasons.push('Does not look like a classroom question')
    score += 0.2
  }

  const transcriptText = await getTranscriptContext(roomId)
  const relevance = checkTranscriptRelevance(normalized, transcriptText)
  if (!relevance.isRelevant) {
    reasons.push('May not be related to the current class transcript')
    score += 0.35
  }

  const clampedScore = Math.min(1, score)
  let status = 'approved'
  if (hasInappropriateLanguage) status = 'blocked'
  else if (clampedScore >= 0.35) status = 'flagged'

  return {
    status,
    reasons,
    score: Number(clampedScore.toFixed(2)),
    hasInappropriateLanguage,
    isOffTopic: !relevance.isRelevant
  }
}

const getAuthorizedRoom = async (roomId, user) => {
  if (!mongoose.Types.ObjectId.isValid(roomId)) {
    const error = new Error('Invalid roomId')
    error.status = 400
    throw error
  }

  const room = await Room.findById(roomId)
  if (!room) {
    const error = new Error('Room not found')
    error.status = 404
    throw error
  }

  const isTeacher = room.teacher.toString() === user._id.toString()
  const isStudentMember = await RoomMember.findOne({ roomId, studentId: user._id })

  if (!isTeacher && !isStudentMember) {
    const error = new Error('Not authorized to access backchannel for this room')
    error.status = 403
    throw error
  }

  return { room, isTeacher }
}

const sortBackchannelQuestions = (questions) => {
  return questions.sort((a, b) => {
    if (a.moderationStatus !== b.moderationStatus) {
      if (a.moderationStatus === 'flagged') return -1
      if (b.moderationStatus === 'flagged') return 1
    }
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes
    return new Date(a.createdAt) - new Date(b.createdAt)
  })
}

const emitBackchannelUpdate = (req, room) => {
  const io = req.app.get('io')
  if (io && room?.code) {
    io.to(room.code).emit('backchannel:updated', { roomId: room._id })
  }
}

router.get('/', async (req, res) => {
  try {
    const { roomId } = req.query
    if (!roomId) return res.status(400).json({ error: 'roomId is required' })

    const { isTeacher } = await getAuthorizedRoom(roomId, req.user)
    const filter = isTeacher
      ? { roomId, status: { $ne: 'deleted' } }
      : { roomId, status: { $ne: 'deleted' }, moderationStatus: 'approved', isHidden: false }

    const questions = await BackchannelQuestion.find(filter)
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      questions: sortBackchannelQuestions(questions.map(question => question.toClient(req.user._id, { includeAudit: isTeacher })))
    })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch backchannel questions' })
  }
})

router.post('/', authorize('student'), async (req, res) => {
  try {
    const { roomId, text } = req.body
    if (!roomId || !text || !String(text).trim()) {
      return res.status(400).json({ error: 'roomId and question text are required' })
    }

    const originalText = normalizeForModeration(text)
    if (originalText.length < MIN_QUESTION_LENGTH || originalText.length > MAX_QUESTION_LENGTH) {
      return res.status(400).json({
        error: `Question must be between ${MIN_QUESTION_LENGTH} and ${MAX_QUESTION_LENGTH} characters`
      })
    }

    const { room } = await getAuthorizedRoom(roomId, req.user)
    if (room.endedAt) {
      return res.status(400).json({ error: 'Cannot submit questions after the room has ended' })
    }

    const now = new Date()
    const recentQuestion = await BackchannelQuestion.findOne({
      roomId,
      createdBy: req.user._id,
      createdAt: { $gte: new Date(now.getTime() - POST_COOLDOWN_MS) }
    }).sort({ createdAt: -1 })

    if (recentQuestion) {
      return res.status(429).json({ error: 'Please wait a few seconds before posting another question' })
    }

    const recentCount = await BackchannelQuestion.countDocuments({
      roomId,
      createdBy: req.user._id,
      createdAt: { $gte: new Date(now.getTime() - 60000) }
    })

    if (recentCount >= MAX_POSTS_PER_MINUTE) {
      return res.status(429).json({ error: 'You are posting too quickly. Please slow down and try again later.' })
    }

    const moderation = await moderateBackchannelText(originalText, roomId)
    const isBlocked = moderation.status === 'blocked'
    const isFlagged = moderation.status === 'flagged'

    const question = await BackchannelQuestion.create({
      roomId,
      text: sanitize(originalText).slice(0, MAX_QUESTION_LENGTH),
      originalText: sanitize(originalText).slice(0, MAX_QUESTION_LENGTH),
      createdBy: req.user._id,
      moderationStatus: moderation.status,
      moderationReasons: moderation.reasons,
      moderationScore: moderation.score,
      isHidden: isBlocked || isFlagged,
      upvotedBy: isBlocked ? [] : [req.user._id],
      flaggedAt: isFlagged || isBlocked ? now : null
    })

    if (!isBlocked) emitBackchannelUpdate(req, room)

    if (isBlocked) {
      return res.status(422).json({
        success: false,
        blocked: true,
        error: moderation.hasInappropriateLanguage ? INAPPROPRIATE_LANGUAGE_MESSAGE : OFF_TOPIC_WARNING_MESSAGE,
        reasons: moderation.reasons
      })
    }

    res.status(201).json({
      success: true,
      flagged: isFlagged,
      warning: moderation.isOffTopic ? OFF_TOPIC_WARNING_MESSAGE : undefined,
      message: isFlagged
        ? (moderation.isOffTopic ? undefined : 'Your question is waiting for teacher review before it appears.')
        : undefined,
      question: question.toClient(req.user._id)
    })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to submit backchannel question' })
  }
})

router.put('/:id/upvote', authorize('student'), async (req, res) => {
  try {
    const question = await BackchannelQuestion.findById(req.params.id)
    if (!question) return res.status(404).json({ error: 'Question not found' })

    const { room } = await getAuthorizedRoom(question.roomId, req.user)
    if (question.status === 'resolved' || question.status === 'deleted' || question.isHidden || question.moderationStatus !== 'approved') {
      return res.status(400).json({ error: 'Cannot upvote this question' })
    }

    const userId = req.user._id.toString()
    const hasUpvoted = question.upvotedBy.some(id => id.toString() === userId)

    if (hasUpvoted) {
      question.upvotedBy = question.upvotedBy.filter(id => id.toString() !== userId)
    } else {
      question.upvotedBy.push(req.user._id)
    }

    await question.save()
    emitBackchannelUpdate(req, room)

    res.json({
      success: true,
      question: question.toClient(req.user._id)
    })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to update upvote' })
  }
})

router.put('/:id/report', authorize('student'), async (req, res) => {
  try {
    const question = await BackchannelQuestion.findById(req.params.id)
    if (!question) return res.status(404).json({ error: 'Question not found' })

    const { room } = await getAuthorizedRoom(question.roomId, req.user)
    if (question.status !== 'open') {
      return res.status(400).json({ error: 'Only open questions can be reported' })
    }

    const userId = req.user._id.toString()
    const alreadyReported = question.reportedBy.some(id => id.toString() === userId)
    if (!alreadyReported) {
      question.reportedBy.push(req.user._id)
    }

    if (question.reportedBy.length >= AUTO_HIDE_REPORTS) {
      question.moderationStatus = 'flagged'
      question.isHidden = true
      question.flaggedAt = new Date()
      question.moderationReasons = Array.from(new Set([...(question.moderationReasons || []), 'Multiple student reports']))
    }

    await question.save()
    emitBackchannelUpdate(req, room)

    res.json({
      success: true,
      question: question.toClient(req.user._id)
    })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to report question' })
  }
})

router.put('/:id/resolve', authorize('teacher'), async (req, res) => {
  try {
    const question = await BackchannelQuestion.findById(req.params.id)
    if (!question) return res.status(404).json({ error: 'Question not found' })

    const { room, isTeacher } = await getAuthorizedRoom(question.roomId, req.user)
    if (!isTeacher) return res.status(403).json({ error: 'Only the room teacher can resolve questions' })

    question.status = 'resolved'
    question.resolvedAt = new Date()
    question.resolvedBy = req.user._id
    await question.save()

    emitBackchannelUpdate(req, room)

    res.json({
      success: true,
      question: question.toClient(req.user._id)
    })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to resolve question' })
  }
})

router.put('/:id/flag', authorize('teacher'), async (req, res) => {
  try {
    const question = await BackchannelQuestion.findById(req.params.id)
    if (!question) return res.status(404).json({ error: 'Question not found' })

    const { room, isTeacher } = await getAuthorizedRoom(question.roomId, req.user)
    if (!isTeacher) return res.status(403).json({ error: 'Only the room teacher can flag questions' })

    question.moderationStatus = 'flagged'
    question.isHidden = true
    question.flaggedAt = new Date()
    question.flaggedBy = req.user._id
    question.moderationReasons = Array.from(new Set([...(question.moderationReasons || []), 'Teacher flagged']))
    await question.save()

    emitBackchannelUpdate(req, room)

    res.json({
      success: true,
      question: question.toClient(req.user._id, { includeAudit: true })
    })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to flag question' })
  }
})

router.put('/:id/approve', authorize('teacher'), async (req, res) => {
  try {
    const question = await BackchannelQuestion.findById(req.params.id)
    if (!question) return res.status(404).json({ error: 'Question not found' })

    const { room, isTeacher } = await getAuthorizedRoom(question.roomId, req.user)
    if (!isTeacher) return res.status(403).json({ error: 'Only the room teacher can approve questions' })

    question.moderationStatus = 'approved'
    question.isHidden = false
    await question.save()

    emitBackchannelUpdate(req, room)

    res.json({
      success: true,
      question: question.toClient(req.user._id, { includeAudit: true })
    })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to approve question' })
  }
})

router.delete('/:id', authorize('teacher'), async (req, res) => {
  try {
    const question = await BackchannelQuestion.findById(req.params.id)
    if (!question) return res.status(404).json({ error: 'Question not found' })

    const { room, isTeacher } = await getAuthorizedRoom(question.roomId, req.user)
    if (!isTeacher) return res.status(403).json({ error: 'Only the room teacher can delete questions' })

    question.status = 'deleted'
    question.isHidden = true
    question.deletedAt = new Date()
    question.deletedBy = req.user._id
    await question.save()

    emitBackchannelUpdate(req, room)

    res.json({ success: true })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to delete question' })
  }
})

export default router
