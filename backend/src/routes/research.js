// Research Session Export API — read-only, key-authenticated export of poll-session results for a
// fellow researcher to pull daily (cron) and join against another dataset by (hashed) student email.
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
// "Poll" = a question that received >=1 response (the only persisted proof a question was actually
// launched to and answered by students; approved-but-unlaunched questions are correctly excluded).
import express from 'express'
import crypto from 'crypto'

const router = express.Router()

// Simple constant-time-ish key check.
function requireResearchKey(req, res, next) {
  const expected = process.env.RESEARCH_API_KEY || 'local-dev-research-key'
  const got = req.header('X-Research-Key') || ''
  if (!expected || got.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
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
    const Question = (await import('../models/Question.js')).default
    const Response = (await import('../models/Response.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default
    const User = (await import('../models/User.js')).default

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
      const roomId = room._id

      // Per-student points + answered count, and the set of launched polls (questionIds w/ >=1 response).
      const [respAgg, launchedQ, members] = await Promise.all([
        Response.aggregate([
          { $match: { roomId } },
          { $group: { _id: '$studentId', pointsEarned: { $sum: '$points' }, questionsAnswered: { $sum: 1 } } }
        ]),
        Response.distinct('questionId', { roomId }),
        RoomMember.find({ roomId }).select('studentId').lean()
      ])

      // maxPoints = sum of the launched polls' configured max points.
      const launchedQuestions = await Question.find({ _id: { $in: launchedQ } }).select('points').lean()
      const maxPoints = launchedQuestions.reduce((s, q) => s + (q.points || 0), 0)

      const byStudent = new Map(respAgg.map(r => [String(r._id), r]))

      // Population = all joined (roster) UNION anyone who answered (safety, in case of stray responses).
      const ids = new Set(members.map(m => String(m.studentId)))
      byStudent.forEach((_v, k) => ids.add(k))
      const idList = [...ids]

      const users = await User.find({ _id: { $in: idList } }).select('email').lean()
      const emailById = new Map(users.map(u => [String(u._id), u.email]))

      const students = idList.map(sid => {
        const s = byStudent.get(sid)
        return {
          studentEmail: emailById.get(sid) || null,
          pointsEarned: s ? s.pointsEarned : 0,
          questionsAnswered: s ? s.questionsAnswered : 0
        }
      })

      sessions.push({
        roomId: String(roomId),
        name: room.name,
        date: room.endedAt ? new Date(room.endedAt).toISOString().slice(0, 10) : null,
        endedAt: room.endedAt,
        totalQuestions: launchedQ.length,
        maxPoints,
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

export default router
