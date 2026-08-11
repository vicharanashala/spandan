// Research Session Export API — read-only, key-authenticated export of poll-session results for a
// fellow researcher to pull daily (cron) and join against another dataset by student email.
//
// Auth: X-Research-Key header must equal RESEARCH_API_KEY. This lane is intentionally separate from
// the teacher JWT — it reads across ALL teachers' rooms, but ONLY these read-only export routes.
//
// Data sharing: student identity is exported as the raw email so the researcher can join directly
// against their own dataset and display results back to students on their portal. This shares PII —
// it must be covered by the study's consent / data-sharing agreement. RESEARCH_API_KEY secures the lane.
//
// Incremental pull: ?since=<ISO endedAt cursor>. Returns ended sessions whose endedAt > since,
// oldest-first, plus a nextCursor. The caller stores nextCursor and passes it next run → no gaps,
// no dupes, self-healing if a run is missed.
//
// FORMAT: each session mirrors the teacher CSV download (GET /responses/room/:id/export). Both are
// built from the SAME source, resultsSnapshot.buildSnapshot(roomId), so the exported numbers match
// the teacher's download and the results page exactly. Per session we return:
//   - questions[]: the chronological question legend (Q1 = first asked), each with text, type,
//     response count and correct%  — the CSV's second block.
//   - students[]:  one row per student, with points, rank, correct "x/y", accuracy, and a per-question
//     answers map {Q1: 'correct'|'incorrect'|null}  — the CSV's first block, where the CSV's ✓/✗/blank
//     cells become 'correct'/'incorrect'/null (null = did not answer that question).
// This mirrors the CSV's STYLE, not its population. Unlike the teacher download (which lists only
// students who answered), we keep the research population = everyone who joined (roster) UNION anyone
// who answered: students who joined but never answered are kept as no-show rows (points 0, correct
// "0/0", accuracy null, rank null, all answers null) so the export accounts for every student in the
// room. Responders are ranked first (rank 1..N), no-shows follow.
import express from 'express'
import crypto from 'crypto'
import * as resultsSnapshot from '../services/resultsSnapshot.js'

const router = express.Router()

// Constant-time key check. Fail CLOSED: if RESEARCH_API_KEY is not configured the export lane
// is disabled entirely (503) — we never fall back to a guessable default, so a missing/blank env
// var can never leave the endpoint open. Comparison is constant-time via timingSafeEqual; the
// length guard is required because timingSafeEqual throws on unequal-length buffers.
function requireResearchKey(req, res, next) {
  const expected = process.env.RESEARCH_API_KEY || ''
  if (!expected) {
    console.error('[research] RESEARCH_API_KEY is not set — refusing all export requests (fail closed)')
    return res.status(503).json({ error: 'Research export is not configured' })
  }
  const gotBuf = Buffer.from(req.header('X-Research-Key') || '')
  const expBuf = Buffer.from(expected)
  if (gotBuf.length !== expBuf.length || !crypto.timingSafeEqual(gotBuf, expBuf)) {
    return res.status(401).json({ error: 'Invalid or missing X-Research-Key' })
  }
  next()
}

// GET /api/research/sessions
//   ?since=<ISO>            cursor on endedAt (default: beginning of time → everything)
//   &preset=evening         name ~ /Day N Evening Session/i OR ended in 20:00-21:59 IST
//   &namePattern=<regex>    custom case-insensitive name filter (ignored if preset=evening)
//   &limit=<n>              cap sessions per pull (default 200)
router.get('/sessions', requireResearchKey, async (req, res) => {
  try {
    const Room = (await import('../models/Room.js')).default
    const User = (await import('../models/User.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default

    const since = req.query.since ? new Date(req.query.since) : new Date(0)
    if (isNaN(since.getTime())) return res.status(400).json({ error: 'Invalid since (expect ISO date)' })
    const limit = Math.min(Number(req.query.limit) || 200, 1000)
    const preset = req.query.preset
    const namePattern = req.query.namePattern

    // Ended sessions past the cursor, oldest-first so the caller advances endedAt monotonically.
    const filter = { endedAt: { $ne: null, $gt: since } }
    if (preset === 'evening') {
      // Evening session = named "Day N Evening Session" OR ended in the 8-9pm IST window (hours
      // 20-21 Asia/Kolkata). Either signal qualifies, so other teachers' evening sessions are caught.
      filter.$or = [
        { name: { $regex: 'Day\\s*\\d+\\s*Evening Session', $options: 'i' } },
        { $expr: { $in: [{ $hour: { date: '$endedAt', timezone: 'Asia/Kolkata' } }, [20, 21]] } }
      ]
    } else if (namePattern) {
      filter.name = { $regex: namePattern, $options: 'i' }
    }

    const rooms = await Room.find(filter).sort({ endedAt: 1 }).limit(limit).lean()

    const sessions = []
    for (const room of rooms) {
      // Same snapshot the teacher CSV export uses → identical numbers.
      const { leaderboard, byStudent, stats } = await resultsSnapshot.buildSnapshot(String(room._id))

      // Question columns in chronological order (Q1 = first asked). Every byStudent array holds the
      // same approved-question set in newest-first order, so take one and reverse — exactly as the CSV.
      const anySid = Object.keys(byStudent)[0]
      const qCols = anySid ? [...byStudent[anySid]].reverse() : []
      const statsByQid = new Map((stats.questionStats || []).map((q) => [q.questionId, q]))

      const questions = qCols.map((qc, i) => {
        const s = statsByQid.get(qc._id)
        const correctPct = s && s.totalResponses
          ? Math.round((s.correctCount / s.totalResponses) * 100) : null
        return {
          col: `Q${i + 1}`,
          questionId: qc._id,
          text: qc.question,
          type: qc.type,
          responses: s ? s.totalResponses : 0,
          correctPct
        }
      })

      // Population = everyone who joined (roster) UNION anyone who answered. Responders come ranked
      // from the leaderboard; joined-but-silent students are kept as no-show rows (0/0) so the export
      // still accounts for every student in the room, not only those who answered (this is where we
      // deliberately diverge from the teacher CSV, which lists responders only).
      const roster = await RoomMember.find({ roomId: room._id }).select('studentId').lean()
      const responderById = new Map(leaderboard.map((e) => [String(e.studentId), e]))
      const ids = new Set(roster.map((m) => String(m.studentId)))
      leaderboard.forEach((e) => ids.add(String(e.studentId)))
      const idList = [...ids]

      const users = await User.find({ _id: { $in: idList } }).select('email name').lean()
      const userById = new Map(users.map((u) => [u._id.toString(), u]))

      const students = idList.map((sid) => {
        const u = userById.get(sid)
        const e = responderById.get(sid)
        if (!e) {
          // Joined but never answered — a no-show row.
          const answers = {}
          qCols.forEach((_qc, i) => { answers[`Q${i + 1}`] = null })
          return {
            rank: null,
            studentName: (u && u.name) || 'Unknown Student',
            studentEmail: (u && u.email) || null,
            points: 0,
            correct: '0/0',
            correctCount: 0,
            answered: 0,
            accuracy: null,
            answers
          }
        }
        const byQid = new Map((byStudent[sid] || []).map((q) => [q._id, q]))
        const answers = {}
        qCols.forEach((qc, i) => {
          const q = byQid.get(qc._id)
          answers[`Q${i + 1}`] = (!q || !q.answered) ? null : (q.isCorrect ? 'correct' : 'incorrect')
        })
        return {
          rank: e.rank,
          studentName: e.studentName,
          studentEmail: (u && u.email) || null,
          points: e.totalPoints,
          correct: `${e.correctCount}/${e.totalAnswered}`,
          correctCount: e.correctCount,
          answered: e.totalAnswered,
          accuracy: e.totalAnswered ? Number((e.correctCount / e.totalAnswered).toFixed(2)) : null,
          answers
        }
      })

      // Ranked responders first (rank 1..N), then no-shows (rank null) in roster order.
      students.sort((a, b) => (a.rank == null) - (b.rank == null) || (a.rank - b.rank))

      // maxPoints = sum of the exported polls' configured max points (same question set as the matrix).
      const maxPoints = qCols.reduce((sum, qc) => sum + (qc.maxPoints || 0), 0)

      sessions.push({
        roomId: String(room._id),
        name: room.name,
        date: room.endedAt ? new Date(room.endedAt).toISOString().slice(0, 10) : null,
        endedAt: room.endedAt,
        totalQuestions: qCols.length,
        maxPoints,
        questions,
        students
      })
    }

    // nextCursor = newest endedAt in this batch; the caller passes it back as ?since next run.
    const nextCursor = sessions.length ? sessions[sessions.length - 1].endedAt : (req.query.since || null)

    res.json({ count: sessions.length, nextCursor, sessions })
  } catch (error) {
    console.error('[research] sessions export failed:', error)
    res.status(500).json({ error: 'Failed to export sessions' })
  }
})

// GET /api/research/segment-difficulty
//
// Joins Transcript + Question + Response on (roomId, segmentIndex) to answer:
//   "Which part of the lecture did students understand the least?"
//
// Auth: same X-Research-Key lane as /sessions.
//
// Two modes:
//   Single-room:  ?roomId=<id>          → segment breakdown for one session
//   Bulk export:  ?since=<ISO>&limit=n  → all ended sessions past the cursor,
//                                         same pagination pattern as /sessions
//
// Each segment record:
//   segmentIndex      — 0-based chunk number (matches Transcript.segmentIndex)
//   transcriptSnippet — first 300 chars of the transcript text for that segment
//   transcriptText    — full transcript text (for keyword extraction in the script)
//   wordCount         — word count of the transcript for that segment
//   questionCount     — number of approved questions generated from this segment
//   responseCount     — total student responses across those questions
//   correctCount      — total correct responses
//   avgAccuracy       — correctCount / responseCount (null if no responses)
//   avgAccuracy_pct   — rounded percentage (null if no responses)
//
// Segments with a transcript but zero questions (teacher skipped generation)
// are included with questionCount=0, responseCount=0, avgAccuracy=null — so
// the caller can see the full lecture timeline, not just the tested parts.
router.get('/segment-difficulty', requireResearchKey, async (req, res) => {
  try {
    const Room       = (await import('../models/Room.js')).default
    const Transcript = (await import('../models/Transcript.js')).default
    const Question   = (await import('../models/Question.js')).default
    const Response   = (await import('../models/Response.js')).default

    // ── resolve the set of rooms to analyse ──────────────────────────────────
    let rooms = []
    if (req.query.roomId) {
      // Single-room mode
      const room = await Room.findById(req.query.roomId).lean()
      if (!room) return res.status(404).json({ error: 'Room not found' })
      rooms = [room]
    } else {
      // Bulk mode: ended sessions past the cursor, oldest-first
      const since = req.query.since ? new Date(req.query.since) : new Date(0)
      if (isNaN(since.getTime())) return res.status(400).json({ error: 'Invalid since (expect ISO date)' })
      const limit = Math.min(Number(req.query.limit) || 50, 200)
      rooms = await Room.find({ endedAt: { $ne: null, $gt: since } })
        .sort({ endedAt: 1 })
        .limit(limit)
        .lean()
    }

    const sessions = []

    for (const room of rooms) {
      const roomId = room._id

      // 1. All transcript segments for this room, sorted by segmentIndex
      const transcripts = await Transcript.find({ roomId })
        .sort({ segmentIndex: 1 })
        .lean()

      // 2. All approved questions for this room, indexed by segmentIndex
      const questions = await Question.find({ roomId, status: 'approved' })
        .select('_id segmentIndex')
        .lean()

      // Build a map: segmentIndex → [questionId, ...]
      const qBySegment = new Map()
      for (const q of questions) {
        const si = q.segmentIndex ?? -1
        if (!qBySegment.has(si)) qBySegment.set(si, [])
        qBySegment.get(si).push(String(q._id))
      }

      // 3. All responses for those questions — one batch query
      const allQIds = questions.map(q => q._id)
      const responses = allQIds.length > 0
        ? await Response.find({ questionId: { $in: allQIds } })
            .select('questionId isCorrect')
            .lean()
        : []

      // Index responses by questionId for O(1) lookup
      const responsesByQId = new Map()
      for (const r of responses) {
        const key = String(r.questionId)
        if (!responsesByQId.has(key)) responsesByQId.set(key, [])
        responsesByQId.get(key).push(r)
      }

      // 4. Build per-segment records
      const segments = transcripts.map(t => {
        const si        = t.segmentIndex
        const qIds      = qBySegment.get(si) || []
        const segResps  = qIds.flatMap(qid => responsesByQId.get(qid) || [])
        const total     = segResps.length
        const correct   = segResps.filter(r => r.isCorrect).length
        const accuracy  = total > 0 ? correct / total : null

        return {
          segmentIndex:      si,
          transcriptSnippet: t.text ? t.text.slice(0, 300) : '',
          transcriptText:    t.text || '',
          wordCount:         t.wordCount || (t.text ? t.text.trim().split(/\s+/).length : 0),
          duration:          t.duration || 0,
          questionCount:     qIds.length,
          responseCount:     total,
          correctCount:      correct,
          avgAccuracy:       accuracy !== null ? Number(accuracy.toFixed(4)) : null,
          avgAccuracy_pct:   accuracy !== null ? Number((accuracy * 100).toFixed(1)) : null
        }
      })

      sessions.push({
        roomId:      String(roomId),
        roomName:    room.name,
        date:        room.endedAt ? new Date(room.endedAt).toISOString().slice(0, 10) : null,
        endedAt:     room.endedAt,
        totalSegments:    segments.length,
        testedSegments:   segments.filter(s => s.questionCount > 0).length,
        hardestSegment:   segments.reduce((worst, s) => {
          if (s.avgAccuracy === null) return worst
          if (worst === null || s.avgAccuracy < worst.avgAccuracy) return s
          return worst
        }, null),
        segments
      })
    }

    // Cursor for bulk mode
    const nextCursor = !req.query.roomId && sessions.length
      ? sessions[sessions.length - 1].endedAt
      : null

    // Single-room returns the session object directly; bulk wraps in array
    if (req.query.roomId) {
      return res.json(sessions[0] || {})
    }
    res.json({ count: sessions.length, nextCursor, sessions })

  } catch (error) {
    console.error('[research] segment-difficulty failed:', error)
    res.status(500).json({ error: 'Failed to compute segment difficulty' })
  }
})

export default router

