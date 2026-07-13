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
  const [selectedSession, setSelectedSession] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('sessionIndex') || 'all'
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

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
      }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

  const displayedQuestions = selectedSession === 'all' 
    ? questions 
    : questions.filter(q => (q.sessionIndex || 1) === Number(selectedSession))

  const derivedStats = (() => {
    if (user?.role === 'student') {
      return {
        totalQuestions: displayedQuestions.length,
        totalResponses: stats.totalResponses,
        totalCorrect: stats.totalCorrect,
        averageScore: stats.averageScore
      }
    }

    let totalResponses = 0
    let totalCorrect = 0
    
    displayedQuestions.forEach(q => {
      const qStats = responses[q._id] || {}
      totalResponses += (qStats.totalResponses || 0)
      totalCorrect += (qStats.correctCount || 0)
    })
    
    const averageScore = totalResponses > 0 ? Math.round((totalCorrect / totalResponses) * 100) : 0
    
    return {
      totalQuestions: displayedQuestions.length,
      totalResponses,
      totalCorrect,
      averageScore
    }
  })()

  const uniqueSessions = Array.from(new Set(questions.map(q => q.sessionIndex || 1))).sort((a, b) => b - a)

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <Sidebar user={user} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px' }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
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
                cursor: 'pointer'
              }}
            >
              ← Back to History
            </button>

            {/* Session Filter Dropdown (Teacher Only) */}
            {user?.role === 'teacher' && uniqueSessions.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>🗓️ Session Filter:</span>
                <select
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value)}
                  style={{
                    padding: '8px 16px',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    boxShadow: 'var(--card-shadow)',
                    outline: 'none'
                  }}
                >
                  <option value="all">All Sessions Combined</option>
                  {uniqueSessions.map(idx => (
                    <option key={idx} value={idx}>Session {idx}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
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
              <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)' }}>{derivedStats.totalQuestions}</div>
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
              <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)' }}>{derivedStats.totalResponses}</div>
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
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#059669' }}>{derivedStats.averageScore}%</div>
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
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#3b82f6' }}>{derivedStats.totalCorrect}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Correct Answers</div>
            </div>
          </div>

          {/* Teacher Intuition Audit Dashboard */}
          {user?.role === 'teacher' && (() => {
            const calibratedQuestions = displayedQuestions.filter(q => q.predictedAccuracy !== undefined && q.predictedAccuracy !== null)
            const totalCalibrated = calibratedQuestions.length
            
            if (totalCalibrated === 0) return null

            let sumDrift = 0
            let sumAbsoluteError = 0
            
            calibratedQuestions.forEach(q => {
              const qStats = responses[q._id] || {}
              const actualAcc = qStats.totalResponses > 0 
                ? Math.round((qStats.correctCount / qStats.totalResponses) * 100)
                : 0
              sumDrift += (q.predictedAccuracy - actualAcc)
              sumAbsoluteError += Math.abs(q.predictedAccuracy - actualAcc)
            })

            const averageDrift = Math.round(sumDrift / totalCalibrated)
            const meanAbsoluteError = Math.round(sumAbsoluteError / totalCalibrated)
            const calibrationScore = 100 - meanAbsoluteError

            let advice = "Your teaching intuition perfectly mirrors your class's actual comprehension."
            let classification = "Perfect Alignment"
            let badgeBg = "rgba(16, 185, 129, 0.1)"
            let badgeColor = "#10b981"

            if (averageDrift > 5) {
              advice = "You consistently overestimate student understanding. Consider slowing down explanation of concepts or offering more fundamental exercises."
              classification = "Overestimating Comprehension"
              badgeBg = "rgba(239, 68, 68, 0.1)"
              badgeColor = "#ef4444"
            } else if (averageDrift < -5) {
              advice = "Your students are understanding concepts faster than you expect! You have room to accelerate the pace of your lectures."
              classification = "Underestimating Comprehension"
              badgeBg = "rgba(245, 158, 11, 0.1)"
              badgeColor = "#f59e0b"
            }

            // Generate chronological chart data (oldest first)
            const chronologicalCalibrations = [...calibratedQuestions]
              .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

            const chartData = chronologicalCalibrations.map((q, idx) => {
              const qStats = responses[q._id] || {}
              const actual = qStats.totalResponses > 0 
                ? Math.round((qStats.correctCount / qStats.totalResponses) * 100)
                : 0
              return {
                index: idx + 1,
                predicted: q.predictedAccuracy,
                actual,
                date: new Date(q.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              }
            })

            const renderCalibrationChart = () => {
              if (chartData.length < 2) {
                const singlePoint = chartData[0]
                return (
                  <div style={{
                    marginTop: '20px',
                    padding: '16px',
                    background: 'var(--bg-secondary)',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                    textAlign: 'center'
                  }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                      📊 Single Poll Calibration Comparison
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '300px', margin: '0 auto' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          <span>Predicted Accuracy</span>
                          <span style={{ fontWeight: '600', color: '#3b82f6' }}>{singlePoint.predicted}%</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${singlePoint.predicted}%`, height: '100%', background: '#3b82f6', borderRadius: '4px' }} />
                        </div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          <span>Actual Accuracy</span>
                          <span style={{ fontWeight: '600', color: '#10b981' }}>{singlePoint.actual}%</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${singlePoint.actual}%`, height: '100%', background: '#10b981', borderRadius: '4px' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }

              const width = 500
              const height = 180
              const paddingLeft = 40
              const paddingRight = 20
              const paddingTop = 20
              const paddingBottom = 30

              const getX = (i) => {
                const step = (width - paddingLeft - paddingRight) / (chartData.length - 1)
                return paddingLeft + i * step
              }

              const getY = (val) => {
                const plotHeight = height - paddingTop - paddingBottom
                return height - paddingBottom - (val / 100) * plotHeight
              }

              const predictedPoints = chartData.map((d, i) => `${getX(i)},${getY(d.predicted)}`)
              const predictedPath = `M ${predictedPoints.join(' L ')}`

              const actualPoints = chartData.map((d, i) => `${getX(i)},${getY(d.actual)}`)
              const actualPath = `M ${actualPoints.join(' L ')}`

              return (
                <div style={{
                  marginTop: '20px',
                  padding: '16px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                      📈 Calibration Trend Over Time (Polls Chronology)
                    </h3>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#3b82f6', fontWeight: '600' }}>
                        <span style={{ width: '10px', height: '10px', background: '#3b82f6', borderRadius: '2px', display: 'inline-block' }} /> Your Guess
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', fontWeight: '600' }}>
                        <span style={{ width: '10px', height: '10px', background: '#10b981', borderRadius: '2px', display: 'inline-block' }} /> Class Actual
                      </span>
                    </div>
                  </div>

                  <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '180px', overflow: 'visible' }}>
                    {/* Y-Axis Guidelines */}
                    {[0, 25, 50, 75, 100].map((level) => {
                      const y = getY(level)
                      return (
                        <g key={level}>
                          <line
                            x1={paddingLeft}
                            y1={y}
                            x2={width - paddingRight}
                            y2={y}
                            stroke="var(--border-color)"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                          />
                          <text
                            x={paddingLeft - 8}
                            y={y + 4}
                            fontSize="9"
                            fill="var(--text-secondary)"
                            textAnchor="end"
                          >
                            {level}%
                          </text>
                        </g>
                      )
                    })}

                    {/* X-Axis Labels */}
                    {chartData.map((d, i) => {
                      const x = getX(i)
                      return (
                        <g key={i}>
                          <line
                            x1={x}
                            y1={height - paddingBottom}
                            x2={x}
                            y2={height - paddingBottom + 4}
                            stroke="var(--border-color)"
                            strokeWidth="1.5"
                          />
                          <text
                            x={x}
                            y={height - paddingBottom + 16}
                            fontSize="9"
                            fill="var(--text-secondary)"
                            textAnchor="middle"
                          >
                            Q{d.index}
                          </text>
                        </g>
                      )
                    })}

                    {/* Gradient under Actual curve */}
                    <path
                      d={`${actualPath} L ${getX(chartData.length - 1)},${getY(0)} L ${getX(0)},${getY(0)} Z`}
                      fill="url(#green-grad)"
                      opacity="0.05"
                    />

                    {/* Predicted Line (Blue) */}
                    <path
                      d={predictedPath}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Actual Line (Green) */}
                    <path
                      d={actualPath}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Data Point Circles */}
                    {chartData.map((d, i) => (
                      <g key={i}>
                        {/* Guess point */}
                        <circle
                          cx={getX(i)}
                          cy={getY(d.predicted)}
                          r="4"
                          fill="white"
                          stroke="#3b82f6"
                          strokeWidth="2"
                        />
                        {/* Actual point */}
                        <circle
                          cx={getX(i)}
                          cy={getY(d.actual)}
                          r="4"
                          fill="white"
                          stroke="#10b981"
                          strokeWidth="2"
                        />
                      </g>
                    ))}

                    <defs>
                      <linearGradient id="green-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              )
            }

            return (
              <div style={{
                background: 'var(--bg-card)',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: 'var(--card-shadow)',
                border: '1px solid var(--border-color)',
                marginBottom: '24px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px' }}>🔮</span>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
                      Teacher Intuition Audit
                    </h2>
                  </div>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '700',
                    background: badgeBg,
                    color: badgeColor,
                    textTransform: 'uppercase'
                  }}>
                    {classification}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', textAlign: 'center', marginBottom: '16px' }}>
                  <div style={{ background: 'var(--bg-primary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Intuition Score</div>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: '#8b5cf6', marginTop: '4px' }}>{calibrationScore}<span style={{ fontSize: '14px', fontWeight: '500' }}>/100</span></div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Based on absolute errors</div>
                  </div>
                  <div style={{ background: 'var(--bg-primary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Average Drift</div>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: averageDrift > 0 ? '#ef4444' : averageDrift < 0 ? '#f59e0b' : '#10b981', marginTop: '4px' }}>
                      {averageDrift > 0 ? `+${averageDrift}%` : `${averageDrift}%`}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Mean prediction bias</div>
                  </div>
                  <div style={{ background: 'var(--bg-primary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Accuracy Disconnect</div>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: '#3b82f6', marginTop: '4px' }}>±{meanAbsoluteError}%</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Average calibration gap</div>
                  </div>
                </div>

                <div style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: '12px',
                  padding: '16px',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '16px'
                }}>
                  <span style={{ fontSize: '24px' }}>💡</span>
                  <div style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.5' }}>
                    <strong>Pedagogical Insight:</strong> {advice}
                  </div>
                </div>

                {renderCalibrationChart()}
              </div>
            )
          })()}

          {/* Questions Analysis */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: 'var(--card-shadow)',
            border: '1px solid var(--border-color)'
          }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Question-wise Analysis
            </h2>
            
            {displayedQuestions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                <p>No questions were asked in this session.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {displayedQuestions.map((q, index) => {
                  const qStats = responses[q._id] || {}
                  const isTeacher = user?.role === 'teacher'
                  
                  // Teacher: show class percentage. Student: show their result
                  const correctRate = isTeacher && qStats.totalResponses > 0 
                    ? Math.round((qStats.correctCount / qStats.totalResponses) * 100) 
                    : q.answered ? (q.isCorrect ? 100 : 0) : null
                  
                  return (
                    <div key={q._id} style={{
                      padding: '20px',
                      background: 'var(--bg-primary)',
                      borderRadius: '12px',
                      border: '1px solid var(--border-color)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                            <span style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: '#3b82f6',
                              color: 'white',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                              fontWeight: '700'
                            }}>
                              {index + 1}
                            </span>
                            <span style={{
                              padding: '2px 8px',
                              background: '#eff6ff',
                              color: '#3b82f6',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>
                              {q.type}
                            </span>
                            <span style={{
                              padding: '2px 8px',
                              background: '#fef3c7',
                              color: '#d97706',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>
                              {q.maxPoints || q.points} pts
                            </span>
                            {q.predictedAccuracy !== undefined && q.predictedAccuracy !== null && (
                              <span style={{
                                padding: '2px 8px',
                                background: '#e0e7ff',
                                color: '#4338ca',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '600'
                              }}>
                                🔮 Guess: {q.predictedAccuracy}% | Actual: {correctRate}% (Drift: {q.predictedAccuracy - correctRate > 0 ? `+${q.predictedAccuracy - correctRate}` : q.predictedAccuracy - correctRate}%)
                              </span>
                            )}
                            {q.answered && (
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '600',
                                background: q.isCorrect ? '#d1fae5' : '#fee2e2',
                                color: q.isCorrect ? '#059669' : '#dc2626'
                              }}>
                                {q.isCorrect ? '✓ Correct' : '✗ Incorrect'}
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 12px' }}>
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
                                ? (isTeacher ? '#d1fae5' : (isSelected ? (isCorrect ? '#d1fae5' : '#fee2e2') : '#d1fae5'))
                                : 'var(--bg-card)'
                              const borderStyle = showAsSelected 
                                ? (isTeacher ? '2px solid #059669' : (isSelected ? '2px solid #3b82f6' : '2px solid #059669'))
                                : '1px solid var(--border-color)'
                              
                              return (
                                <div key={optIdx} style={{
                                  padding: '10px 14px',
                                  background: highlightStyle,
                                  borderRadius: '8px',
                                  border: borderStyle,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px'
                                }}>
                                  <span style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    background: isCorrect ? '#059669' : 'var(--border-color)',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    fontWeight: '700'
                                  }}>
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  <span style={{ 
                                    fontSize: '14px', 
                                    color: 'var(--text-primary)',
                                    fontWeight: isCorrect ? '600' : '400'
                                  }}>
                                    {opt.text}
                                  </span>
                                  {isTeacher && isCorrect && (
                                    <span style={{ marginLeft: 'auto', color: '#059669', fontSize: '14px' }}>✓</span>
                                  )}
                                  {!isTeacher && isSelected && (
                                    <span style={{ marginLeft: 'auto', color: '#3b82f6', fontSize: '14px' }}>Your answer</span>
                                  )}
                                  {!isTeacher && isCorrect && !isSelected && (
                                    <span style={{ marginLeft: 'auto', color: '#059669', fontSize: '14px' }}>Correct answer</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        
                        {/* Question Stats */}
                        <div style={{
                          minWidth: '120px',
                          textAlign: 'center',
                          padding: '16px',
                          background: isTeacher 
                            ? (correctRate >= 70 ? '#d1fae5' : correctRate >= 40 ? '#fef3c7' : '#fee2e2')
                            : (q.answered ? (q.isCorrect ? '#d1fae5' : '#fee2e2') : '#fef3c7'),
                          borderRadius: '12px'
                        }}>
                          {isTeacher ? (
                            <>
                              <div style={{ fontSize: '32px', fontWeight: '700', color: correctRate >= 70 ? '#059669' : correctRate >= 40 ? '#d97706' : '#dc2626' }}>
                                {correctRate !== null ? `${correctRate}%` : '0%'}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                {qStats.totalResponses || 0} responses
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ fontSize: '32px', fontWeight: '700', color: q.answered ? (q.isCorrect ? '#059669' : '#dc2626') : '#d97706' }}>
                                {q.pointsEarned || 0}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
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