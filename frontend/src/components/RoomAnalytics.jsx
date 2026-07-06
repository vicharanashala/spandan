import React, { useState, useEffect } from 'react'
import { API_URL } from '../config'

export default function RoomAnalytics({ roomId, token }) {
  const [loading, setLoading] = useState(true)
  const [questionsData, setQuestionsData] = useState([])
  const [studentsData, setStudentsData] = useState([])
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchAnalytics()
  }, [roomId])

  const fetchAnalytics = async () => {
    setLoading(true)
    setError(null)
    try {
      const [qRes, sRes] = await Promise.all([
        fetch(`${API_URL}/analytics/room/${roomId}/questions`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_URL}/analytics/room/${roomId}/students`, { headers: { 'Authorization': `Bearer ${token}` } })
      ])

      if (!qRes.ok || !sRes.ok) throw new Error('Failed to load analytics')

      const qData = await qRes.json()
      const sData = await sRes.json()

      setQuestionsData(qData.questions || [])
      setStudentsData(sData.students || [])
      setTotalQuestions(sData.totalQuestions || 0)
    } catch (err) {
      console.error(err)
      setError('Could not load room analytics.')
    } finally {
      setLoading(false)
    }
  }

  const exportCSV = (type) => {
    let csvContent = "data:text/csv;charset=utf-8,"
    
    if (type === 'questions') {
      csvContent += "Question,Type,Time To Answer (s),Total Answers,Correct Answers,Correct Rate (%),Avg Response Time (ms)\n"
      questionsData.forEach(q => {
        const row = [
          `"${q.text.replace(/"/g, '""')}"`,
          q.type,
          q.timeToAnswer,
          q.totalAnswers,
          q.correctAnswers,
          q.correctRate.toFixed(1),
          q.avgResponseTime.toFixed(0)
        ].join(",")
        csvContent += row + "\n"
      })
    } else {
      csvContent += "Student Name,Email,Questions Answered,Participation Score (%),Correct Answers,Correct Rate (%),Total Points,Avg Response Time (ms)\n"
      studentsData.forEach(s => {
        const row = [
          `"${s.name}"`,
          `"${s.email}"`,
          s.questionsAnswered,
          s.participationScore.toFixed(1),
          s.correctAnswers,
          s.correctRate.toFixed(1),
          s.totalPoints,
          s.avgResponseTime.toFixed(0)
        ].join(",")
        csvContent += row + "\n"
      })
    }

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `${type}_analytics_${roomId}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading analytics...</div>
  }

  if (error) {
    return <div style={{ padding: '20px', color: '#ef4444', background: '#fef2f2', borderRadius: '8px' }}>{error}</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Student Performance */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>Student Performance</h2>
          <button
            onClick={() => exportCSV('students')}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              border: '1px solid #10b981',
              color: '#10b981',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500'
            }}
          >
            Download CSV
          </button>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>Student</th>
                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>Participation</th>
                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>Correct Rate</th>
                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {studentsData.map((s) => (
                <tr key={s._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{s.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{s.email}</div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{s.questionsAnswered} / {totalQuestions}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{s.participationScore.toFixed(1)}%</div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '60px', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${s.correctRate}%`, height: '100%', background: s.correctRate < 50 ? '#ef4444' : (s.correctRate < 80 ? '#f59e0b' : '#10b981') }} />
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: s.correctRate < 50 ? '#ef4444' : 'var(--text-primary)' }}>
                        {s.correctRate.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600', color: '#8b5cf6' }}>
                    {s.totalPoints}
                  </td>
                </tr>
              ))}
              {studentsData.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No student data available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Question Performance */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>Question Performance</h2>
          <button
            onClick={() => exportCSV('questions')}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              border: '1px solid #10b981',
              color: '#10b981',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500'
            }}
          >
            Download CSV
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>Question</th>
                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>Total Answers</th>
                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>Correct Rate</th>
              </tr>
            </thead>
            <tbody>
              {questionsData.map((q) => (
                <tr key={q._id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {q.text}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Type: {q.type}</div>
                  </td>
                  <td style={{ padding: '12px', fontSize: '13px', color: 'var(--text-primary)' }}>
                    {q.totalAnswers}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '60px', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${q.correctRate}%`, height: '100%', background: q.correctRate < 50 ? '#ef4444' : '#10b981' }} />
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: q.correctRate < 50 ? '#ef4444' : 'var(--text-primary)' }}>
                        {q.correctRate.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {questionsData.length === 0 && (
                <tr>
                  <td colSpan="3" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No question data available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
