import React, { useState, useEffect, useMemo } from 'react'
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
  const [sessionSummary, setSessionSummary] = useState(null)
  const [studentAnalysis, setStudentAnalysis] = useState(null)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [regenerateError, setRegenerateError] = useState(null)
  const [regenerateCooldownUntil, setRegenerateCooldownUntil] = useState(0)
  const [, setCooldownTick] = useState(0) // forces re-render while cooldown counts down

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

  const handleRegenerateSummary = async () => {
    if (isRegenerating) return
    if (Date.now() < regenerateCooldownUntil) return

    setIsRegenerating(true)
    setRegenerateError(null)

    try {
      const res = await fetch(`${API_URL}/summary/generate/${roomId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 429) {
        setRegenerateError(data.error || 'Please wait before regenerating again')
      } else if (res.ok && data.summary) {
        setSessionSummary(data.summary)
      } else {
        setRegenerateError(data.error || 'Failed to regenerate summary. Please try again.')
      }
    } catch (err) {
      console.error('Failed to regenerate summary:', err)
      setRegenerateError('Network error while regenerating. Please try again.')
    } finally {
      // Local cooldown mirrors the backend's, so the button visibly disables
      // instead of the user hitting 429s repeatedly.
      setRegenerateCooldownUntil(Date.now() + 15000)
      setIsRegenerating(false)
    }
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
        // Fetch session summary if available
        if ((roomData.room || roomData).summary) {
          setSessionSummary((roomData.room || roomData).summary)
        }
      }

      // Fetch questions for this room
      const qRes = await fetch(`${API_URL}/questions?roomId=${roomId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const qData = await qRes.json()
      const roomQuestions = qData.questions || []
      
      // If no summary in room data, try to fetch separately
      if (!sessionSummary) {
        const summaryRes = await fetch(`${API_URL}/summary/${roomId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (summaryRes.ok) {
          const summaryData = await summaryRes.json()
          if (summaryData.summary) {
            setSessionSummary(summaryData.summary)
          }
        }
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

        // Personal wrong-answer analysis + weak areas
        try {
          const analysisRes = await fetch(`${API_URL}/summary/${roomId}/student`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
          if (analysisRes.ok) {
            const analysisData = await analysisRes.json()
            if (analysisData.analysis) setStudentAnalysis(analysisData.analysis)
          }
        } catch (analysisErr) {
          console.error('Failed to fetch personal analysis:', analysisErr)
        }
        
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

  // Re-render every second while a regenerate cooldown is active, so the
  // button re-enables itself and the countdown label stays accurate.
  useEffect(() => {
    if (regenerateCooldownUntil <= Date.now()) return
    const interval = setInterval(() => {
      setCooldownTick(t => t + 1)
      if (Date.now() >= regenerateCooldownUntil) {
        clearInterval(interval)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [regenerateCooldownUntil])

  // Deterministic "class struggled here" list, computed directly from the
  // already-fetched questions/response stats — no AI call involved, so it's
  // always available (teacher view only, since only teachers get class-wide
  // stats in `responses`). This guarantees a struggle-areas view even if the
  // AI summary has never successfully generated.
  const localStruggleAreas = useMemo(() => {
    if (user?.role !== 'teacher') return []

    return questions
      .map(q => {
        const qStats = responses[q._id] || {}
        const totalResp = qStats.totalResponses || 0
        if (totalResp === 0) return null // no data yet for this question

        const correctRate = Math.round(((qStats.correctCount || 0) / totalResp) * 100)
        if (correctRate >= 70) return null // fewer than 30% got it wrong

        const correctOption = (q.options || []).find(opt => opt.isCorrect)

        return {
          id: q._id,
          question: q.question || 'Question',
          correctAnswer: correctOption?.text || correctOption || 'N/A',
          correctRate,
          totalResponses: totalResp
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.correctRate - b.correctRate)
  }, [questions, responses, user])

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

          {/* Session Summary - Both Teacher & Student */}
          <div style={{
            background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '24px',
            border: '1px solid #3b82f6'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#1e40af', flex: 1 }}>
                🤖 AI Session Summary
              </h2>
              <button
                onClick={handleRegenerateSummary}
                disabled={isRegenerating || Date.now() < regenerateCooldownUntil}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  background: (isRegenerating || Date.now() < regenerateCooldownUntil) ? '#93c5fd' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: (isRegenerating || Date.now() < regenerateCooldownUntil) ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap'
                }}
                title="Generate a fresh AI summary from the saved transcript, questions & answers"
              >
                {isRegenerating
                  ? '⏳ Regenerating...'
                  : Date.now() < regenerateCooldownUntil
                    ? `🔄 Wait ${Math.ceil((regenerateCooldownUntil - Date.now()) / 1000)}s`
                    : '🔄 Regenerate'}
              </button>
            </div>

            {regenerateError && (
              <div style={{
                padding: '8px 12px',
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#dc2626',
                marginBottom: '16px'
              }}>
                ⚠️ {regenerateError}
              </div>
            )}

            {!sessionSummary && !isRegenerating && (
              <div style={{
                padding: '14px 16px',
                background: 'white',
                borderRadius: '10px',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                textAlign: 'center'
              }}>
                No AI summary yet for this session. Click Regenerate to generate one.
              </div>
            )}

            {sessionSummary && (
              <>
              {/* Narrative Summary - 5-line AI text */}
              {sessionSummary.narrativeSummary && (
                <div style={{
                  padding: '14px 16px',
                  background: 'white',
                  borderRadius: '10px',
                  marginBottom: '16px',
                  fontSize: '13px',
                  color: '#1e40af',
                  lineHeight: '1.7',
                  fontWeight: '500'
                }}>
                  {sessionSummary.narrativeSummary}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                <div style={{ padding: '12px', background: 'white', borderRadius: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Overview</div>
                  <div style={{ fontSize: '14px', color: '#1e40af', fontWeight: '600' }}>
                    {sessionSummary.overview?.totalQuestions} questions • {sessionSummary.overview?.totalResponses} responses
                  </div>
                  <div style={{ fontSize: '14px', color: '#1e40af', fontWeight: '600' }}>
                    {sessionSummary.overview?.totalStudents} students participated
                  </div>
                </div>
                <div style={{ padding: '12px', background: 'white', borderRadius: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Performance</div>
                  <div style={{ fontSize: '14px', color: '#059669', fontWeight: '600' }}>
                    Average Score: {sessionSummary.overview?.averagePoints || 0} pts
                  </div>
                  <div style={{ fontSize: '14px', color: '#059669', fontWeight: '600' }}>
                    Participation: {sessionSummary.overview?.averageParticipation || 0}%
                  </div>
                </div>
              </div>

              {/* Struggling Questions - show where +30% got wrong */}
              {sessionSummary.strugglingQuestions && sessionSummary.strugglingQuestions.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#dc2626', marginBottom: '8px' }}>
                    ⚠️ Areas to Review ({sessionSummary.strugglingQuestions.length} — where +30% of class struggled)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {sessionSummary.strugglingQuestions.slice(0, 5).map((q, idx) => (
                      <div key={idx} style={{ padding: '10px', background: '#fef2f2', borderRadius: '8px', fontSize: '13px' }}>
                        <div style={{ fontWeight: '600', marginBottom: '2px' }}>{q.question?.substring(0, 100)}{q.question?.length > 100 ? '...' : ''}</div>
                        <div style={{ fontSize: '11px', color: '#dc2626' }}>
                          Only {q.correctnessRate}% answered correctly • {q.timesAnswered} response(s)
                        </div>
                        {q.explanation && (
                          <div style={{ fontSize: '11px', color: '#92400e', marginTop: '4px', fontStyle: 'italic' }}>
                            💡 {q.explanation}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {(sessionSummary.quickRecommendations?.length > 0 || sessionSummary.recommendations?.length > 0) && (
                <div style={{ padding: '12px', background: 'white', borderRadius: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>Quick Recommendations</div>
                  <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '13px', color: '#374151' }}>
                    {(sessionSummary.quickRecommendations || sessionSummary.recommendations || []).map((rec, idx) => (
                      <li key={idx} style={{ marginBottom: '4px' }}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
              </>
            )}
          </div>

          {/* Class Struggle Areas - deterministic, teacher-only, always available
              (computed from real response stats already loaded — no AI dependency) */}
          {user?.role === 'teacher' && localStruggleAreas.length > 0 && (
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '20px 24px',
              marginBottom: '24px',
              border: '1px solid #fca5a5',
              boxShadow: 'var(--card-shadow)'
            }}>
              <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: '600', color: '#dc2626' }}>
                ⚠️ Class Struggle Areas ({localStruggleAreas.length})
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Questions where 30%+ of the class answered incorrectly, with the correct answer
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {localStruggleAreas.map((item, idx) => (
                  <div key={item.id || idx} style={{
                    padding: '10px 12px',
                    background: '#fef2f2',
                    borderRadius: '8px',
                    fontSize: '13px'
                  }}>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      {item.question}
                    </div>
                    <div style={{ fontSize: '12px', color: '#059669', marginBottom: '2px' }}>
                      ✓ Correct answer: {item.correctAnswer}
                    </div>
                    <div style={{ fontSize: '11px', color: '#dc2626' }}>
                      Only {item.correctRate}% answered correctly • {item.totalResponses} response(s)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Personal Weak-Area Analysis - Student only */}
          {user?.role === 'student' && studentAnalysis && studentAnalysis.wrongAnswers?.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, #fef2f2, #fee2e2)',
              borderRadius: '16px',
              padding: '24px',
              marginBottom: '24px',
              border: '1px solid #fca5a5'
            }}>
              <h2 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: '600', color: '#991b1b' }}>
                🎯 Your Weak Areas ({studentAnalysis.accuracy}% accuracy overall)
              </h2>
              {studentAnalysis.weakAreas?.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  {studentAnalysis.weakAreas.map((topic, idx) => (
                    <span key={idx} style={{
                      padding: '4px 10px', background: 'white', borderRadius: '999px',
                      fontSize: '12px', fontWeight: '600', color: '#991b1b', border: '1px solid #fca5a5'
                    }}>{topic}</span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {studentAnalysis.wrongAnswers.map((w, idx) => (
                  <div key={idx} style={{ padding: '10px', background: 'white', borderRadius: '8px', fontSize: '13px' }}>
                    <div style={{ fontWeight: '600', marginBottom: '2px', color: '#1f2937' }}>{w.question}</div>
                    <div style={{ fontSize: '12px', color: '#991b1b', fontStyle: 'italic' }}>💡 {w.explanation}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                    padding: '6px 14px', background: showReviewTab ? '#3b82f6' : 'transparent',
                    border: '1px solid #3b82f6', borderRadius: '8px',
                    color: showReviewTab ? 'white' : '#3b82f6', fontSize: '12px',
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
                                    border, display: 'flex', alignItems: 'center', gap: '10px',
                                    transition: 'all 0.2s ease', cursor: 'pointer'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isTeacher) return
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.15)'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.boxShadow = 'none'
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
                                  {/* Explanation under correct answer - teacher always sees it */}
                                  {isTeacher && isCorrect && q.explanation && (
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
                                  {/* Student sees explanation only when wrong or missed */}
                                  {!isTeacher && isCorrect && q.answered && !q.isCorrect && q.explanation && (
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
                                  {!isTeacher && isCorrect && !q.answered && q.explanation && (
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