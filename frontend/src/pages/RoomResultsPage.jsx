import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import { API_URL } from '../config.js'
import { fetchAllRoomQuestions } from '../services/questionService'
import useIsMobile from '../hooks/useIsMobile'

function RoomResultsPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { setAuthToken } = useRoomStore()
  const isMobile = useIsMobile()

  const [room, setRoom] = useState(null)
  const [questions, setQuestions] = useState([])
  const [responses, setResponses] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState({
    totalResponses: 0,
    totalCorrect: 0,
    averageScore: 0,
    participationRate: 0
  })

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      fetchRoomData()
    }
  }, [token, roomId])

  const fetchRoomData = async () => {
    setIsLoading(true)
    try {
      // Fetch room details
      const roomRes = await fetch(`${API_URL}/rooms/${roomId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const roomData = await roomRes.json()
      if (roomRes.ok) {
        setRoom(roomData.room || roomData)
      }

      if (user?.role === 'student') {
        // Student: fetch their own responses (includes questions with answers)
        const studentRes = await fetch(`${API_URL}/responses/room/${roomId}/student/${user._id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const studentData = await studentRes.json()

        // Use studentData.questions for rendering (has answered, isCorrect, pointsEarned, etc.)
        setQuestions(studentData.questions || [])

        // Build responses data from student's question data
        const responsesData = {}
        let totalResponses = 0
        let totalCorrect = 0
        let totalPoints = 0

        studentData.questions?.forEach(q => {
          if (q.answered) {
            responsesData[q._id] = {
              totalResponses: 1,
              correctCount: q.isCorrect ? 1 : 0,
              points: q.pointsEarned || 0
            }
            totalResponses += 1
            if (q.isCorrect) totalCorrect += 1
            totalPoints += q.pointsEarned || 0
          }
        })

        setResponses(responsesData)

        // Fetch leaderboard to get student's rank
        const leaderboardRes = await fetch(`${API_URL}/responses/leaderboard/${roomId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const leaderboardData = await leaderboardRes.json()
        const userRank = leaderboardData.userRank || 0

        const averageScore = totalResponses > 0 ? Math.round((totalPoints / (totalResponses * 100)) * 100) : 0

        setStats({
          totalResponses,
          totalCorrect,
          averageScore,
          participationRate: 100,
          userRank,
          totalPoints
        })
      } else {
        // Teacher: fetch ALL questions (pages past the API's 50/page cap) so results show the true
        // question count and every question's stats. Students don't need this — their per-response
        // call above already returns the questions with their answers merged in.
        const roomQuestions = await fetchAllRoomQuestions(roomId)
        setQuestions(roomQuestions)

        // Teacher: fetch full room stats once
        const rRes = await fetch(`${API_URL}/responses/stats/room/${roomId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const rData = await rRes.json()

        // Build responsesData from questionStats
        const responsesData = {}
        const questionStats = rData.stats?.questionStats || []

        questionStats.forEach(qStat => {
          responsesData[qStat.questionId] = {
            totalResponses: qStat.totalResponses,
            correctCount: qStat.correctCount || 0,
            answerCounts: qStat.answerCounts || {}
          }
        })

        setResponses(responsesData)

        // Calculate overall stats from aggregated data
        const totalResponses = rData.stats?.totalResponses || 0
        const totalCorrect = questionStats.reduce((sum, q) => sum + (q.correctCount || 0), 0)
        const averageScore = totalResponses > 0 ? Math.round((totalCorrect / totalResponses) * 100) : 0
        const uniqueStudents = rData.stats?.totalStudents || 0
        const participationRate = roomQuestions.length > 0
          ? Math.round((uniqueStudents / Math.max(roomQuestions.length, 1)) * 100)
          : 0

        setStats({
          totalResponses,
          totalCorrect,
          averageScore,
          // "Total Students" card = the room roster (joined); fall back to responders if the
          // backend didn't supply it.
          totalStudents: rData.stats?.totalJoined ?? uniqueStudents,
          participationRate: Math.min(participationRate, 100)
        })
      }
    } catch (err) {
      console.error('Failed to fetch room results:', err)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        maxWidth: '100%',
        boxSizing: 'border-box',
        background: 'var(--bg-primary)',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
      }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, minWidth: 0, marginLeft: 'var(--sidebar-width, 240px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid var(--border-color)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }} />
            <p style={{ color: 'var(--text-secondary)' }}>Loading results...</p>
          </div>
        </div>
      </div>
    )
  }

  // Stat cards config — same data, presented uniformly. Role-specific 3rd card handled inline.
  const statCards = [
    { icon: '📝', value: questions.length, label: 'Total Questions', tint: 'var(--accent)' },
    { icon: '👥', value: stats.totalResponses, label: 'Total Responses', tint: 'var(--accent)' },
    ...(user?.role === 'teacher'
      ? [{ icon: '🧑‍🎓', value: stats.totalStudents || 0, label: 'Total Students', tint: 'var(--accent)' }]
      : [{ icon: '🏅', value: stats.userRank ? `#${stats.userRank}` : '—', label: 'Your Rank', tint: '#f59e0b', valueColor: '#f59e0b' }]),
    { icon: '✅', value: `${stats.averageScore}%`, label: 'Average Score', tint: '#059669', valueColor: '#059669' },
    { icon: '🎯', value: stats.totalCorrect, label: 'Correct Answers', tint: 'var(--accent)', valueColor: 'var(--accent)' },
  ]

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      maxWidth: '100%',
      boxSizing: 'border-box',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <Sidebar user={user} />

      <div style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        marginLeft: 'var(--sidebar-width, 240px)',
        maxWidth: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Header */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: isMobile ? '20px 16px' : '24px 32px',
          paddingLeft: isMobile ? '64px' : '32px',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{
                margin: 0,
                fontSize: isMobile ? '22px' : '26px',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span aria-hidden="true">📊</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {room?.name || 'Room'} Results
                </span>
              </h1>
              <p style={{ margin: '6px 0 0', opacity: 0.9, fontSize: '14px' }}>
                Code: {room?.code} • Completed
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{
          flex: 1,
          padding: isMobile ? '16px' : '32px',
          maxWidth: '100%',
          boxSizing: 'border-box'
        }}>
          {/* Back Button */}
          <button
            onClick={() => navigate(`/${user?.role === 'teacher' ? 'teacher' : 'student'}/room-history`)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
              marginBottom: '24px'
            }}
          >
            ← Back
          </button>

          {/* Overview Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            {statCards.map((card, i) => (
              <div key={i} style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-md)',
                padding: '20px',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  background: 'color-mix(in srgb, ' + card.tint + ' 14%, transparent)',
                  border: '1px solid color-mix(in srgb, ' + card.tint + ' 22%, transparent)'
                }} aria-hidden="true">
                  {card.icon}
                </div>
                <div style={{
                  fontSize: isMobile ? '26px' : '30px',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                  color: card.valueColor || 'var(--text-primary)'
                }}>
                  {card.value}
                </div>
                <div style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  {card.label}
                </div>
              </div>
            ))}
          </div>

          {/* Questions Analysis */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
            padding: isMobile ? '18px' : '24px',
            maxWidth: '100%',
            boxSizing: 'border-box'
          }}>
            <h2 style={{
              margin: '0 0 20px',
              fontSize: '18px',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)'
            }}>
              Question-wise Analysis
            </h2>

            {questions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                <p style={{ margin: 0 }}>No questions were asked in this room.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {questions.map((q, index) => {
                  const qStats = responses[q._id] || {}
                  const isTeacher = user?.role === 'teacher'

                  // Teacher: show class percentage. Student: show their result
                  const correctRate = isTeacher && qStats.totalResponses > 0
                    ? Math.round((qStats.correctCount / qStats.totalResponses) * 100)
                    : q.answered ? (q.isCorrect ? 100 : 0) : null

                  // Score card accent (semantic) — mirrors the original thresholds/answer logic.
                  const scoreColor = isTeacher
                    ? (correctRate >= 70 ? '#059669' : correctRate >= 40 ? '#d97706' : '#dc2626')
                    : (q.answered ? (q.isCorrect ? '#059669' : '#dc2626') : '#d97706')

                  return (
                    <div key={q._id} style={{
                      padding: isMobile ? '16px' : '20px',
                      background: 'var(--bg-primary)',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border-color)',
                      minWidth: 0
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '16px',
                        flexDirection: isMobile ? 'column' : 'row'
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                            <span style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: 'var(--accent)',
                              color: 'white',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                              fontWeight: 700,
                              flexShrink: 0
                            }}>
                              {index + 1}
                            </span>
                            <span style={{
                              padding: '3px 8px',
                              background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                              color: 'var(--accent)',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 600
                            }}>
                              {q.type}
                            </span>
                            <span style={{
                              padding: '3px 8px',
                              background: 'color-mix(in srgb, #d97706 16%, transparent)',
                              color: '#b45309',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 600
                            }}>
                              {q.maxPoints || q.points} pts
                            </span>
                            {q.answered && (
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: q.isCorrect ? 'color-mix(in srgb, #059669 16%, transparent)' : 'color-mix(in srgb, #dc2626 16%, transparent)',
                                color: q.isCorrect ? '#059669' : '#dc2626'
                              }}>
                                {q.isCorrect ? '✓ Correct' : '✗ Incorrect'}
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px', lineHeight: 1.5 }}>
                            {q.question}
                          </p>

                          {/* Options - show differently for teacher vs student */}
                          <div style={{ display: 'grid', gap: '8px' }}>
                            {q.options && q.options.map((opt, optIdx) => {
                              const isCorrect = opt.isCorrect
                              const isSelected = q.selectedOption === optIdx

                              // For student: highlight their selection. For teacher: highlight correct answer
                              const showAsSelected = isTeacher ? isCorrect : isSelected
                              const highlightStyle = showAsSelected
                                ? (isTeacher ? 'color-mix(in srgb, #059669 12%, transparent)' : (isSelected ? (isCorrect ? 'color-mix(in srgb, #059669 12%, transparent)' : 'color-mix(in srgb, #dc2626 12%, transparent)') : 'color-mix(in srgb, #059669 12%, transparent)'))
                                : 'var(--bg-card)'
                              const borderStyle = showAsSelected
                                ? (isTeacher ? '2px solid #059669' : (isSelected ? '2px solid var(--accent)' : '2px solid #059669'))
                                : '1px solid var(--border-color)'

                              return (
                                <div key={optIdx} style={{
                                  padding: '10px 14px',
                                  background: highlightStyle,
                                  borderRadius: 'var(--radius-sm)',
                                  border: borderStyle,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  minWidth: 0
                                }}>
                                  <span style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    background: isCorrect ? '#059669' : 'var(--border-color)',
                                    color: isCorrect ? 'white' : 'var(--text-secondary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    flexShrink: 0
                                  }}>
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  <span style={{
                                    fontSize: '14px',
                                    color: 'var(--text-primary)',
                                    fontWeight: isCorrect ? 600 : 400,
                                    minWidth: 0
                                  }}>
                                    {opt.text}
                                  </span>
                                  {isTeacher && isCorrect && (
                                    <span style={{ marginLeft: 'auto', color: '#059669', fontSize: '14px', flexShrink: 0 }}>✓</span>
                                  )}
                                  {!isTeacher && isSelected && (
                                    <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>Your answer</span>
                                  )}
                                  {!isTeacher && isCorrect && !isSelected && (
                                    <span style={{ marginLeft: 'auto', color: '#059669', fontSize: '13px', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>Correct answer</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {/* Teacher: visual distribution bar of class correctness (purely presentational) */}
                          {isTeacher && (
                            <div style={{ marginTop: '14px' }}>
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '11px',
                                color: 'var(--text-secondary)',
                                marginBottom: '6px',
                                fontWeight: 600
                              }}>
                                <span>Class correct rate</span>
                                <span>{correctRate !== null ? `${correctRate}%` : '0%'}</span>
                              </div>
                              <div style={{
                                height: '8px',
                                borderRadius: '999px',
                                background: 'var(--border-color)',
                                overflow: 'hidden'
                              }}>
                                <div style={{
                                  height: '100%',
                                  width: `${Math.max(0, Math.min(100, correctRate || 0))}%`,
                                  background: scoreColor,
                                  borderRadius: '999px',
                                  transition: 'width 0.3s ease'
                                }} />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Question Stats */}
                        <div style={{
                          minWidth: isMobile ? 0 : '120px',
                          width: isMobile ? '100%' : 'auto',
                          textAlign: 'center',
                          padding: '16px',
                          background: 'color-mix(in srgb, ' + scoreColor + ' 12%, transparent)',
                          border: '1px solid color-mix(in srgb, ' + scoreColor + ' 24%, transparent)',
                          borderRadius: 'var(--radius)',
                          flexShrink: 0
                        }}>
                          {isTeacher ? (
                            <>
                              <div style={{ fontSize: isMobile ? '28px' : '32px', fontWeight: 700, letterSpacing: '-0.02em', color: scoreColor }}>
                                {correctRate !== null ? `${correctRate}%` : '0%'}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 500 }}>
                                {qStats.totalResponses || 0} responses
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ fontSize: isMobile ? '28px' : '32px', fontWeight: 700, letterSpacing: '-0.02em', color: scoreColor }}>
                                {q.pointsEarned || 0}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 500 }}>
                                / {q.maxPoints || 100} pts
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default RoomResultsPage
