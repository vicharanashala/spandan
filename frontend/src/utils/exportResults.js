import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const escapeCSV = (str) => {
  if (str == null) return ''
  const s = String(str)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

const safeFileName = (s) => (s || 'room').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'room'

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

const fmtPct = (num, denom) => {
  if (!denom || denom <= 0) return 'N/A'
  return Math.round((num / denom) * 100) + '%'
}

/**
 * Per-question CSV (teacher view): one row per question with correct answer, % correct, option breakdown.
 * Per-question CSV (student view): one row per question with the student's answer, correctness, points.
 */
export function exportPerQuestionCSV({ room, questions, responses, stats, isTeacher, userName }) {
  const rows = []
  const headers = ['#', 'Type', 'Question', 'Max Points']
  if (isTeacher) {
    headers.push('Correct Answer', '% Correct', 'Responses')
    const maxOpts = Math.max(...questions.map(q => q.options?.length || 0), 0)
    for (let i = 0; i < maxOpts; i++) {
      headers.push(`Option ${String.fromCharCode(65 + i)} (count, %)`)
    }
  } else {
    headers.push('Your Answer', 'Correct', 'Points Earned', 'Time (s)')
  }
  rows.push(headers.map(escapeCSV).join(','))

  questions.forEach((q, index) => {
    const qStats = responses[q._id] || {}
    const row = [index + 1, q.type, q.question, q.maxPoints || q.points || 100]

    if (isTeacher) {
      const correctRate = fmtPct(qStats.correctCount || 0, qStats.totalResponses || 0)
      const correctAnswer = q.options?.filter(o => o.isCorrect).map(o => o.text).join('; ') || ''
      row.push(correctAnswer, correctRate, qStats.totalResponses || 0)
      for (let i = 0; i < (q.options?.length || 0); i++) {
        const count = qStats.answerCounts?.[i] || 0
        const pct = qStats.totalResponses > 0 ? Math.round((count / qStats.totalResponses) * 100) : 0
        row.push(`${count} (${pct}%)`)
      }
    } else {
      const selectedText = q.answered
        ? (q.selectedOptions?.length
          ? q.selectedOptions.map(idx => q.options?.[idx]?.text || '').join('; ')
          : (q.options?.[q.selectedOption]?.text || ''))
        : 'Not answered'
      row.push(
        selectedText,
        q.answered ? (q.isCorrect ? 'Yes' : 'No') : '-',
        q.pointsEarned || 0,
        q.responseTime != null ? Math.round((q.responseTime || 0) / 1000) : '-'
      )
    }
    rows.push(row.map(escapeCSV).join(','))
  })

  rows.push('')
  rows.push(['Summary'].map(escapeCSV).join(','))
  rows.push(['Room', room?.name || ''].map(escapeCSV).join(','))
  rows.push(['Code', room?.code || ''].map(escapeCSV).join(','))
  if (!isTeacher && userName) rows.push(['Student', userName].map(escapeCSV).join(','))
  rows.push(['Total Questions', questions.length].map(escapeCSV).join(','))
  rows.push(['Total Responses', stats.totalResponses || 0].map(escapeCSV).join(','))
  rows.push(['Total Correct', stats.totalCorrect || 0].map(escapeCSV).join(','))
  rows.push(['Average Score', (stats.averageScore || 0) + '%'].map(escapeCSV).join(','))

  const csv = rows.join('\n')
  const suffix = isTeacher ? 'teacher' : (userName ? safeFileName(userName) : 'student')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `${safeFileName(room?.name)}_${suffix}_per_question.csv`)
}

/**
 * Per-student grid CSV (teacher only): one row per student, one column per question.
 * Cell = selected option text (or ✓/✗ if includeCorrectness), with points summary at end.
 */
export function exportPerStudentCSV({ room, questions, students, responses, stats }) {
  const rows = []
  const headers = ['#', 'Student Name', 'Email', 'Responses', 'Correct', 'Total Points', 'Avg Score']
  questions.forEach((q, i) => {
    headers.push(`Q${i + 1}: ${(q.question || '').slice(0, 30)}${(q.question || '').length > 30 ? '…' : ''}`)
  })
  rows.push(headers.map(escapeCSV).join(','))

  const responsesByStudent = {}
  ;(responses || []).forEach(r => {
    const sid = String(r.studentId)
    if (!responsesByStudent[sid]) responsesByStudent[sid] = {}
    responsesByStudent[sid][String(r.questionId)] = r
  })

  students.forEach((s, idx) => {
    const sid = String(s._id || s.id)
    const sResps = responsesByStudent[sid] || {}
    const answered = Object.keys(sResps).length
    const correct = Object.values(sResps).filter(r => r.isCorrect).length
    const totalPoints = Object.values(sResps).reduce((sum, r) => sum + (r.points || 0), 0)
    const avgScore = answered > 0 ? Math.round((totalPoints / (answered * 100)) * 100) : 0

    const row = [idx + 1, s.name || '', s.email || '', answered, correct, totalPoints, avgScore + '%']

    questions.forEach(q => {
      const r = sResps[String(q._id)]
      if (!r) {
        row.push('—')
        return
      }
      const sel = r.selectedOptions?.length
        ? r.selectedOptions.map(idx => q.options?.[idx]?.text || '').join('; ')
        : (q.options?.[r.selectedOption]?.text || '')
      row.push(`${sel}${r.isCorrect ? ' ✓' : ' ✗'} (${r.points || 0}pts)`)
    })

    rows.push(row.map(escapeCSV).join(','))
  })

  rows.push('')
  rows.push(['Summary'].map(escapeCSV).join(','))
  rows.push(['Room', room?.name || ''].map(escapeCSV).join(','))
  rows.push(['Code', room?.code || ''].map(escapeCSV).join(','))
  rows.push(['Total Students', students.length].map(escapeCSV).join(','))
  rows.push(['Total Responses', stats.totalResponses || 0].map(escapeCSV).join(','))
  rows.push(['Average Score', (stats.averageScore || 0) + '%'].map(escapeCSV).join(','))

  const csv = rows.join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `${safeFileName(room?.name)}_per_student_grid.csv`)
}

/**
 * PDF export. Reuses the per-question layout but includes a richer header.
 * Per-student breakdown PDF is also generated if students+responses are passed.
 */
export function exportPDF({ room, questions, responses, stats, isTeacher, userName, students }) {
  const doc = new jsPDF({ orientation: 'landscape' })

  // Cover header
  doc.setFontSize(18)
  doc.text(`Room: ${room?.name || 'Unknown'}`, 14, 18)
  doc.setFontSize(11)
  doc.text(`Code: ${room?.code || ''}   |   Generated: ${new Date().toLocaleString()}`, 14, 25)
  if (!isTeacher && userName) doc.text(`Student: ${userName}`, 14, 31)

  doc.setFontSize(12)
  doc.text('Overview', 14, 40)
  doc.setFontSize(10)
  const overviewParts = [
    `Questions: ${questions.length}`,
    `Responses: ${stats.totalResponses || 0}`,
    `Avg Score: ${stats.averageScore || 0}%`,
    `Correct: ${stats.totalCorrect || 0}`
  ]
  if (isTeacher && stats.totalStudents != null) overviewParts.push(`Students: ${stats.totalStudents}`)
  if (!isTeacher && stats.userRank) overviewParts.push(`Your Rank: #${stats.userRank}`)
  doc.text(overviewParts.join('   |   '), 14, 46)

  // Per-question table
  const columns = isTeacher
    ? ['#', 'Type', 'Question', 'Correct Answer', '% Correct', 'Resp.']
    : ['#', 'Type', 'Question', 'Your Answer', 'Correct', 'Points']
  const body = questions.map((q, index) => {
    const qStats = responses[q._id] || {}
    if (isTeacher) {
      const correctRate = fmtPct(qStats.correctCount || 0, qStats.totalResponses || 0)
      const correctAnswer = q.options?.filter(o => o.isCorrect).map(o => o.text).join('; ') || ''
      const qText = q.question?.length > 80 ? q.question.substring(0, 80) + '…' : q.question
      return [index + 1, q.type, qText, correctAnswer, correctRate, qStats.totalResponses || 0]
    } else {
      const selectedText = q.answered
        ? (q.selectedOptions?.length
          ? q.selectedOptions.map(idx => q.options?.[idx]?.text || '').join('; ')
          : (q.options?.[q.selectedOption]?.text || ''))
        : 'Not answered'
      const qText = q.question?.length > 50 ? q.question.substring(0, 50) + '…' : q.question
      return [
        index + 1,
        q.type,
        qText,
        selectedText,
        q.answered ? (q.isCorrect ? 'Yes' : 'No') : '-',
        q.answered ? `${q.pointsEarned || 0}/${q.maxPoints || 100}` : '-'
      ]
    }
  })

  autoTable(doc, {
    head: [columns],
    body,
    startY: 53,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246] },
    columnStyles: { 2: { cellWidth: 90 } }
  })

  // Optional: per-student grid page
  if (isTeacher && students?.length && Array.isArray(responses) && responses.length) {
    doc.addPage()
    doc.setFontSize(14)
    doc.text('Per-Student Breakdown', 14, 18)

    const responsesByStudent = {}
    responses.forEach(r => {
      const sid = String(r.studentId)
      if (!responsesByStudent[sid]) responsesByStudent[sid] = {}
      responsesByStudent[sid][String(r.questionId)] = r
    })

    const studentCols = ['#', 'Student', 'Email', 'Resp.', 'Correct', 'Points']
    questions.forEach((q, i) => studentCols.push(`Q${i + 1}`))
    const studentBody = students.map((s, idx) => {
      const sid = String(s._id || s.id)
      const sResps = responsesByStudent[sid] || {}
      const answered = Object.keys(sResps).length
      const correct = Object.values(sResps).filter(r => r.isCorrect).length
      const totalPts = Object.values(sResps).reduce((sum, r) => sum + (r.points || 0), 0)
      const row = [idx + 1, s.name || '', s.email || '', answered, correct, totalPts]
      questions.forEach(q => {
        const r = sResps[String(q._id)]
        if (!r) { row.push('—'); return }
        const ok = r.isCorrect ? '✓' : '✗'
        row.push(`${ok}${r.points || 0}`)
      })
      return row
    })

    autoTable(doc, {
      head: [studentCols],
      body: studentBody,
      startY: 25,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [16, 185, 129] }
    })
  }

  const suffix = isTeacher ? 'teacher' : (userName ? safeFileName(userName) : 'student')
  doc.save(`${safeFileName(room?.name)}_${suffix}_results.pdf`)
}

/**
 * Convenience function — exports based on a single "format" string.
 * Supported formats: 'csv-question', 'csv-student' (teacher only), 'pdf'.
 */
export function exportResults(format, payload) {
  if (format === 'csv-question') return exportPerQuestionCSV(payload)
  if (format === 'csv-student') return exportPerStudentCSV(payload)
  if (format === 'pdf') return exportPDF(payload)
  throw new Error(`Unknown export format: ${format}`)
}