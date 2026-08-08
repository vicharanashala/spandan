
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
// Incremental pull: ?since=. Returns ended sessions whose endedAt > since,
// oldest-first, plus a nextCursor. The caller stores nextCursor and passes it next run → no gaps,
// no dupes, self-healing if a run is missed.
//
// "Poll" = a question that received >=1 response.
import express from 'express'
import crypto from 'crypto'
import mongoose from 'mongoose'

const router = express.Router()

// Simple constant-time key check.
function requireResearchKey(req, res, next) {
  const expected = process.env.RESEARCH_API_KEY || 'local-dev-research-key'
  const got = req.header('X-Research-Key') || ''

  if (
    !expected ||
    got.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))
  ) {
    return res.status(401).json({
      error: 'Invalid or missing X-Research-Key'
    })
  }

  next()
}

// -----------------------------------------------------------------------------
// GET /api/research/sessions
//
// Query params:
//   ?since=
//   ?preset=evening
//   ?namePattern=
//   ?limit=
// -----------------------------------------------------------------------------
router.get('/sessions', requireResearchKey, async (req, res) => {
  try {
    const Room = (await import('../models/Room.js')).default
    const Question = (await import('../models/Question.js')).default
    const Response = (await import('../models/Response.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default
    const User = (await import('../models/User.js')).default

    const since = req.query.since
      ? new Date(req.query.since)
      : new Date(0)

    if (isNaN(since.getTime())) {
      return res.status(400).json({
        error: 'Invalid since (expect ISO date)'
      })
    }

    const limit = Math.min(
      Number(req.query.limit) || 200,
      1000
    )

    const preset = req.query.preset
    const namePattern = req.query.namePattern

    // Ended sessions past the cursor, oldest-first so the caller advances
    // endedAt monotonically.
    const filter = {
      endedAt: {
        $ne: null,
        $gt: since
      }
    }

    if (preset === 'evening') {
      // Evening session = named "Day N Evening Session" OR ended in the
      // 8-9pm IST window.
      filter.$or = [
        {
          name: {
            $regex: 'Day\\s*\\d+\\s*Evening Session',
            $options: 'i'
          }
        },
        {
          $expr: {
            $in: [
              {
                $hour: {
                  date: '$endedAt',
                  timezone: 'Asia/Kolkata'
                }
              },
              [20, 21]
            ]
          }
        }
      ]
    } else if (namePattern) {
      filter.name = {
        $regex: namePattern,
        $options: 'i'
      }
    }

    const rooms = await Room.find(filter)
      .sort({ endedAt: 1 })
      .limit(limit)
      .lean()

    const sessions = []

    for (const room of rooms) {
      const roomId = room._id

      // Per-student points + answered count, and the set of launched polls.
      const [
        respAgg,
        launchedQ,
        members
      ] = await Promise.all([
        Response.aggregate([
          {
            $match: {
              roomId
            }
          },
          {
            $group: {
              _id: '$studentId',
              pointsEarned: {
                $sum: '$points'
              },
              questionsAnswered: {
                $sum: 1
              }
            }
          }
        ]),

        Response.distinct('questionId', {
          roomId
        }),

        RoomMember.find({
          roomId
        })
          .select('studentId')
          .lean()
      ])

      // maxPoints = sum of launched polls' configured max points.
      const launchedQuestions = await Question.find({
        _id: {
          $in: launchedQ
        }
      })
        .select('points')
        .lean()

      const maxPoints = launchedQuestions.reduce(
        (sum, question) => sum + (question.points || 0),
        0
      )

      const byStudent = new Map(
        respAgg.map(response => [
          String(response._id),
          response
        ])
      )

      // Population = all joined students UNION anyone who answered.
      const ids = new Set(
        members.map(member => String(member.studentId))
      )

      byStudent.forEach((_value, key) => {
        ids.add(key)
      })

      const idList = [...ids]

      const users = await User.find({
        _id: {
          $in: idList
        }
      })
        .select('email')
        .lean()

      const emailById = new Map(
        users.map(user => [
          String(user._id),
          user.email
        ])
      )

      const students = idList.map(studentId => {
        const student = byStudent.get(studentId)

        return {
          studentEmail:
            emailById.get(studentId) || null,

          pointsEarned:
            student
              ? student.pointsEarned
              : 0,

          questionsAnswered:
            student
              ? student.questionsAnswered
              : 0
        }
      })

      sessions.push({
        roomId: String(roomId),
        name: room.name,

        date: room.endedAt
          ? new Date(room.endedAt)
              .toISOString()
              .slice(0, 10)
          : null,

        endedAt: room.endedAt,

        totalQuestions: launchedQ.length,

        maxPoints,

        students
      })
    }

    const nextCursor = sessions.length
      ? sessions[sessions.length - 1].endedAt
      : (req.query.since || null)

    return res.json({
      count: sessions.length,
      nextCursor,
      sessions
    })
  } catch (error) {
    console.error(
      '[research] sessions export failed:',
      error
    )

    return res.status(500).json({
      error: 'Failed to export sessions'
    })
  }
})

// -----------------------------------------------------------------------------
// GET /api/research/segment-difficulty
//
// Issue #114 — Lecture Segment Difficulty Heatmap
//
// Query:
//   ?roomId=<MongoDB Room ID>
//
// The endpoint joins:
//
//   Response -> Question.segmentIndex -> Transcript.segmentIndex
//
// and calculates accuracy for every lecture segment.
//
// Response example:
//
// {
//   roomId: "...",
//   roomName: "Day 3 Evening Session",
//   segments: [
//     {
//       segmentIndex: 0,
//       transcriptText: "...",
//       wordCount: 180,
//       questionCount: 2,
//       responseCount: 45,
//       avgAccuracy: 0.82,
//       avgAccuracy_pct: 82
//     }
//   ]
// }
// -----------------------------------------------------------------------------
router.get(
  '/segment-difficulty',
  requireResearchKey,
  async (req, res) => {
    try {
      const { roomId } = req.query

      // roomId is required.
      if (!roomId) {
        return res.status(400).json({
          error: 'roomId query parameter is required'
        })
      }

      // Validate MongoDB ObjectId before querying.
      if (!mongoose.Types.ObjectId.isValid(roomId)) {
        return res.status(400).json({
          error: 'Invalid roomId'
        })
      }

      const Room = (await import('../models/Room.js')).default
      const Question = (await import('../models/Question.js')).default
      const Response = (await import('../models/Response.js')).default
      const Transcript = (await import('../models/Transcript.js')).default

      const roomObjectId = new mongoose.Types.ObjectId(roomId)

      // Fetch the room first so we can return a useful room name.
      const room = await Room.findById(roomObjectId)
        .select('name')
        .lean()

      if (!room) {
        return res.status(404).json({
          error: 'Room not found'
        })
      }

      // -----------------------------------------------------------------------
      // Batch queries
      //
      // These are the only three data queries needed for the analysis:
      //
      // 1. Questions belonging to this room
      // 2. Responses belonging to this room
      // 3. Transcript segments belonging to this room
      //
      // No query is performed inside the segment loop.
      // -----------------------------------------------------------------------
      const [
        questions,
        responses,
        transcripts
      ] = await Promise.all([
        Question.find({
          roomId: roomObjectId
        })
          .select('_id segmentIndex')
          .lean(),

        Response.find({
          roomId: roomObjectId
        })
          .select('questionId isCorrect')
          .lean(),

        Transcript.find({
          roomId: roomObjectId
        })
          .select('segmentIndex text transcript content')
          .sort({ segmentIndex: 1 })
          .lean()
      ])

      // -----------------------------------------------------------------------
      // Question lookup
      //
      // questionId -> segmentIndex
      // -----------------------------------------------------------------------
      const questionToSegment = new Map()

      for (const question of questions) {
        if (
          question.segmentIndex !== undefined &&
          question.segmentIndex !== null
        ) {
          questionToSegment.set(
            String(question._id),
            Number(question.segmentIndex)
          )
        }
      }

      // -----------------------------------------------------------------------
      // Transcript lookup
      //
      // segmentIndex -> transcript text
      //
      // The fallback fields make this endpoint tolerant if the transcript
      // model stores its text as text, transcript, or content.
      // -----------------------------------------------------------------------
      const transcriptBySegment = new Map()

      for (const transcript of transcripts) {
        if (
          transcript.segmentIndex === undefined ||
          transcript.segmentIndex === null
        ) {
          continue
        }

        const text =
          transcript.text ||
          transcript.transcript ||
          transcript.content ||
          ''

        transcriptBySegment.set(
          Number(transcript.segmentIndex),
          String(text)
        )
      }

      // -----------------------------------------------------------------------
      // Segment statistics
      //
      // Each segment contains:
      //   questionIds
      //   responseCount
      //   correctResponses
      // -----------------------------------------------------------------------
      const segmentStats = new Map()

      const getSegment = segmentIndex => {
        if (!segmentStats.has(segmentIndex)) {
          segmentStats.set(segmentIndex, {
            segmentIndex,
            questionIds: new Set(),
            responseCount: 0,
            correctResponses: 0
          })
        }

        return segmentStats.get(segmentIndex)
      }

      // First register all questions so segments with questions but no
      // responses can still be represented.
      for (const question of questions) {
        if (
          question.segmentIndex === undefined ||
          question.segmentIndex === null
        ) {
          continue
        }

        const segmentIndex = Number(
          question.segmentIndex
        )

        const segment = getSegment(segmentIndex)

        segment.questionIds.add(
          String(question._id)
        )
      }

      // Attach every response to the segment of its question.
      for (const response of responses) {
        const segmentIndex =
          questionToSegment.get(
            String(response.questionId)
          )

        // Ignore responses whose question has no segmentIndex.
        if (
          segmentIndex === undefined ||
          segmentIndex === null
        ) {
          continue
        }

        const segment = getSegment(segmentIndex)

        segment.responseCount += 1

        if (response.isCorrect === true) {
          segment.correctResponses += 1
        }
      }

      // -----------------------------------------------------------------------
      // Build final API response.
      // -----------------------------------------------------------------------
      const segments = [...segmentStats.values()]
        .sort(
          (a, b) =>
            a.segmentIndex - b.segmentIndex
        )
        .map(segment => {
          const transcriptText =
            transcriptBySegment.get(
              segment.segmentIndex
            ) || ''

          const wordCount = transcriptText
            .trim()
            ? transcriptText
                .trim()
                .split(/\s+/)
                .length
            : 0

          const avgAccuracy =
            segment.responseCount > 0
              ? segment.correctResponses /
                segment.responseCount
              : 0

          return {
            segmentIndex:
              segment.segmentIndex,

            transcriptText,

            wordCount,

            questionCount:
              segment.questionIds.size,

            responseCount:
              segment.responseCount,

            avgAccuracy,

            avgAccuracy_pct:
              Number(
                (avgAccuracy * 100).toFixed(2)
              )
          }
        })

      return res.json({
        roomId: String(roomObjectId),

        roomName:
          room.name || null,

        segments
      })
    } catch (error) {
      console.error(
        '[research] segment difficulty analysis failed:',
        error
      )

      return res.status(500).json({
        error:
          'Failed to calculate segment difficulty'
      })
    }
  }
)

export default router
