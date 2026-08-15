// Routes for the Teacher Evaluation Profiles feature.
//
// Endpoints (all teacher-only, all behind the global authenticate middleware):
//   GET    /api/evaluation-profiles/criteria            -- list available criteria (metadata)
//   GET    /api/evaluation-profiles                     -- list own profiles
//   POST   /api/evaluation-profiles                     -- create
//   PUT    /api/evaluation-profiles/:id                -- update
//   DELETE /api/evaluation-profiles/:id                -- delete
//   POST   /api/evaluation-profiles/:id/duplicate      -- copy a profile (return new doc)
//   POST   /api/evaluation-profiles/:id/preview/:roomId -- run on a room, return scores (no save)
//   POST   /api/evaluation-profiles/:id/apply/:roomId    -- run on a room, return scores (same path as preview)
//
// "preview" and "apply" intentionally share the same code path
// (computeScoresForRoom in services/evaluationService.js) so the numbers can never
// diverge — the brief mandates this.

import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import EvaluationProfile from '../models/EvaluationProfile.js'
import Room from '../models/Room.js'
import { CRITERIA } from '../services/evaluationCriteria.js'
import { computeScoresForRoom, validateProfileWeights } from '../services/evaluationService.js'

const router = express.Router()

router.use(authenticate)

// GET /criteria — exposed to any authenticated user (the student-side app never queries it,
// but the teacher-only write endpoints use the same list to validate). Public to students so a
// future read-side view (if added) can show what criteria exist without bypassing the registry.
router.get('/criteria', (req, res) => {
  res.json({ success: true, criteria: CRITERIA })
})

function sanitizeString(s, max) {
  if (s == null) return ''
  return String(s).trim().slice(0, max)
}

async function loadOwnProfile(id, userId) {
  const profile = await EvaluationProfile.findById(id)
  if (!profile) return { error: { status: 404, body: { error: 'Profile not found' } } }
  if (profile.teacherId.toString() !== userId.toString()) {
    return { error: { status: 403, body: { error: 'Not authorized: profile belongs to a different teacher' } } }
  }
  return { profile }
}

function serializeProfile(doc) {
  return {
    _id: doc._id,
    name: doc.name,
    description: doc.description,
    criteria: doc.criteria,
    teacherId: doc.teacherId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  }
}

// GET /api/evaluation-profiles — list own profiles (newest first)
router.get('/', authorize('teacher'), async (req, res) => {
  try {
    const profiles = await EvaluationProfile.find({ teacherId: req.user._id }).sort({ createdAt: -1 }).lean()
    res.json({ success: true, profiles: profiles.map(serializeProfile) })
  } catch (e) {
    console.error('Error listing evaluation profiles:', e)
    res.status(500).json({ success: false, error: 'Failed to list profiles' })
  }
})

// POST /api/evaluation-profiles — create
router.post('/', authorize('teacher'), async (req, res) => {
  try {
    const name = sanitizeString(req.body?.name, 100)
    const description = sanitizeString(req.body?.description, 500)
    const criteria = Array.isArray(req.body?.criteria) ? req.body.criteria : []

    if (!name) return res.status(400).json({ error: 'Name is required' })
    const validation = validateProfileWeights(criteria)
    if (!validation.ok) return res.status(400).json({ error: validation.error })

    const created = await EvaluationProfile.create({
      teacherId: req.user._id,
      name,
      description,
      criteria: criteria.map((c) => ({
        key: c.key,
        weight: Number(c.weight),
        penalty: c.key === 'incorrect_responses' && c.penalty != null ? Number(c.penalty) : 0
      }))
    })
    res.status(201).json({ success: true, profile: serializeProfile(created) })
  } catch (e) {
    if (e?.name === 'ValidationError') return res.status(400).json({ error: e.message })
    console.error('Error creating evaluation profile:', e)
    res.status(500).json({ error: 'Failed to create profile' })
  }
})

// PUT /api/evaluation-profiles/:id — update
router.put('/:id', authorize('teacher'), async (req, res) => {
  try {
    const { profile, error } = await loadOwnProfile(req.params.id, req.user._id)
    if (error) return res.status(error.status).json(error.body)

    const name = sanitizeString(req.body?.name, 100)
    const description = sanitizeString(req.body?.description, 500)
    const criteria = Array.isArray(req.body?.criteria) ? req.body.criteria : null

    if (!name) return res.status(400).json({ error: 'Name is required' })
    if (criteria != null) {
      const validation = validateProfileWeights(criteria)
      if (!validation.ok) return res.status(400).json({ error: validation.error })
      profile.criteria = criteria.map((c) => ({
        key: c.key,
        weight: Number(c.weight),
        penalty: c.key === 'incorrect_responses' && c.penalty != null ? Number(c.penalty) : 0
      }))
    }
    profile.name = name
    profile.description = description
    await profile.save()
    res.json({ success: true, profile: serializeProfile(profile) })
  } catch (e) {
    if (e?.name === 'ValidationError') return res.status(400).json({ error: e.message })
    console.error('Error updating evaluation profile:', e)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

// DELETE /api/evaluation-profiles/:id
router.delete('/:id', authorize('teacher'), async (req, res) => {
  try {
    const { profile, error } = await loadOwnProfile(req.params.id, req.user._id)
    if (error) return res.status(error.status).json(error.body)
    await profile.deleteOne()
    res.json({ success: true })
  } catch (e) {
    console.error('Error deleting evaluation profile:', e)
    res.status(500).json({ error: 'Failed to delete profile' })
  }
})

// POST /api/evaluation-profiles/:id/duplicate — copy own profile (caller can edit & save-as-new)
router.post('/:id/duplicate', authorize('teacher'), async (req, res) => {
  try {
    const { profile, error } = await loadOwnProfile(req.params.id, req.user._id)
    if (error) return res.status(error.status).json(error.body)
    const created = await EvaluationProfile.create({
      teacherId: req.user._id,
      name: `${profile.name} (copy)`,
      description: profile.description,
      criteria: profile.criteria
    })
    res.status(201).json({ success: true, profile: serializeProfile(created) })
  } catch (e) {
    console.error('Error duplicating evaluation profile:', e)
    res.status(500).json({ error: 'Failed to duplicate profile' })
  }
})

// helper: preview + apply share the exact same code path
async function runOnRoom(req, res) {
  const { profile, error } = await loadOwnProfile(req.params.id, req.user._id)
  if (error) return res.status(error.status).json(error.body)

  const { roomId } = req.params
  if (!roomId) return res.status(400).json({ error: 'roomId is required' })
  const room = await Room.findById(roomId)
  if (!room) return res.status(404).json({ error: 'Room not found' })
  if (room.teacher.toString() !== req.user._id.toString()) {
    return res.status(403).json({ error: 'Not authorized: only the room owner can apply profiles' })
  }

  const validation = validateProfileWeights(profile.criteria)
  if (!validation.ok) return res.status(400).json({ error: validation.error })

  try {
    const result = await computeScoresForRoom(roomId, profile)
    res.json({
      success: true,
      result: {
        ...result,
        roomName: room.name,
        roomCode: room.code,
        createdAt: room.createdAt,
        endedAt: room.endedAt
      }
    })
  } catch (e) {
    console.error('Error computing evaluation scores:', e)
    res.status(500).json({ error: e.message || 'Failed to compute scores' })
  }
}

// helper: preview + apply for multiple rooms
async function runOnRooms(req, res) {
  const { profile, error } = await loadOwnProfile(req.params.id, req.user._id)
  if (error) return res.status(error.status).json(error.body)

  const roomIds = req.body?.roomIds
  if (!roomIds || !Array.isArray(roomIds) || roomIds.length === 0) {
    return res.status(400).json({ error: 'roomIds array is required' })
  }

  // Validate that the teacher owns every room
  const rooms = await Room.find({ _id: { $in: roomIds } })
  if (rooms.length !== roomIds.length) {
    return res.status(404).json({ error: 'One or more rooms not found' })
  }

  for (const room of rooms) {
    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: `Not authorized: you do not own room ${room.name}` })
    }
  }

  const validation = validateProfileWeights(profile.criteria)
  if (!validation.ok) return res.status(400).json({ error: validation.error })

  try {
    const results = {}
    const roomsData = []

    for (const room of rooms) {
      const scoreResult = await computeScoresForRoom(room._id, profile)
      roomsData.push({ room, scoreResult })
      results[room._id.toString()] = {
        ...scoreResult,
        roomName: room.name,
        roomCode: room.code,
        createdAt: room.createdAt,
        endedAt: room.endedAt
      }
    }

    // Perform multi-room aggregation
    // 1. Gather all student IDs and names
    const studentMap = new Map() // studentId -> { name, rooms: [] }
    for (const { scoreResult } of roomsData) {
      for (const s of scoreResult.scores) {
        if (!studentMap.has(s.studentId)) {
          studentMap.set(s.studentId, { name: s.studentName, rooms: [] })
        }
        studentMap.get(s.studentId).rooms.push(s)
      }
    }

    // 2. Compute average for each parameter for each student
    const aggregatedScores = []
    const criterionKeys = profile.criteria.map(c => c.key)

    for (const [studentId, info] of studentMap.entries()) {
      const breakdown = {}
      let responded = false
      const presentCount = info.rooms.length

      for (const key of criterionKeys) {
        let sum = 0
        for (const s of info.rooms) {
          if (s.breakdown && s.breakdown[key] !== undefined) {
            sum += s.breakdown[key]
          }
          if (s.responded) responded = true
        }
        // Average all parameters across all selected rooms (total count = rooms.length)
        breakdown[key] = Number((sum / rooms.length).toFixed(4))
      }

      // Apply the existing profile weightages and penalty to compute final average score
      let weightedSum = 0
      let penaltyValue = 0
      for (const c of profile.criteria) {
        weightedSum += (breakdown[c.key] || 0) * c.weight
        if (c.key === 'incorrect_responses' && c.penalty > 0) {
          penaltyValue = (breakdown[c.key] || 0) * c.penalty
        }
      }
      const finalScore = Math.max(0, Math.min(1, Number((weightedSum - penaltyValue).toFixed(4))))

      aggregatedScores.push({
        studentId,
        studentName: info.name,
        score: finalScore,
        breakdown,
        responded,
        presentCount
      })
    }

    // Sort aggregated scores by score desc, then by studentName asc
    aggregatedScores.sort((a, b) => (b.score - a.score) || a.studentName.localeCompare(b.studentName))

    results['aggregated'] = {
      roomName: 'Aggregated Results',
      roomCode: 'MULTI',
      scores: aggregatedScores,
      criterionKeys,
      totalQuestions: roomsData.reduce((sum, r) => sum + r.scoreResult.totalQuestions, 0),
      totalJoined: studentMap.size,
      totalScored: aggregatedScores.length,
      roomIdsCount: rooms.length
    }

    res.json({ success: true, results, isMulti: true })
  } catch (e) {
    console.error('Error running evaluation on multiple rooms:', e)
    res.status(500).json({ error: e.message || 'Failed to run evaluation' })
  }
}

router.post('/:id/preview/:roomId', authorize('teacher'), runOnRoom)
router.post('/:id/apply/:roomId', authorize('teacher'), runOnRoom)
router.post('/:id/preview', authorize('teacher'), runOnRooms)
router.post('/:id/apply', authorize('teacher'), runOnRooms)

export default router