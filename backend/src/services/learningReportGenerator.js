import Response from '../models/Response.js'
import Question from '../models/Question.js'
import Transcript from '../models/Transcript.js'
import Room from '../models/Room.js'
import LearningReport from '../models/LearningReport.js'

import { calculateStudentMetrics } from './learningReportService.js'
import { generateLearningReportAI } from './learningReportAIService.js'

export async function generateStudentLearningReport(
  roomId,
  studentId,
  provider = 'minimax'
) {
  // The report belongs to a completed session.
  const room = await Room.findById(roomId).lean()

  if (!room) {
    throw new Error('Room not found')
  }

  if (!room.endedAt) {
    throw new Error('Learning report is available only after the session ends')
  }

  const [responses, questions, transcripts, metrics] = await Promise.all([
    Response.find({ roomId, studentId }).lean(),
    Question.find({ roomId, status: 'approved' })
      .sort({ segmentIndex: 1, createdAt: 1 })
      .lean(),
    Transcript.find({ roomId })
      .sort({ segmentIndex: 1, createdAt: 1 })
      .lean(),
    calculateStudentMetrics(roomId, studentId)
  ])

  const transcriptText = transcripts
    .map(item => item.text)
    .filter(Boolean)
    .join('\n\n')

  const aiAnalysis = await generateLearningReportAI({
    metrics,
    responses,
    questions,
    transcript: transcriptText,
    provider
  })

  const report = await LearningReport.findOneAndUpdate(
    { roomId, studentId },
    {
      roomId,
      studentId,
      metrics,
      aiAnalysis,
      status: 'completed',
      error: ''
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  )

  return report
}


export async function generateRoomLearningReports(
  roomId,
  provider = 'minimax'
) {
  const RoomMember = (await import('../models/RoomMember.js')).default

  const members = await RoomMember.find({ roomId })
    .select('studentId')
    .lean()

  if (members.length === 0) {
    return []
  }

  const results = await Promise.allSettled(
    members.map(({ studentId }) =>
      generateStudentLearningReport(roomId, studentId, provider)
    )
  )

  const successful = results.filter(
    result => result.status === 'fulfilled'
  )

  const failed = results.filter(
    result => result.status === 'rejected'
  )

  if (failed.length > 0) {
    console.error(
      `[learning-report] ${failed.length}/${members.length} report(s) failed for room ${roomId}`
    )

    failed.forEach(result => {
      console.error(
        '[learning-report] generation failed:',
        result.reason?.message || result.reason
      )
    })
  }

  console.log(
    `[learning-report] generated ${successful.length}/${members.length} reports for room ${roomId}`
  )

  return successful.map(result => result.value)
}