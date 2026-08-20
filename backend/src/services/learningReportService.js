import Response from '../models/Response.js'
import Question from '../models/Question.js'

export async function calculateStudentMetrics(roomId, studentId) {
  const [responses, questions] = await Promise.all([
    Response.find({ roomId, studentId }).lean(),
    Question.find({ roomId, status: 'approved' }).lean()
  ])

  const totalQuestions = questions.length
  const attempted = responses.length
  const correct = responses.filter(response => response.isCorrect).length

  const totalPoints = responses.reduce(
    (sum, response) => sum + (response.points || 0),
    0
  )

  const totalResponseTime = responses.reduce(
    (sum, response) => sum + (response.responseTime || 0),
    0
  )

  const averageResponseTime = attempted > 0
    ? totalResponseTime / attempted
    : 0

  const accuracy = attempted > 0
    ? (correct / attempted) * 100
    : 0

  return {
    totalQuestions,
    attempted,
    correct,
    accuracy: Number(accuracy.toFixed(2)),
    totalPoints,
    averageResponseTime: Number(averageResponseTime.toFixed(2))
  }
}