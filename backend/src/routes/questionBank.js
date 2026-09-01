import express from 'express'
import mongoose from 'mongoose'
import QuestionBank from '../models/QuestionBank.js'
import Room from '../models/Room.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()
router.use(authenticate)

// ---- Hardening helpers ----

// Escape regex metacharacters so user input is treated as a literal string.
// Prevents ReDoS and accidental regex matches.
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Bound any user-supplied text length and strip control chars.
const sanitizeText = (s, max = 5000) => {
  if (typeof s !== 'string') return ''
  return s
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '')
    .replace(/\r\n?/g, '\n')
    .slice(0, max)
    .trim()
}

const sanitizeTag = (t) =>
  typeof t === 'string' ? t.toLowerCase().trim().slice(0, 40).replace(/[^a-z0-9\-_]/g, '') : null

const VALID_TYPES = ['MCQ', 'TF', 'MSQ']
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard']

const buildBankDocFromRoomQuestion = (raw, ownerId, sourceRoom, meta) => {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'roomQuestion must be an object' }
  const type = VALID_TYPES.includes(raw.type) ? raw.type : null
  if (!type) return { ok: false, error: 'Invalid type. Allowed: MCQ, TF, MSQ' }
  const question = sanitizeText(raw.question, 2000)
  if (!question) return { ok: false, error: 'question text is required' }
  if (!Array.isArray(raw.options)) return { ok: false, error: 'options must be an array' }
  if (raw.options.length > 10) return { ok: false, error: 'max 10 options allowed' }
  let normalizedOptions
  try {
    normalizedOptions = raw.options.map((o, idx) => {
      if (typeof o === 'string') return { text: sanitizeText(o, 500), isCorrect: false }
      if (o && typeof o === 'object' && typeof o.text === 'string') {
        return { text: sanitizeText(o.text, 500), isCorrect: o.isCorrect === true }
      }
      throw new Error('option[' + idx + '] is malformed')
    }).filter(o => o.text.length > 0)
  } catch (e) {
    return { ok: false, error: e.message }
  }
  if (normalizedOptions.length === 0) return { ok: false, error: 'at least one option with text is required' }
  if ((type === 'MCQ' || type === 'MSQ') && !normalizedOptions.some(o => o.isCorrect)) {
    return { ok: false, error: 'MCQ/MSQ requires at least one correct option' }
  }
  if (type === 'TF') {
    const hasCorrect = normalizedOptions.some(o => o.isCorrect)
    if (!hasCorrect && typeof raw.correctAnswer === 'string' && raw.correctAnswer.trim()) {
      const ca = raw.correctAnswer.trim().toLowerCase()
      normalizedOptions.forEach(o => { if (o.text.toLowerCase() === ca) o.isCorrect = true })
    }
    if (!normalizedOptions.some(o => o.isCorrect)) return { ok: false, error: 'TF requires a correct option' }
  }
  const topic = sanitizeText((meta && meta.topic) || (raw && raw.topic) || '', 100)
  const difficulty = VALID_DIFFICULTIES.includes(meta && meta.difficulty) ? meta.difficulty :
                     (VALID_DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : 'medium')
  const rawTags = Array.isArray(meta && meta.tags) ? meta.tags : []
  const tags = []
  const seen = new Set()
  for (const t of rawTags) {
    const clean = sanitizeTag(t)
    if (clean && !seen.has(clean)) { seen.add(clean); tags.push(clean); if (tags.length >= 20) break }
  }
  return {
    ok: true,
    doc: {
      teacherId: ownerId, type, questionText: question, options: normalizedOptions,
      correctAnswer: sanitizeText(raw.correctAnswer || '', 200),
      explanation: sanitizeText(raw.explanation || '', 2000),
      timeToAnswer: typeof raw.timeToAnswer === 'number' ? raw.timeToAnswer : 30,
      topic, difficulty, tags,
      provenance: {
        origin: 'manual', // default if not specified
        sourceSessionId: sourceRoom || null,
        generatedAt: new Date(),
        approvedAt: new Date(),
        editedBeforeApproval: false
      }
    }
  }
}

const verifyRoomOwnership = async (roomId, userId) => {
  if (!roomId) return null
  if (!mongoose.Types.ObjectId.isValid(roomId)) return null
  const room = await Room.findOne({ _id: roomId, teacher: userId }).select('_id').lean()
  return room ? room._id : null
}


// ---- Routes ----

router.get('/', async (req, res) => {
  try {
    const { search, topic, difficulty, folderId, page = 1, limit = 50 } = req.query
    const pageNum = Math.max(1, Math.min(1000, parseInt(page, 10) || 1))
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50))
    const query = { teacherId: req.user._id, isArchived: false }
    const { origin, tags } = req.query
    if (typeof search === 'string' && search.trim()) {
      const s = search.trim().slice(0, 100)
      query.$text = { $search: s }
    }
    if (typeof origin === 'string' && origin.trim()) {
      query['provenance.origin'] = origin
    }
    if (typeof folderId === 'string' && mongoose.Types.ObjectId.isValid(folderId)) {
      query.folderId = folderId
    }
    if (typeof tags === 'string' && tags.trim()) {
      const tagsArray = tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      if (tagsArray.length > 0) {
        query.tags = { $all: tagsArray }
      }
    }
    if (typeof topic === 'string' && topic.trim()) {
      query.topic = new RegExp('^' + escapeRegex(topic.trim().slice(0, 100)) + '$', 'i')
    }
    if (typeof difficulty === 'string' && VALID_DIFFICULTIES.includes(difficulty)) {
      query.difficulty = difficulty
    }
    const skip = (pageNum - 1) * limitNum
    const [items, total] = await Promise.all([
      QuestionBank.find(query)
        .populate('folderId', 'name roomCode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      QuestionBank.countDocuments(query)
    ])
    res.json({ success: true, items, total, page: pageNum, limit: limitNum })
  } catch (err) {
    console.error('[questionBank:list]', err)
    res.status(500).json({ success: false, error: 'Failed to list questions' })
  }
})

router.post('/from-room-question', async (req, res) => {
  try {
    const body = req.body || {}
    const { roomQuestion, roomId, topic, tags, difficulty } = body
    let verifiedRoomId = null
    if (roomId) verifiedRoomId = await verifyRoomOwnership(roomId, req.user._id)
    
    const QuestionBankFolder = (await import('../models/QuestionBankFolder.js')).default
    let folder = verifiedRoomId ? await QuestionBankFolder.findOne({ roomId: verifiedRoomId }) : null

    // If folder doesn't exist yet for this room, create it on-the-fly
    if (!folder && verifiedRoomId) {
      const room = await Room.findById(verifiedRoomId).select('name code').lean()
      if (room) {
        folder = await QuestionBankFolder.create({
          teacherId: req.user._id,
          name: room.name,
          roomCode: room.code,
          roomId: room._id
        })
      }
    }

    const built = buildBankDocFromRoomQuestion(
      roomQuestion, req.user._id, verifiedRoomId, { topic, tags, difficulty }
    )
    if (!built.ok) return res.status(400).json({ success: false, error: built.error })
    
    if (folder) {
      built.doc.folderId = folder._id
    }

    const saved = await QuestionBank.create(built.doc)
    res.status(201).json({ success: true, question: saved })
  } catch (err) {
    console.error('[questionBank:from-room-question]', err)
    res.status(400).json({ success: false, error: err.message || 'Failed to save question' })
  }
})

router.get('/meta/topics', async (req, res) => {
  try {
    const topics = await QuestionBank.aggregate([
      { $match: { teacherId: req.user._id, isArchived: false, topic: { $ne: '' } } },
      { $group: { _id: '$topic', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 200 }
    ])
    res.json({ success: true, topics: topics.map(t => ({ name: t._id, count: t.count })) })
  } catch (err) {
    console.error('[questionBank:topics]', err)
    res.status(500).json({ success: false, error: 'Failed to load topics' })
  }
})

router.get('/folders', async (req, res) => {
  try {
    const QuestionBankFolder = (await import('../models/QuestionBankFolder.js')).default

    const folders = await QuestionBankFolder.find({ teacherId: req.user._id }).sort({ createdAt: -1 }).lean()

    // Compute question count per folder
    const counts = await QuestionBank.aggregate([
      { $match: { teacherId: req.user._id, isArchived: false, folderId: { $ne: null } } },
      { $group: { _id: '$folderId', count: { $sum: 1 } } }
    ])
    const countMap = {}
    counts.forEach(c => {
      if (c._id) countMap[c._id.toString()] = c.count
    })

    const foldersWithCounts = folders.map(f => ({
      ...f,
      questionCount: countMap[f._id.toString()] || 0
    }))

    res.json({ success: true, folders: foldersWithCounts })
  } catch (err) {
    console.error('[questionBank:folders]', err)
    res.status(500).json({ success: false, error: 'Failed to fetch folders' })
  }
})

router.get('/:id/import-ready', async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, error: 'Not found' })
    }
    const q = await QuestionBank.findOne({ _id: id, teacherId: req.user._id, isArchived: false })
    if (!q) return res.status(404).json({ success: false, error: 'Not found' })
    const obj = q.toObject()
    const { _id, teacherId, isArchived, createdAt, updatedAt, __v, ...rest } = obj
    res.json({ success: true, question: { ...rest, sourceBankId: _id } })
  } catch (err) {
    console.error('[questionBank:import-ready]', err)
    res.status(500).json({ success: false, error: 'Failed to prepare import' })
  }
})

router.get('/room/:roomId/saved', async (req, res) => {
  try {
    const { roomId } = req.params
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ success: false, error: 'Invalid roomId' })
    }
    const savedQuestions = await QuestionBank.find({
      teacherId: req.user._id,
      'provenance.sourceSessionId': roomId,
      isArchived: false
    }).select('_id').lean()
    
    res.json({ success: true, savedIds: savedQuestions.map(q => q._id) })
  } catch (err) {
    console.error('[questionBank:room-saved]', err)
    res.status(500).json({ success: false, error: 'Failed to fetch saved questions for room' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, error: 'Not found' })
    }
    const q = await QuestionBank.findOne({ _id: id, teacherId: req.user._id })
    if (!q) return res.status(404).json({ success: false, error: 'Not found' })
    res.json({ success: true, question: q })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch question' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, error: 'Not found' })
    }
    const q = await QuestionBank.findOneAndUpdate(
      { _id: id, teacherId: req.user._id, isArchived: false },
      { isArchived: true },
      { new: true }
    )
    if (!q) return res.status(404).json({ success: false, error: 'Not found' })
    res.json({ success: true, archived: q._id })
  } catch (err) {
    console.error('[questionBank:archive]', err)
    res.status(500).json({ success: false, error: 'Failed to archive question' })
  }
})


router.post('/:id/reuse', async (req, res) => {
  try {
    const { id } = req.params
    const { sessionId } = req.body
    
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId is required' })
    }
    
    const bankEntry = await QuestionBank.findOne({ _id: id, teacherId: req.user._id, isArchived: false })
    if (!bankEntry) {
      return res.status(404).json({ success: false, error: 'Question not found in bank' })
    }
    
    const room = await Room.findOne({ _id: sessionId, teacher: req.user._id })
    if (!room) {
      return res.status(403).json({ success: false, error: 'Not authorized for this session' })
    }
    
    const Question = (await import('../models/Question.js')).default
    
    const newQuestion = new Question({
      roomId: sessionId,
      type: bankEntry.type === 'open-ended' ? 'MCQ' : bankEntry.type, // Fallback if open-ended isn't supported in Session
      question: bankEntry.questionText,
      options: bankEntry.options,
      explanation: bankEntry.explanation,
      timeToAnswer: bankEntry.timeToAnswer || 30,
      status: 'approved',
      sourceBankId: bankEntry._id,
      createdBy: req.user._id
    })
    
    await newQuestion.save()
    
    const io = req.app.get('io')
    if (io && room.code) {
      io.to(room.code).emit('new_question', newQuestion)
    }
    
    res.json({ success: true, question: newQuestion })
  } catch (err) {
    console.error('[questionBank:reuse]', err)
    res.status(500).json({ success: false, error: 'Failed to reuse question' })
  }
})

router.post('/:id/import-by-code', async (req, res) => {
  try {
    const { id } = req.params
    const { roomCode } = req.body
    
    if (!roomCode) {
      return res.status(400).json({ success: false, error: 'roomCode is required' })
    }
    
    const bankEntry = await QuestionBank.findOne({ _id: id, teacherId: req.user._id, isArchived: false })
    if (!bankEntry) {
      return res.status(404).json({ success: false, error: 'Question not found in bank' })
    }
    
    const room = await Room.findOne({ code: roomCode, teacher: req.user._id })
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found or you are not the owner' })
    }
    
    const Question = (await import('../models/Question.js')).default
    
    const newQuestion = new Question({
      roomId: room._id,
      type: bankEntry.type === 'open-ended' ? 'MCQ' : bankEntry.type,
      question: bankEntry.questionText,
      options: bankEntry.options,
      explanation: bankEntry.explanation,
      timeToAnswer: bankEntry.timeToAnswer || 30,
      status: 'approved',
      sourceBankId: bankEntry._id,
      createdBy: req.user._id
    })
    
    await newQuestion.save()
    
    const io = req.app.get('io')
    if (io && roomCode) {
      io.to(roomCode).emit('new_question', newQuestion)
    }
    
    res.json({ success: true, question: newQuestion, roomName: room.name })
  } catch (err) {
    console.error('[questionBank:import-by-code]', err)
    res.status(500).json({ success: false, error: 'Failed to import question' })
  }
})


export default router
