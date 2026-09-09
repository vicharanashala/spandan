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
        let totalResponseTime = 0

        studentData.questions?.forEach(q => {
          if (q.answered) {
            const rt = Number(q.responseTime) || 0
            responsesData[q._id] = {
              totalResponses: 1,
              correctCount: q.isCorrect ? 1 : 0,
              points: q.pointsEarned || 0,
              responseTime: rt
            }
            totalResponses += 1
            if (q.isCorrect) totalCorrect += 1
            totalPoints += q.pointsEarned || 0
            totalResponseTime += rt
          }
        })

        setResponses(responsesData)

        // Fetch leaderboard to get student's rank
        const leaderboardRes = await fetch(`${API_URL}/responses/leaderboard/${roomId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const leaderboardData = await leaderboardRes.json()
        const userRank = leaderboardData.userRank || 0

        const averageScore = totalResponses > 0 ? Math.round((totalCorrect / totalResponses) * 100) : 0
        const avgResponseTime = totalResponses > 0 ? Number((totalResponseTime / totalResponses).toFixed(1)) : 0

        setStats({
          totalResponses,
          totalCorrect,
          averageScore,
          avgResponseTime,
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
            answerCounts: qStat.answerCounts || {},
            velocityStats: qStat.velocityStats || null
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
      : [
          { icon: '🏅', value: stats.userRank ? `#${stats.userRank}` : '—', label: 'Your Rank', tint: '#f59e0b', valueColor: '#f59e0b' },
          { icon: '⚡', value: stats.avgResponseTime !== undefined ? `${stats.avgResponseTime}s` : '—', label: 'Avg Speed', tint: '#8b5cf6', valueColor: '#8b5cf6' }
        ]),
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

          {/* Student Thinking Persona & Cognitive Timing Insight */}
          {user?.role === 'student' && stats.totalResponses > 0 && (() => {
            const avg = Number(stats.avgResponseTime) || 0
            const acc = Number(stats.averageScore) || 0
            let badgeTitle = 'Thoughtful Contender'
            let badgeIcon = '📚'
            let badgeColor = '#6366f1'
            let badgeBg = 'rgba(99, 102, 241, 0.08)'
            let badgeBorder = 'rgba(99, 102, 241, 0.25)'
            let badgeDesc = 'Good effort! You engaged with the lecture questions thoughtfully. Keep practicing to build speed and accuracy.'

            if (avg < 2.0) {
              badgeTitle = 'Speed Gambler / Impulsive Clicker'
              badgeIcon = '🎲'
              badgeColor = '#ef4444'
              badgeBg = 'rgba(239, 68, 68, 0.08)'
              badgeBorder = 'rgba(239, 68, 68, 0.3)'
              badgeDesc = `Average response time of ${avg}s detected! Attendance was recorded, but speed multipliers were capped. Human reading comprehension requires at least 2 seconds — take time to read the question to unlock full 100% points!`
            } else if (acc >= 75 && avg <= 8.0) {
              badgeTitle = 'Mastery Mind'
              badgeIcon = '⚡'
              badgeColor = '#10b981'
              badgeBg = 'rgba(16, 185, 129, 0.08)'
              badgeBorder = 'rgba(16, 185, 129, 0.3)'
              badgeDesc = 'Outstanding cognitive balance! You read carefully and solved accurately within the optimal reading window.'
            } else if (acc >= 75 && avg > 8.0) {
              badgeTitle = 'Deep Thinker'
              badgeIcon = '🎯'
              badgeColor = '#3b82f6'
              badgeBg = 'rgba(59, 130, 246, 0.08)'
              badgeBorder = 'rgba(59, 130, 246, 0.3)'
              badgeDesc = 'Methodical, thorough, and highly accurate. You prioritized correctness over hasty clicks!'
            } else if (acc < 50 && avg >= 18.0) {
              badgeTitle = 'Time-Challenged Learner'
              badgeIcon = '⏳'
              badgeColor = '#f59e0b'
              badgeBg = 'rgba(245, 158, 11, 0.08)'
              badgeBorder = 'rgba(245, 158, 11, 0.3)'
              badgeDesc = 'You spent significant time analyzing tricky questions. Reviewing the lecture notes will help sharpen recall speed.'
            }

            return (
              <div style={{
                border: `1.5px solid ${badgeBorder}`,
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-md)',
                padding: isMobile ? '16px 20px' : '20px 24px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '16px',
                background: `linear-gradient(to right, ${badgeBg}, var(--bg-card))`
              }}>
                <div style={{
                  fontSize: '28px',
                  width: '50px',
                  height: '50px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: badgeBg,
                  border: `1px solid ${badgeBorder}`,
                  flexShrink: 0
                }}>
                  {badgeIcon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: badgeColor }}>
                      Cognitive Persona: {badgeTitle}
                    </h3>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: badgeBg,
                      color: badgeColor,
                      border: `1px solid ${badgeBorder}`
                    }}>
                      Avg Answer Speed: {avg}s
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {badgeDesc}
                  </p>
                </div>
              </div>
            )
          })()}

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
                            {!isTeacher && q.answered && q.responseTime !== undefined && (
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: q.responseTime < 2.0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                                color: q.responseTime < 2.0 ? '#ef4444' : '#10b981',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span>⚡</span>
                                <span>{q.responseTime}s</span>
                                {q.responseTime < 2.0 && <span style={{ opacity: 0.8 }}>(Impulsive)</span>}
                              </span>
                            )}
                            {!isTeacher && (q.answered || q.focusLocked) && (
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: q.focusLocked
                                  ? 'rgba(239, 68, 68, 0.16)'
                                  : q.focusLost
                                    ? 'rgba(245, 158, 11, 0.16)'
                                    : 'rgba(16, 185, 129, 0.12)',
                                color: q.focusLocked
                                  ? '#ef4444'
                                  : q.focusLost
                                    ? '#d97706'
                                    : '#10b981',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span>{q.focusLocked ? '🔒 Focus Locked (>2s away)' : q.focusLost ? `⚠️ Tab Switched (${q.timeAway || 0}s)` : '🛡️ 100% Focused'}</span>
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

                          {/* Teacher: Response Velocity Curve & Cognitive Effort Breakdown */}
                          {isTeacher && qStats.velocityStats && qStats.totalResponses > 0 && (() => {
                            const v = qStats.velocityStats
                            const total = qStats.totalResponses || 1
                            const spamPct = Math.round((v.spamCount / total) * 100)
                            const thoughtfulPct = Math.round((v.thoughtfulCount / total) * 100)
                            const latePct = Math.round((v.lateCount / total) * 100)
                            const moderatePct = Math.max(0, 100 - spamPct - thoughtfulPct - latePct)

                            return (
                              <div style={{
                                marginTop: '16px',
                                padding: '12px 14px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-sm)'
                              }}>
                                <div style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginBottom: '8px',
                                  flexWrap: 'wrap',
                                  gap: '6px'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    <span>⚡ Response Velocity Curve</span>
                                  </div>
                                  <span style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: 'var(--accent)',
                                    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                                    padding: '2px 8px',
                                    borderRadius: '12px'
                                  }}>
                                    Avg speed: {v.avgResponseTime || 0}s
                                  </span>
                                </div>

                                {/* Multi-segment velocity bar */}
                                <div style={{
                                  height: '8px',
                                  borderRadius: '999px',
                                  background: 'var(--border-color)',
                                  display: 'flex',
                                  overflow: 'hidden',
                                  marginBottom: '10px'
                                }}>
                                  {v.spamCount > 0 && (
                                    <div
                                      title={`Impulsive (<2s): ${v.spamCount} (${spamPct}%)`}
                                      style={{
                                        height: '100%',
                                        width: `${spamPct}%`,
                                        background: '#ef4444',
                                        transition: 'width 0.3s ease'
                                      }}
                                    />
                                  )}
                                  {v.thoughtfulCount > 0 && (
                                    <div
                                      title={`Thoughtful (2-15s): ${v.thoughtfulCount} (${thoughtfulPct}%)`}
                                      style={{
                                        height: '100%',
                                        width: `${thoughtfulPct}%`,
                                        background: '#10b981',
                                        transition: 'width 0.3s ease'
                                      }}
                                    />
                                  )}
                                  {moderatePct > 0 && (
                                    <div
                                      title={`Deliberate (15-25s): ${Math.max(0, total - v.spamCount - v.thoughtfulCount - v.lateCount)} (${moderatePct}%)`}
                                      style={{
                                        height: '100%',
                                        width: `${moderatePct}%`,
                                        background: '#6366f1',
                                        transition: 'width 0.3s ease'
                                      }}
                                    />
                                  )}
                                  {v.lateCount > 0 && (
                                    <div
                                      title={`Late (>25s): ${v.lateCount} (${latePct}%)`}
                                      style={{
                                        height: '100%',
                                        width: `${latePct}%`,
                                        background: '#f59e0b',
                                        transition: 'width 0.3s ease'
                                      }}
                                    />
                                  )}
                                </div>

                                {/* Category Chips */}
                                <div style={{
                                  display: 'grid',
                                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(130px, 1fr))',
                                  gap: '8px',
                                  fontSize: '11px'
                                }}>
                                  <div style={{
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    background: 'rgba(239, 68, 68, 0.08)',
                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                    color: 'var(--text-primary)'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: '#ef4444' }}>
                                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }}></span>
                                      Impulsive (&lt;2s)
                                    </div>
                                    <div style={{ marginTop: '2px', color: 'var(--text-secondary)' }}>
                                      <strong>{v.spamCount}</strong> ({spamPct}%) • {v.spamAccuracy !== null ? `${v.spamAccuracy}% acc` : 'N/A'}
                                    </div>
                                    {v.spamCount > 0 && (
                                      <div style={{ fontSize: '10px', color: '#ef4444', marginTop: '2px', fontStyle: 'italic' }}>
                                        Speed bonus capped (50%)
                                      </div>
                                    )}
                                  </div>

                                  <div style={{
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    background: 'rgba(16, 185, 129, 0.08)',
                                    border: '1px solid rgba(16, 185, 129, 0.2)',
                                    color: 'var(--text-primary)'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: '#10b981' }}>
                                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                      Thoughtful (2-15s)
                                    </div>
                                    <div style={{ marginTop: '2px', color: 'var(--text-secondary)' }}>
                                      <strong>{v.thoughtfulCount}</strong> ({thoughtfulPct}%) • {v.thoughtfulAccuracy !== null ? `${v.thoughtfulAccuracy}% acc` : 'N/A'}
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#10b981', marginTop: '2px' }}>
                                      Full points window
                                    </div>
                                  </div>

                                  {v.lateCount > 0 && (
                                    <div style={{
                                      padding: '6px 8px',
                                      borderRadius: '6px',
                                      background: 'rgba(245, 158, 11, 0.08)',
                                      border: '1px solid rgba(245, 158, 11, 0.2)',
                                      color: 'var(--text-primary)'
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: '#f59e0b' }}>
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }}></span>
                                        Late (&gt;25s)
                                      </div>
                                      <div style={{ marginTop: '2px', color: 'var(--text-secondary)' }}>
                                        <strong>{v.lateCount}</strong> ({latePct}%)
                                      </div>
                                    </div>
                                  )}

                                  <div style={{
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    background: 'rgba(99, 102, 241, 0.08)',
                                    border: '1px solid rgba(99, 102, 241, 0.2)',
                                    color: 'var(--text-primary)'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: '#6366f1' }}>
                                      <span>🛡️</span>
                                      Focus Integrity
                                    </div>
                                    <div style={{ marginTop: '2px', color: 'var(--text-secondary)' }}>
                                      <strong>{v.focusRate !== undefined ? `${v.focusRate}%` : '100%'}</strong> stayed in-tab
                                    </div>
                                    {v.focusLostCount > 0 && (
                                      <div style={{ fontSize: '10px', color: '#f59e0b', marginTop: '2px' }}>
                                        {v.focusLostCount} switched away
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })()}

                          {/* Student: Impulsive speed explanation if < 2s */}
                          {!isTeacher && q.answered && q.responseTime !== undefined && q.responseTime < 2.0 && (
                            <div style={{
                              marginTop: '12px',
                              padding: '8px 12px',
                              background: 'rgba(239, 68, 68, 0.08)',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              borderRadius: '6px',
                              fontSize: '12px',
                              color: 'var(--text-secondary)',
                              lineHeight: 1.4
                            }}>
                              <span style={{ fontWeight: 600, color: '#ef4444' }}>⚡ Impulsive Speed Notice: </span>
                              Answered in {q.responseTime}s (&lt; 2.0s human reading speed threshold). Your participation & attendance were recorded, but speed bonus was capped at 50% max points.
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
                              {qStats.velocityStats?.avgResponseTime !== undefined && (
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600 }}>
                                  ⚡ {qStats.velocityStats.avgResponseTime}s avg
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <div style={{ fontSize: isMobile ? '28px' : '32px', fontWeight: 700, letterSpacing: '-0.02em', color: scoreColor }}>
                                {q.pointsEarned || 0}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 500 }}>
                                / {q.maxPoints || 100} pts
                              </div>
                              {q.answered && q.responseTime !== undefined && (
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600 }}>
                                  ⚡ {q.responseTime}s
                                </div>
                              )}
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
