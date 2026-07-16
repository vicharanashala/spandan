import express from 'express'
import mongoose from 'mongoose'
import { authenticate, authorize } from '../middleware/auth.js'
import Response from '../models/Response.js'
import Question from '../models/Question.js'
import Room from '../models/Room.js'
import User from '../models/User.js'

const router = express.Router()

// GET /api/export/room/:roomId?format=csv|pdf
// Exports complete session results for a teacher's room
router.get('/room/:roomId', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params
    const format = req.query.format || 'csv'
    const currentUser = req.user

    const room = await Room.findById(roomId).lean()
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (room.teacher.toString() !== currentUser._id.toString()) {
      return res.status(403).json({ error: 'Only room owner can export results' })
    }

    // Fetch all data in parallel
    const [questions, allResponses, leaderboardData] = await Promise.all([
      Question.find({ roomId, status: 'approved' }).sort({ createdAt: 1 }).lean(),
      Response.find({ roomId }).lean(),
      getLeaderboardData(roomId)
    ])

    // Build response map: questionId -> [responses]
    const responsesByQuestion = new Map()
    for (const r of allResponses) {
      const qId = r.questionId.toString()
      if (!responsesByQuestion.has(qId)) responsesByQuestion.set(qId, [])
      responsesByQuestion.get(qId).push(r)
    }

    // Build student map: studentId -> { name, email }
    const studentIds = [...new Set(allResponses.map(r => r.studentId.toString()))]
    const students = studentIds.length > 0
      ? await User.find({ _id: { $in: studentIds } }).select('name email enrollmentNumber').lean()
      : []
    const studentMap = new Map(students.map(s => [s._id.toString(), s]))

    // Build student per-question results
    const studentResults = new Map() // studentId -> { totalPoints, totalCorrect, totalAnswered, questions: {qId: {points, isCorrect, responseTime}} }
    for (const r of allResponses) {
      const sId = r.studentId.toString()
      const qId = r.questionId.toString()
      if (!studentResults.has(sId)) {
        studentResults.set(sId, { totalPoints: 0, totalCorrect: 0, totalAnswered: 0, questions: {} })
      }
      const sr = studentResults.get(sId)
      sr.totalPoints += r.points || 0
      sr.totalCorrect += r.isCorrect ? 1 : 0
      sr.totalAnswered += 1
      sr.questions[qId] = {
        points: r.points || 0,
        isCorrect: r.isCorrect,
        responseTime: r.responseTime || 0,
        selectedOption: r.selectedOption,
        selectedOptions: r.selectedOptions
      }
    }

    if (format === 'csv') {
      return exportCSV(res, room, questions, studentResults, studentMap, leaderboardData)
    } else if (format === 'pdf') {
      return exportPDF(res, room, questions, studentResults, studentMap, leaderboardData)
    } else {
      return res.status(400).json({ error: 'Invalid format. Use csv or pdf' })
    }
  } catch (error) {
    console.error('Export error:', error)
    res.status(500).json({ error: 'Failed to export results' })
  }
})

// Fetch leaderboard data from Redis or MongoDB
async function getLeaderboardData(roomId) {
  try {
    const { getTopN } = await import('../services/leaderboardService.js')
    const top = await getTopN(roomId, 10000)
    if (top && top.length > 0) return top
  } catch {}

  // Fallback: aggregate from responses
  const agg = await Response.aggregate([
    { $match: { roomId: new mongoose.Types.ObjectId(roomId) } },
    { $group: {
      _id: '$studentId',
      totalPoints: { $sum: '$points' },
      correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } },
      totalAnswered: { $sum: 1 }
    }},
    { $sort: { totalPoints: -1 } }
  ])

  const userIds = agg.map(e => e._id)
  const users = userIds.length > 0
    ? await User.find({ _id: { $in: userIds } }).select('name email').lean()
    : []
  const userMap = new Map(users.map(u => [u._id.toString(), u]))

  return agg.map((entry, index) => {
    const user = userMap.get(entry._id.toString())
    return {
      rank: index + 1,
      studentId: entry._id.toString(),
      studentName: user?.name || user?.email || 'Unknown',
      totalPoints: entry.totalPoints,
      correctCount: entry.correctCount,
      totalAnswered: entry.totalAnswered
    }
  })
}

// ============================================
// CSV Export
// ============================================
function exportCSV(res, room, questions, studentResults, studentMap, leaderboard) {
  const lines = []

  // Sheet 1: Summary
  lines.push('=== SESSION SUMMARY ===')
  lines.push(`Room Name,${esc(room.name)}`)
  lines.push(`Room Code,${room.code}`)
  lines.push(`Total Questions,${questions.length}`)
  lines.push(`Total Students,${studentResults.size}`)
  const totalResponses = [...studentResults.values()].reduce((s, v) => s + v.totalAnswered, 0)
  const totalCorrect = [...studentResults.values()].reduce((s, v) => s + v.totalCorrect, 0)
  lines.push(`Total Responses,${totalResponses}`)
  lines.push(`Average Accuracy,${totalResponses > 0 ? Math.round((totalCorrect / totalResponses) * 100) : 0}%`)
  lines.push('')

  // Sheet 2: Leaderboard
  lines.push('=== LEADERBOARD ===')
  lines.push('Rank,Student Name,Email,Points,Correct,Answered,Accuracy')
  for (const entry of leaderboard) {
    const student = studentMap.get(entry.studentId)
    const acc = entry.totalAnswered > 0 ? Math.round((entry.correctCount / entry.totalAnswered) * 100) : 0
    lines.push(`${entry.rank},"${esc(student?.name || entry.studentName)}","${esc(student?.email || '')}",${entry.totalPoints},${entry.correctCount},${entry.totalAnswered},${acc}%`)
  }
  lines.push('')

  // Sheet 3: Question Analysis
  lines.push('=== QUESTION ANALYSIS ===')
  lines.push('#,Question,Type,Points,Options,Correct Answer,Responses,Correct,Accuracy')
  questions.forEach((q, idx) => {
    const options = q.options.map(o => esc(o.text)).join(' | ')
    const correctOptions = q.options.filter(o => o.isCorrect).map(o => esc(o.text)).join(', ')
    const qResponses = responsesByQuestion(q._id.toString(), questions, studentResults) || 0
    const qCorrect = correctCountForQuestion(q._id.toString(), studentResults)
    const acc = qResponses > 0 ? Math.round((qCorrect / qResponses) * 100) : 0
    lines.push(`${idx + 1},"${esc(q.question)}",${q.type},${q.points},"${options}","${correctOptions}",${qResponses},${qCorrect},${acc}%`)
  })
  lines.push('')

  // Sheet 4: Student per-question breakdown
  lines.push('=== STUDENT RESULTS ===')
  const headerParts = ['Student Name', 'Email', 'Total Points', 'Total Correct', 'Total Answered', 'Accuracy']
  for (const q of questions) {
    headerParts.push(`Q${questions.indexOf(q) + 1} (${q.points}pts)`)
  }
  lines.push(headerParts.join(','))

  // Sort students by points descending
  const sortedStudents = [...studentResults.entries()].sort((a, b) => b[1].totalPoints - a[1].totalPoints)

  for (const [sId, result] of sortedStudents) {
    const student = studentMap.get(sId)
    const acc = result.totalAnswered > 0 ? Math.round((result.totalCorrect / result.totalAnswered) * 100) : 0
    const rowParts = [
      `"${esc(student?.name || 'Unknown')}"`,
      `"${esc(student?.email || '')}"`,
      result.totalPoints,
      result.totalCorrect,
      result.totalAnswered,
      `${acc}%`
    ]
    for (const q of questions) {
      const qr = result.questions[q._id.toString()]
      if (qr) {
        rowParts.push(qr.isCorrect ? `${qr.points}✓` : `${qr.points}✗`)
      } else {
        rowParts.push('N/A')
      }
    }
    lines.push(rowParts.join(','))
  }

  const csv = lines.join('\n')
  const filename = `spandan-${room.code}-${new Date().toISOString().slice(0, 10)}.csv`

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send('\uFEFF' + csv) // BOM for Excel UTF-8 compatibility
}

function responsesByQuestion(questionId, questions, studentResults) { return countResponsesForQ(questionId, studentResults) }
function correctCountForQuestion(questionId, studentResults) {
  let count = 0
  for (const [, sr] of studentResults) {
    if (sr.questions[questionId]?.isCorrect) count++
  }
  return count
}

function esc(str) {
  if (!str) return ''
  return String(str).replace(/"/g, '""').replace(/\n/g, ' ')
}

// ============================================
// PDF Export (generates printable HTML)
// ============================================
function exportPDF(res, room, questions, studentResults, studentMap, leaderboard) {
  const totalResponses = [...studentResults.values()].reduce((s, v) => s + v.totalAnswered, 0)
  const totalCorrect = [...studentResults.values()].reduce((s, v) => s + v.totalCorrect, 0)
  const avgAccuracy = totalResponses > 0 ? Math.round((totalCorrect / totalResponses) * 100) : 0

  // Leaderboard rows
  let leaderboardRows = ''
  for (const entry of leaderboard) {
    const student = studentMap.get(entry.studentId)
    const acc = entry.totalAnswered > 0 ? Math.round((entry.correctCount / entry.totalAnswered) * 100) : 0
    const bg = entry.rank === 1 ? '#fef3c7' : entry.rank === 2 ? '#f3f4f6' : entry.rank === 3 ? '#fef3c7' : entry.rank % 2 === 0 ? '#f9fafb' : '#ffffff'
    leaderboardRows += `<tr style="background:${bg}">
      <td style="text-align:center;font-weight:700">${entry.rank}</td>
      <td>${h(student?.name || entry.studentName)}</td>
      <td>${entry.totalPoints}</td>
      <td>${entry.correctCount}/${entry.totalAnswered}</td>
      <td style="text-align:center">${acc}%</td>
    </tr>`
  }

  // Question analysis rows
  let questionRows = ''
  questions.forEach((q, idx) => {
    const qResp = countResponsesForQ(q._id.toString(), studentResults)
    const qCorr = correctCountForQuestion(q._id.toString(), studentResults)
    const acc = qResp > 0 ? Math.round((qCorr / qResp) * 100) : 0
    const correctText = q.options.filter(o => o.isCorrect).map(o => h(o.text)).join(', ')
    const optionsText = q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${h(o.text)}${o.isCorrect ? ' ✓' : ''}`).join(' &nbsp;|&nbsp; ')

    questionRows += `<tr>
      <td style="text-align:center">${idx + 1}</td>
      <td>${h(q.question)}</td>
      <td style="text-align:center">${q.type}</td>
      <td style="text-align:center">${q.points}</td>
      <td>${optionsText}</td>
      <td style="text-align:center">${qResp}</td>
      <td style="text-align:center">${qCorr}</td>
      <td style="text-align:center">${acc}%</td>
    </tr>`
  })

  // Student results rows
  const sortedStudents = [...studentResults.entries()].sort((a, b) => b[1].totalPoints - a[1].totalPoints)
  let studentHeaderCols = '<th>Rank</th><th>Student</th><th>Email</th><th>Points</th><th>Correct</th><th>Answered</th><th>Accuracy</th>'
  for (let i = 0; i < questions.length; i++) {
    studentHeaderCols += `<th>Q${i + 1}</th>`
  }

  let studentRows = ''
  let rank = 1
  for (const [sId, result] of sortedStudents) {
    const student = studentMap.get(sId)
    const acc = result.totalAnswered > 0 ? Math.round((result.totalCorrect / result.totalAnswered) * 100) : 0
    const bg = rank % 2 === 0 ? '#f9fafb' : '#ffffff'
    let cols = `<td style="text-align:center;font-weight:700">${rank}</td>
      <td>${h(student?.name || 'Unknown')}</td>
      <td>${h(student?.email || '')}</td>
      <td style="text-align:center;font-weight:600">${result.totalPoints}</td>
      <td style="text-align:center">${result.totalCorrect}</td>
      <td style="text-align:center">${result.totalAnswered}</td>
      <td style="text-align:center">${acc}%</td>`

    for (const q of questions) {
      const qr = result.questions[q._id.toString()]
      if (qr) {
        const color = qr.isCorrect ? '#16a34a' : '#dc2626'
        const symbol = qr.isCorrect ? '✓' : '✗'
        cols += `<td style="text-align:center;color:${color};font-weight:600">${qr.points}${symbol}</td>`
      } else {
        cols += `<td style="text-align:center;color:#9ca3af">N/A</td>`
      }
    }
    studentRows += `<tr style="background:${bg}">${cols}</tr>`
    rank++
  }

  const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Spandan Results — ${h(room.name)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', sans-serif; color: #1f2937; padding: 30px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 16px; color: #4b5563; margin: 24px 0 10px; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
  .meta { font-size: 12px; color: #6b7280; margin-bottom: 20px; }
  .stats { display: flex; gap: 12px; margin-bottom: 24px; }
  .stat { background: #f3f4f6; border-radius: 8px; padding: 12px 16px; flex: 1; text-align: center; }
  .stat .num { font-size: 24px; font-weight: 700; color: #2563eb; }
  .stat .label { font-size: 11px; color: #6b7280; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; }
  th { background: #1f2937; color: white; padding: 8px 10px; text-align: left; font-weight: 600; }
  td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
  tr:last-child td { border-bottom: none; }
  .footer { text-align: center; font-size: 10px; color: #9ca3af; margin-top: 30px; padding-top: 10px; border-top: 1px solid #e5e7eb; }
  @media print { body { padding: 15px; } h2 { page-break-after: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
</style>
</head>
<body>
  <h1>Spandan — Session Results</h1>
  <div class="meta">${h(room.name)} &bull; Code: ${room.code} &bull; Exported: ${now}</div>

  <div class="stats">
    <div class="stat"><div class="num">${questions.length}</div><div class="label">Questions</div></div>
    <div class="stat"><div class="num">${studentResults.size}</div><div class="label">Students</div></div>
    <div class="stat"><div class="num">${totalResponses}</div><div class="label">Responses</div></div>
    <div class="stat"><div class="num">${avgAccuracy}%</div><div class="label">Avg Accuracy</div></div>
  </div>

  <h2>Leaderboard</h2>
  <table>
    <thead><tr><th>Rank</th><th>Student</th><th>Points</th><th>Score</th><th>Accuracy</th></tr></thead>
    <tbody>${leaderboardRows}</tbody>
  </table>

  <h2>Question Analysis</h2>
  <table>
    <thead><tr><th>#</th><th>Question</th><th>Type</th><th>Pts</th><th>Options</th><th>Responses</th><th>Correct</th><th>Accuracy</th></tr></thead>
    <tbody>${questionRows}</tbody>
  </table>

  <h2>Student Results</h2>
  <table>
    <thead><tr>${studentHeaderCols}</tr></thead>
    <tbody>${studentRows}</tbody>
  </table>

  <div class="footer">Generated by Spandan &bull; spandan.fun</div>

  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`

  const filename = `spandan-${room.code}-${new Date().toISOString().slice(0, 10)}.html`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
  res.send(html)
}

function countResponsesForQ(questionId, studentResults) {
  let count = 0
  for (const [, sr] of studentResults) {
    if (sr.questions[questionId]) count++
  }
  return count
}

function h(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default router
