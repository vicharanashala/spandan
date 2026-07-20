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
      owner: ownerId, type, question, options: normalizedOptions,
      correctAnswer: sanitizeText(raw.correctAnswer || '', 200),
      explanation: sanitizeText(raw.explanation || '', 2000),
      topic, difficulty, tags, sourceRoom: sourceRoom || null
    }
  }
}

const verifyRoomOwnership = async (roomId, userId) => {
  if (!roomId) return null
  if (!mongoose.Types.ObjectId.isValid(roomId)) return null
  const room = await Room.findOne({ _id: roomId, createdBy: userId }).select('_id').lean()
  return room ? room._id : null
}


// ---- Routes ----

router.get('/', async (req, res) => {
  try {
    const { search, topic, difficulty, page = 1, limit = 50 } = req.query
    const pageNum = Math.max(1, Math.min(1000, parseInt(page, 10) || 1))
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50))
    const query = { owner: req.user._id, isArchived: false }
    if (typeof search === 'string' && search.trim()) {
      const s = escapeRegex(search.trim().slice(0, 100))
      query.$or = [
        { question: { $regex: s, $options: 'i' } },
        { tags: { $in: [new RegExp('^' + s + '$', 'i')] } },
        { topic: { $regex: s, $options: 'i' } }
      ]
    }
    if (typeof topic === 'string' && topic.trim()) {
      query.topic = new RegExp('^' + escapeRegex(topic.trim().slice(0, 100)) + '$', 'i')
    }
    if (typeof difficulty === 'string' && VALID_DIFFICULTIES.includes(difficulty)) {
      query.difficulty = difficulty
    }
    const skip = (pageNum - 1) * limitNum
    const [items, total] = await Promise.all([
      QuestionBank.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
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
    const built = buildBankDocFromRoomQuestion(
      roomQuestion, req.user._id, verifiedRoomId, { topic, tags, difficulty }
    )
    if (!built.ok) return res.status(400).json({ success: false, error: built.error })
    const saved = await QuestionBank.create(built.doc)
    res.status(201).json({ success: true, question: saved })
  } catch (err) {
    console.error('[questionBank:from-room-question]', err)
    res.status(400).json({ success: false, error: err.message || 'Failed to save question' })
  }
})

router.get('/:id/import-ready', async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, error: 'Not found' })
    }
    const q = await QuestionBank.findOne({ _id: id, owner: req.user._id, isArchived: false })
    if (!q) return res.status(404).json({ success: false, error: 'Not found' })
    const obj = q.toObject()
    const { _id, owner, sourceRoom, isArchived, createdAt, updatedAt, __v, ...rest } = obj
    res.json({ success: true, question: { ...rest, sourceBankId: _id } })
  } catch (err) {
    console.error('[questionBank:import-ready]', err)
    res.status(500).json({ success: false, error: 'Failed to prepare import' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, error: 'Not found' })
    }
    const q = await QuestionBank.findOne({ _id: id, owner: req.user._id })
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
      { _id: id, owner: req.user._id, isArchived: false },
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

router.get('/meta/topics', async (req, res) => {
  try {
    const topics = await QuestionBank.aggregate([
      { $match: { owner: req.user._id, isArchived: false, topic: { $ne: '' } } },
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

export default router
