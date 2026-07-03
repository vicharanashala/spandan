import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import { API_URL } from '../config.js'

function RoomResultsPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { setAuthToken } = useRoomStore()
  
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

  const [bookmarked, setBookmarked] = useState(new Set())
  const [showReviewTab, setShowReviewTab] = useState(false)
  const [expandedQuestions, setExpandedQuestions] = useState({})

  const toggleBookmark = (qId) => {
    setBookmarked(prev => {
      const next = new Set(prev)
      next.has(qId) ? next.delete(qId) : next.add(qId)
      return next
    })
  }

  const toggleExpand = (qId) => {
    setExpandedQuestions(prev => ({
      ...prev,
      [qId]: !prev[qId]
    }))
  }

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

      // Fetch questions for this room
      const qRes = await fetch(`${API_URL}/questions?roomId=${roomId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const qData = await qRes.json()
      const roomQuestions = qData.questions || []

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
        // Teacher: set questions from API
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
          totalStudents: uniqueStudents,
          participationRate: Math.min(participationRate, 100)
        })
      }
    } catch (err) {
      console.error('Failed to fetch room results:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      fetchRoomData()
    }
  }, [token, roomId])

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
      }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: 'var(--sidebar-width)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid var(--border-color)',
              borderTopColor: '#3b82f6',
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

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <Sidebar user={user} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 'var(--sidebar-width)' }}>
        {/* Header */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: '24px 32px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>
                📊 {room?.name || 'Room'} Results
              </h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
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
        <div style={{ flex: 1, padding: '32px' }}>
          {/* Back Button */}
          <button
            onClick={() => navigate(`/${user?.role === 'teacher' ? 'teacher' : 'student'}/room-history`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '8px 12px',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer',
              marginBottom: '20px'
            }}
          >
            ←
          </button>
          
          {/* Overview Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📝</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)' }}>{questions.length}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Questions</div>
            </div>
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>👥</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)' }}>{stats.totalResponses}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Responses</div>
            </div>
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#059669' }}>{stats.averageScore}%</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Average Score</div>
            </div>
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎯</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#3b82f6' }}>{stats.totalCorrect}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Correct Answers</div>
            </div>
          </div>

          {/* Questions Analysis */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: 'var(--card-shadow)',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', flex: 1 }}>
                Question-wise Analysis
              </h2>
              {user?.role === 'student' && bookmarked.size > 0 && (
                <button
                  onClick={() => setShowReviewTab(v => !v)}
                  style={{
                    padding: '6px 14px', background: showReviewTab ? '#f59e0b' : 'transparent',
                    border: '1px solid #f59e0b', borderRadius: '8px',
                    color: showReviewTab ? 'white' : '#f59e0b', fontSize: '12px',
                    fontWeight: '600', cursor: 'pointer'
                  }}
                >
                  📌 Review Later ({bookmarked.size})
                </button>
              )}
            </div>
            
            {questions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                <p>No questions were asked in this room.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(showReviewTab ? questions.filter(q => bookmarked.has(q._id)) : questions).map((q, index) => {
                  const qStats = responses[q._id] || {}
                  const isTeacher = user?.role === 'teacher'
                  const totalResp = qStats.totalResponses || 0
                  const correctRate = isTeacher && totalResp > 0
                    ? Math.round((qStats.correctCount / totalResp) * 100)
                    : q.answered ? (q.isCorrect ? 100 : 0) : null
                  const attemptedPct = isTeacher && stats.totalStudents > 0
                    ? Math.round((totalResp / stats.totalStudents) * 100)
                    : null
                  const isStruggle = isTeacher && correctRate !== null && correctRate < 70
                  const isExpanded = !!expandedQuestions[q._id]

                  return (
                    <div key={q._id} style={{
                      background: 'var(--bg-primary)',
                      borderRadius: '10px',
                      border: `1px solid ${isStruggle ? '#fca5a5' : 'var(--border-color)'}`,
                      overflow: 'hidden'
                    }}>
                      {/* Compact header - always visible */}
                      <div
                        onClick={() => toggleExpand(q._id)}
                        style={{
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer'
                        }}
                      >
                        <span style={{
                          width: '24px', height: '24px', borderRadius: '50%',
                          background: '#3b82f6', color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '11px', fontWeight: '700', flexShrink: 0
                        }}>{index + 1}</span>

                        <span style={{
                          padding: '2px 6px', background: '#eff6ff', color: '#3b82f6',
                          borderRadius: '4px', fontSize: '10px', fontWeight: '600', flexShrink: 0
                        }}>{q.type}</span>

                        <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', flex: 1, lineHeight: '1.4' }}>
                          {q.question}
                        </span>

                        {/* Right side stats */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          {isTeacher ? (
                            <>
                              {attemptedPct !== null && (
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                  {attemptedPct}% attempted
                                </span>
                              )}
                              <span style={{
                                padding: '4px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: '700',
                                background: correctRate >= 70 ? '#d1fae5' : correctRate >= 40 ? '#fef3c7' : '#fee2e2',
                                color: correctRate >= 70 ? '#059669' : correctRate >= 40 ? '#d97706' : '#dc2626'
                              }}>
                                {correctRate !== null ? `${correctRate}%` : '—'}
                              </span>
                              {isStruggle && <span style={{ fontSize: '14px' }} title="Class struggled here">⚠️</span>}
                            </>
                          ) : (
                            <>
                              {q.answered && (
                                <span style={{
                                  padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                                  background: q.isCorrect ? '#d1fae5' : '#fee2e2',
                                  color: q.isCorrect ? '#059669' : '#dc2626'
                                }}>
                                  {q.isCorrect ? '✓' : '✗'} {q.pointsEarned || 0}pts
                                </span>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleBookmark(q._id) }}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  fontSize: '16px', opacity: bookmarked.has(q._id) ? 1 : 0.4
                                }}
                                title="Save for Review Later"
                              >📌</button>
                            </>
                          )}
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>

                      {/* Expanded options */}
                      {isExpanded && (
                        <div style={{ padding: '0 16px 14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {q.options && q.options.map((opt, optIdx) => {
                              const isCorrect = opt.isCorrect
                              const isSelected = q.selectedOption === optIdx
                              const optCount = qStats.answerCounts?.[optIdx] || 0
                              const optPct = totalResp > 0 ? Math.round((optCount / totalResp) * 100) : 0

                              let bg = 'var(--bg-card)', border = '1px solid var(--border-color)'
                              if (isTeacher) {
                                if (isCorrect) { bg = '#d1fae5'; border = '1px solid #059669' }
                              } else {
                                if (isSelected && isCorrect) { bg = '#d1fae5'; border = '1px solid #059669' }
                                else if (isSelected && !isCorrect) { bg = '#fee2e2'; border = '1px solid #dc2626' }
                                else if (!isSelected && isCorrect) { bg = '#eff6ff'; border = '1px solid #3b82f6' }
                              }

                              return (
                                <div key={optIdx}>
                                  <div style={{
                                    padding: '8px 12px', background: bg, borderRadius: '8px',
                                    border, display: 'flex', alignItems: 'center', gap: '10px'
                                  }}>
                                    <span style={{
                                      width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                                      background: isCorrect ? '#059669' : 'var(--border-color)',
                                      color: 'white', display: 'flex', alignItems: 'center',
                                      justifyContent: 'center', fontSize: '10px', fontWeight: '700'
                                    }}>{String.fromCharCode(65 + optIdx)}</span>
                                    <span style={{ fontSize: '13px', color: isCorrect ? '#065f46' : 'var(--text-primary)', flex: 1, fontWeight: isCorrect ? '600' : '400' }}>
                                      {opt.text}
                                    </span>
                                    {!isTeacher && isSelected && (
                                      <span style={{ fontSize: '11px', color: isCorrect ? '#059669' : '#dc2626', fontWeight: '600' }}>
                                        {isCorrect ? '✓ Your answer' : '✗ Your answer'}
                                      </span>
                                    )}
                                    {!isTeacher && !isSelected && isCorrect && (
                                      <span style={{ fontSize: '11px', color: '#3b82f6', fontWeight: '600' }}>Correct</span>
                                    )}
                                    {isTeacher && (
                                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '500', whiteSpace: 'nowrap' }}>
                                        {optPct}% ({optCount})
                                      </span>
                                    )}
                                  </div>
                                  {/* % bar under each option - teacher only */}
                                  {isTeacher && totalResp > 0 && (
                                    <div style={{ height: '3px', background: 'var(--border-color)', borderRadius: '2px', margin: '2px 0 4px', overflow: 'hidden' }}>
                                      <div style={{
                                        height: '100%', width: `${optPct}%`,
                                        background: isCorrect ? '#059669' : '#94a3b8',
                                        transition: 'width 0.4s ease'
                                      }} />
                                    </div>
                                  )}
                                  {/* Explanation under correct answer - student only */}
                                  {!isTeacher && isCorrect && q.explanation && (
                                    <div style={{
                                      margin: '4px 0 2px',
                                      padding: '8px 12px',
                                      background: '#eff6ff',
                                      borderRadius: '6px',
                                      fontSize: '12px',
                                      color: '#1e40af'
                                    }}>
                                      💡 {q.explanation}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
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

export default RoomResultsPage;