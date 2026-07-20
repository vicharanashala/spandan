import express from 'express'
import mongoose from 'mongoose'
import { authenticate, authorize } from '../middleware/auth.js'
import QuestionIntervention, {
  INTERVENTION_TYPES,
  INTERVENTION_TYPE_LABELS,
  INTERVENTION_STATUSES,
  retentionWindowDays
} from '../models/QuestionIntervention.js'
import InterventionResponse from '../models/InterventionResponse.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import Response from '../models/Response.js'
import Question from '../models/Question.js'

const router = express.Router()

router.use(authenticate)

// Global env-default threshold — used when a room has no per-room override set. Teacher can
// still configure any percentage via PUT /api/interventions/room/:roomId/threshold.
const INTERVENTION_THRESHOLD = Math.max(0, Math.min(1, Number(process.env.INTERVENTION_THRESHOLD) || 0.6))
// Default for the "relative duration" deadline mode in the teacher UI (hours). Backend
// resolves both modes to an absolute Date — this just provides a sensible suggested value.
const DEFAULT_RELATIVE_HOURS = Math.max(1, Number(process.env.INTERVENTION_DEFAULT_HOURS) || 12)

// Sanity bounds for the relative duration mode. We reject anything outside [1 min, 30 days]
// so a teacher typo can't accidentally push the deadline decades into the future.
const MIN_RELATIVE_MS = 60 * 1000
const MAX_RELATIVE_MS = 30 * 24 * 60 * 60 * 1000

// Resolve the effective threshold for a given room: per-room override > global env-default.
// Single source of truth used by /flagged and any other endpoint that consults the threshold.
function effectiveThresholdForRoom(room) {
  const t = room?.settings?.interventionThreshold
  if (typeof t === 'number' && Number.isFinite(t) && t >= 0 && t <= 1) return t
  return INTERVENTION_THRESHOLD
}

// GET /api/interventions/config — exposes the global threshold + defaults so the front-end
// never hardcodes. Per-room overrides are read from /flagged directly. Public to any
// authenticated user so the student results page can read the same global default.
router.get('/config', (req, res) => {
  res.json({
    success: true,
    config: {
      threshold: INTERVENTION_THRESHOLD,
      thresholdPercent: Math.round(INTERVENTION_THRESHOLD * 100),
      defaultRelativeHours: DEFAULT_RELATIVE_HOURS,
      contentRetentionDays: retentionWindowDays
    }
  })
})

// PUT /api/interventions/room/:roomId/threshold — teacher (room owner) sets the per-room
// accuracy threshold used to flag questions for intervention. Stored on Room.settings so it
// is naturally scoped to this session — never bleeds into other rooms.
router.put('/room/:roomId/threshold', authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.params
    const room = await Room.findById(roomId)
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized: only the room owner can change the threshold' })
    }
    if (!room.endedAt) {
      return res.status(400).json({ error: 'The threshold can only be set after the session has ended' })
    }
    const pct = Number(req.body?.thresholdPercent)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: 'thresholdPercent must be a number between 0 and 100' })
    }
    room.settings = room.settings || {}
    room.settings.interventionThreshold = pct / 100
    await room.save()
    res.json({
      success: true,
      threshold: room.settings.interventionThreshold,
      thresholdPercent: Math.round(room.settings.interventionThreshold * 100)
    })
  } catch (error) {
    console.error('Error setting intervention threshold:', error)
    res.status(500).json({ error: 'Failed to set threshold' })
  }
})

// GET /api/interventions/room/:roomId/flagged — teacher only, room owner only, ended room only.
// Reuses the analytics primitive from routes/responses.js (correctCount from grouped aggregation,
// totalEligible from RoomMember count). Returns accuracy alongside the existing question data so
// the UI doesn't have to recompute. Uses the per-room threshold if the teacher set one,
// otherwise the global env-default. Returns ALL approved questions with their `flagged` boolean
// (not just flagged ones) so the teacher can see accuracy inline for every question.
router.get('/room/:roomId/flagged', authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.params
    const room = await Room.findById(roomId)
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized: only the room owner can view flagged questions' })
    }
    if (!room.endedAt) {
      return res.status(400).json({ error: 'Flagged questions are only available after the session ends' })
    }

    const threshold = effectiveThresholdForRoom(room)
    const totalEligible = await RoomMember.countDocuments({ roomId })

    // Pull questions + their per-option counts via the same aggregation the room-stats endpoint uses,
    // so flagged-question accuracy stays consistent with what's already shown on RoomResultsPage.
    const [questions, grouped] = await Promise.all([
      Question.find({ roomId, status: 'approved' }).lean(),
      Response.aggregate([
        { $match: { roomId: new mongoose.Types.ObjectId(roomId) } },
        { $group: { _id: { q: '$questionId', opt: '$selectedOption', isCorrect: '$isCorrect' }, count: { $sum: 1 } } }
      ])
    ])

    const correctByQuestion = new Map()
    const totalByQuestion = new Map()
    for (const g of grouped) {
      const qid = g._id.q ? g._id.q.toString() : null
      if (!qid) continue
      totalByQuestion.set(qid, (totalByQuestion.get(qid) || 0) + g.count)
      if (g._id.isCorrect) correctByQuestion.set(qid, (correctByQuestion.get(qid) || 0) + g.count)
    }

    const all = questions.map((q) => {
      const correct = correctByQuestion.get(q._id.toString()) || 0
      const total = totalByQuestion.get(q._id.toString()) || 0
      const accuracy = totalEligible > 0 ? correct / totalEligible : 0
      return {
        questionId: q._id,
        question: q.question,
        type: q.type,
        options: q.options,
        correctCount: correct,
        totalResponses: total,
        totalEligible,
        accuracy,
        accuracyPercent: Math.round(accuracy * 100),
        flagged: accuracy < threshold
      }
    })

    res.json({
      success: true,
      threshold,
      thresholdPercent: Math.round(threshold * 100),
      thresholdIsCustom: room.settings?.interventionThreshold != null,
      questions: all,
      flagged: all.filter((q) => q.flagged)
    })
  } catch (error) {
    console.error('Error fetching flagged questions:', error)
    res.status(500).json({ error: 'Failed to fetch flagged questions' })
  }
})

// Helper — resolves the deadline (absolute or relative) into a single absolute Date, or throws.
function resolveDeadline(mode, value) {
  if (mode === 'absolute') {
    const d = new Date(value)
    if (isNaN(d.getTime())) throw new Error('Invalid absolute deadline value')
    if (d.getTime() <= Date.now()) throw new Error('Deadline must be in the future')
    return d
  }
  if (mode === 'relative') {
    const hours = Number(value)
    if (!isFinite(hours) || hours <= 0) throw new Error('Invalid relative deadline value')
    const ms = hours * 60 * 60 * 1000
    if (ms < MIN_RELATIVE_MS) throw new Error('Relative deadline is too short (minimum 1 minute)')
    if (ms > MAX_RELATIVE_MS) throw new Error('Relative deadline is too long (maximum 30 days)')
    return new Date(Date.now() + ms)
  }
  throw new Error('Invalid deadlineMode — must be "absolute" or "relative"')
}

// POST /api/interventions — Stage 1 of the two-step flow. Teacher publishes an ASK only:
// offered type options + deadline. No content required at this stage — the actual notes /
// link are sent later via POST /api/interventions/:id/deliver (Stage 2). Refuses unless the
// room has ended (interventions are explicitly post-session).
router.post('/', authorize('teacher'), async (req, res) => {
  try {
    const { questionId, offeredTypes, deadlineMode, deadlineValue } = req.body || {}
    if (!questionId) {
      return res.status(400).json({ error: 'Missing required field: questionId' })
    }
    // offeredTypes is optional — default to the full enum if not provided. If provided, every
    // entry must be a valid INTERVENTION_TYPES value.
    let offered
    if (Array.isArray(offeredTypes) && offeredTypes.length > 0) {
      const allValid = offeredTypes.every((t) => Object.values(INTERVENTION_TYPES).includes(t))
      if (!allValid) {
        return res.status(400).json({ error: `Invalid offeredTypes. Each must be one of: ${Object.values(INTERVENTION_TYPES).join(', ')}` })
      }
      offered = [...new Set(offeredTypes)]
    } else {
      offered = Object.values(INTERVENTION_TYPES)
    }

    const question = await Question.findById(questionId).lean()
    if (!question) return res.status(404).json({ error: 'Question not found' })

    const room = await Room.findById(question.roomId)
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized: only the room owner can publish interventions' })
    }
    if (!room.endedAt) {
      return res.status(400).json({ error: 'Interventions can only be published after the session has ended' })
    }

    let deadlineAt
    try {
      deadlineAt = resolveDeadline(deadlineMode, deadlineValue)
    } catch (e) {
      return res.status(400).json({ error: e.message })
    }

    // 3-day retention window is set up-front at ASK time too — the same TTL index drops the
    // row 3 days after creation if no content was ever delivered. Once Stage 2 fires we
    // RESET contentExpiresAt to a fresh 3 days from the deliver moment (see /:id/deliver).
    const contentExpiresAt = new Date(Date.now() + retentionWindowDays * 24 * 60 * 60 * 1000)

    // Application-level uniqueness per (question, teacher): if the teacher already published
    // an intervention for this question, replace it (the compound index on the model backs
    // this up). Re-asking after a prior deliver resets status back to 'asked' and clears
    // any prior content — the teacher is explicitly choosing to start over.
    const existing = await QuestionIntervention.findOne({ questionId, teacherId: req.user._id })
    let saved
    if (existing) {
      existing.status = INTERVENTION_STATUSES.ASKED
      existing.offeredTypes = offered
      existing.type = null
      existing.content = { text: '', url: '' }
      existing.deadlineAt = deadlineAt
      existing.contentExpiresAt = contentExpiresAt
      saved = await existing.save()
    } else {
      saved = await QuestionIntervention.create({
        questionId,
        roomId: question.roomId,
        teacherId: req.user._id,
        status: INTERVENTION_STATUSES.ASKED,
        offeredTypes: offered,
        deadlineAt,
        contentExpiresAt
      })
    }

    res.status(201).json({
      success: true,
      intervention: await serializeInterventionWithQuestion(saved)
    })
  } catch (error) {
    console.error('Error publishing intervention ask:', error)
    res.status(500).json({ error: 'Failed to publish intervention ask' })
  }
})

// POST /api/interventions/:id/deliver — Stage 2 of the two-step flow. Teacher sends the
// actual notes / link after reviewing aggregated response counts. Sets status='content_sent',
// refreshes the 3-day retention window from this moment, and attaches the teacher's chosen
// content type. Re-delivery on the same intervention resets contentExpiresAt to a fresh
// 3 days so the student window restarts.
router.post('/:id/deliver', authorize('teacher'), async (req, res) => {
  try {
    const { id } = req.params
    const { text, url, type } = req.body || {}
    const cleanText = (text || '').toString()
    const cleanUrl = (url || '').toString()
    if (!cleanText.trim() && !cleanUrl.trim()) {
      return res.status(400).json({ error: 'Content required: at least one of text or url' })
    }
    if (type != null && !Object.values(INTERVENTION_TYPES).includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${Object.values(INTERVENTION_TYPES).join(', ')}` })
    }

    const intervention = await QuestionIntervention.findById(id)
    if (!intervention) return res.status(404).json({ error: 'Intervention not found' })

    const room = await Room.findById(intervention.roomId)
    if (!room || room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized: only the room owner can deliver intervention content' })
    }

    intervention.content = { text: cleanText, url: cleanUrl }
    intervention.type = type || null
    intervention.status = INTERVENTION_STATUSES.CONTENT_SENT
    intervention.contentExpiresAt = new Date(Date.now() + retentionWindowDays * 24 * 60 * 60 * 1000)
    await intervention.save()

    res.status(201).json({
      success: true,
      intervention: await serializeInterventionWithQuestion(intervention)
    })
  } catch (error) {
    console.error('Error delivering intervention:', error)
    res.status(500).json({ error: 'Failed to deliver intervention content' })
  }
})

// GET /api/interventions/room/:roomId — student-facing fetch of interventions for a room.
// Filters out content where contentExpiresAt < now AND the student has not saved.
// Each intervention is enriched with `questionText` by looking up the linked Question —
// the model already stores questionId, no duplicate question data is stored here.
router.get('/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params
    const room = await Room.findById(roomId)
    if (!room) return res.status(404).json({ error: 'Room not found' })

    const isTeacherOwner = room.teacher.toString() === req.user._id.toString()
    const isStudentMember = !isTeacherOwner && !!(await RoomMember.findOne({ roomId, studentId: req.user._id }))
    if (!isTeacherOwner && !isStudentMember) {
      return res.status(403).json({ error: 'Not authorized to view interventions for this room' })
    }

    const interventions = await QuestionIntervention.find({ roomId }).sort({ createdAt: -1 }).lean()

    // Bulk lookup the question text for every intervention in this room — single round-trip
    // vs N point-lookups for large rooms with many interventions.
    const questionIds = [...new Set(interventions.map((i) => i.questionId?.toString()).filter(Boolean))]
    const questions = questionIds.length
      ? await Question.find({ _id: { $in: questionIds } }, { question: 1 }).lean()
      : []
    const questionTextById = new Map(questions.map((q) => [q._id.toString(), q.question]))

    // For students, look up their saved/response status in one batched query.
    let responseByIntervention = new Map()
    if (!isTeacherOwner) {
      const ids = interventions.map((i) => i._id)
      const responses = await InterventionResponse.find({ interventionId: { $in: ids }, studentId: req.user._id }).lean()
      responseByIntervention = new Map(responses.map((r) => [r.interventionId.toString(), r]))
    }

    const now = Date.now()
    const payload = interventions
      .filter((i) => isTeacherOwner || isContentVisible(i, now))
      .map((i) => serializeInterventionForStudent(
        i,
        responseByIntervention.get(i._id.toString()),
        now,
        { isTeacher: isTeacherOwner, questionText: questionTextById.get(i.questionId?.toString()) || null }
      ))

    res.json({ success: true, interventions: payload })
  } catch (error) {
    console.error('Error fetching interventions:', error)
    res.status(500).json({ error: 'Failed to fetch interventions' })
  }
})

// GET /api/interventions/question/:questionId — convenience: single-question variant.
// Also enriches with questionText via the linked question's own `question` field.
router.get('/question/:questionId', async (req, res) => {
  try {
    const { questionId } = req.params
    const question = await Question.findById(questionId).lean()
    if (!question) return res.status(404).json({ error: 'Question not found' })

    const room = await Room.findById(question.roomId)
    if (!room) return res.status(404).json({ error: 'Room not found' })

    const isTeacherOwner = room.teacher.toString() === req.user._id.toString()
    const isStudentMember = !isTeacherOwner && !!(await RoomMember.findOne({ roomId: question.roomId, studentId: req.user._id }))
    if (!isTeacherOwner && !isStudentMember) {
      return res.status(403).json({ error: 'Not authorized to view interventions for this question' })
    }

    const intervention = await QuestionIntervention.findOne({ questionId }).sort({ createdAt: -1 }).lean()
    if (!intervention) return res.json({ success: true, intervention: null })

    let studentResponse = null
    if (!isTeacherOwner) {
      studentResponse = await InterventionResponse.findOne({ interventionId: intervention._id, studentId: req.user._id }).lean()
    }

    const now = Date.now()
    if (!isTeacherOwner && !isContentVisible(intervention, now)) {
      return res.json({ success: true, intervention: null })
    }

    res.json({
      success: true,
      intervention: serializeInterventionForStudent(intervention, studentResponse, now, {
        isTeacher: isTeacherOwner,
        questionText: question?.question || null
      })
    })
  } catch (error) {
    console.error('Error fetching question intervention:', error)
    res.status(500).json({ error: 'Failed to fetch intervention' })
  }
})

// POST /api/interventions/:id/respond — student submits their chosen intervention type.
router.post('/:id/respond', authorize('student'), async (req, res) => {
  try {
    const { id } = req.params
    const { selectedType } = req.body || {}
    if (!selectedType || !Object.values(INTERVENTION_TYPES).includes(selectedType)) {
      return res.status(400).json({ error: 'Missing or invalid selectedType' })
    }

    const intervention = await QuestionIntervention.findById(id)
    if (!intervention) return res.status(404).json({ error: 'Intervention not found' })

    // Authorization: student must be a RoomMember of this intervention's room.
    const isMember = await RoomMember.findOne({ roomId: intervention.roomId, studentId: req.user._id })
    if (!isMember) return res.status(403).json({ error: 'Not a member of this room' })

    // Deadline gate — same gate the brief requires in both backend (reject) and UI (hide form).
    if (intervention.deadlineAt.getTime() <= Date.now()) {
      return res.status(410).json({ error: 'Response deadline has passed' })
    }

    const response = await InterventionResponse.findOneAndUpdate(
      { interventionId: intervention._id, studentId: req.user._id },
      { $set: { selectedType }, $setOnInsert: { interventionId: intervention._id, studentId: req.user._id, savedAt: null } },
      { upsert: true, new: true }
    )
    res.status(201).json({ success: true, response: serializeResponse(response) })
  } catch (error) {
    console.error('Error submitting intervention response:', error)
    res.status(500).json({ error: 'Failed to submit response' })
  }
})

// POST /api/interventions/:id/save — student explicitly saves the intervention content.
// Sets savedAt on the student's response row (creates one if none exists — saving without
// responding is allowed per the brief).
router.post('/:id/save', authorize('student'), async (req, res) => {
  try {
    const { id } = req.params
    const intervention = await QuestionIntervention.findById(id)
    if (!intervention) return res.status(404).json({ error: 'Intervention not found' })

    const isMember = await RoomMember.findOne({ roomId: intervention.roomId, studentId: req.user._id })
    if (!isMember) return res.status(403).json({ error: 'Not a member of this room' })

    // Saving only makes sense while the content is still visible — but per the brief, an explicit
    // save must persist past the 3-day window. We allow save up to and including the deadline
    // (the content window); after content expires AND nothing was saved, there's nothing to save.
    if (intervention.contentExpiresAt.getTime() <= Date.now()) {
      return res.status(410).json({ error: 'Content has expired and was not saved in time' })
    }

    const response = await InterventionResponse.findOneAndUpdate(
      { interventionId: intervention._id, studentId: req.user._id },
      { $set: { savedAt: new Date() }, $setOnInsert: { interventionId: intervention._id, studentId: req.user._id, selectedType: null } },
      { upsert: true, new: true }
    )
    res.json({ success: true, response: serializeResponse(response) })
  } catch (error) {
    console.error('Error saving intervention:', error)
    res.status(500).json({ error: 'Failed to save intervention' })
  }
})

// GET /api/interventions/:id/analytics — teacher (room owner) views aggregated response counts.
// Also returns the linked question text so the teacher can identify which question this
// intervention's analytics are for when there are multiple interventions in the same room.
router.get('/:id/analytics', authorize('teacher'), async (req, res) => {
  try {
    const { id } = req.params
    const intervention = await QuestionIntervention.findById(id).lean()
    if (!intervention) return res.status(404).json({ error: 'Intervention not found' })

    const room = await Room.findById(intervention.roomId).lean()
    if (!room || room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized: only the room owner can view intervention analytics' })
    }

    const question = intervention.questionId
      ? await Question.findById(intervention.questionId, { question: 1 }).lean()
      : null

    const counts = await InterventionResponse.aggregate([
      { $match: { interventionId: intervention._id, selectedType: { $ne: null } } },
      { $group: { _id: '$selectedType', count: { $sum: 1 } } }
    ])

    const countsByType = {}
    for (const t of Object.values(INTERVENTION_TYPES)) countsByType[t] = 0
    let totalResponses = 0
    let topType = null
    let topCount = 0
    for (const c of counts) {
      countsByType[c._id] = c.count
      totalResponses += c.count
      if (c.count > topCount) { topCount = c.count; topType = c._id }
    }

    res.json({
      success: true,
      analytics: {
        interventionId: intervention._id,
        questionId: intervention.questionId,
        questionText: question?.question || null,
        status: intervention.status,
        type: intervention.type,
        deadlineAt: intervention.deadlineAt,
        totalResponses,
        topType,
        topCount,
        counts: countsByType,
        labels: INTERVENTION_TYPE_LABELS
      }
    })
  } catch (error) {
    console.error('Error fetching intervention analytics:', error)
    res.status(500).json({ error: 'Failed to fetch analytics' })
  }
})

// --- Helpers ---------------------------------------------------------------------------------

function isContentVisible(intervention, now) {
  // Visible only inside the 3-day retention window. Once contentExpiresAt is in the past,
  // the server-side copy is gone from the API — Mongo's TTL index (see model schema) deletes
  // the row itself; this inline check additionally hardens the sub-minute window between
  // expiry and the next TTL monitor pass.
  //
  // There is NO in-app persistence past expiry. The legacy `savedAt` flag used to extend
  // visibility for students who had saved the content, but under the current rule "save" is
  // a client-side file download — students who downloaded within the window keep a local copy
  // on their own device, which is outside the system's control.
  return intervention.contentExpiresAt.getTime() > now
}

// Helper for teacher-only endpoints — looks up the question text once and returns the
// teacher-shaped serializer. Keeps the call sites short.
async function serializeInterventionWithQuestion(doc) {
  const question = doc.questionId
    ? await Question.findById(doc.questionId, { question: 1 }).lean()
    : null
  return serializeIntervention(doc, { questionText: question?.question || null })
}

function serializeIntervention(doc, opts = {}) {
  const typeLabel = doc.type ? (INTERVENTION_TYPE_LABELS[doc.type] || doc.type) : null
  return {
    _id: doc._id,
    questionId: doc.questionId,
    questionText: opts.questionText ?? null,
    roomId: doc.roomId,
    teacherId: doc.teacherId,
    status: doc.status,
    statusLabel: doc.status === INTERVENTION_STATUSES.CONTENT_SENT ? 'Content sent' : 'Awaiting responses',
    offeredTypes: doc.offeredTypes,
    type: doc.type,
    typeLabel,
    content: doc.content,
    deadlineAt: doc.deadlineAt,
    contentExpiresAt: doc.contentExpiresAt,
    createdAt: doc.createdAt
  }
}

// Student-facing serializer: hides content once contentExpiresAt is in the past.
// Hides internal fields the student doesn't need.
function serializeInterventionForStudent(doc, studentResponse, now, opts = {}) {
  const isTeacher = opts.isTeacher === true
  const visible = isTeacher || isContentVisible(doc, now)
  // At ASK stage there is no chosen content type yet — show the offered options as the label.
  const typeLabel = doc.type
    ? (INTERVENTION_TYPE_LABELS[doc.type] || doc.type)
    : 'Awaiting teacher response'
  return {
    _id: doc._id,
    questionId: doc.questionId,
    questionText: opts.questionText ?? null,
    status: doc.status,
    statusLabel: doc.status === INTERVENTION_STATUSES.CONTENT_SENT ? 'Content sent' : 'Awaiting teacher response',
    offeredTypes: doc.offeredTypes,
    type: doc.type,
    typeLabel,
    content: visible ? doc.content : { text: '', url: '' },
    contentVisible: visible,
    deadlineAt: doc.deadlineAt,
    contentExpiresAt: doc.contentExpiresAt,
    createdAt: doc.createdAt,
    studentSelectedType: studentResponse?.selectedType || null
  }
}

function serializeResponse(doc) {
  if (!doc) return null
  return {
    _id: doc._id,
    interventionId: doc.interventionId,
    studentId: doc.studentId,
    selectedType: doc.selectedType,
    savedAt: doc.savedAt,
    createdAt: doc.createdAt
  }
}

export default router
