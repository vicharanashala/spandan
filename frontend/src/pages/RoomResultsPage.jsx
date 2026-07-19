import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import { API_URL } from '../config.js'
import { fetchAllRoomQuestions } from '../services/questionService'
import {
  fetchInterventionConfig,
  fetchFlaggedQuestions,
  publishIntervention,
  fetchRoomInterventions,
  submitInterventionResponse,
  fetchInterventionAnalytics
} from '../services/interventionService'

// Display labels for the three intervention types. Must stay in sync with the backend enum
// (INTERVENTION_TYPES in backend/src/models/QuestionIntervention.js).
const INTERVENTION_TYPE_LABELS = {
  need_notes: 'Need Notes',
  need_question_explanation: 'Need Question Explanation',
  need_topic_again: 'Need Topic Explained Again'
}

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

  // --- Post-Session Question Intervention state ---
  // Threshold + defaults are read from the backend (never hardcoded on the client).
  const [interventionConfig, setInterventionConfig] = useState(null)
  const [flaggedQuestions, setFlaggedQuestions] = useState([])
  const [interventions, setInterventions] = useState([])
  // Publisher modal state — only teacher uses this.
  const [publisherQuestion, setPublisherQuestion] = useState(null)
  const [publisherType, setPublisherType] = useState('need_notes')
  const [publisherText, setPublisherText] = useState('')
  const [publisherUrl, setPublisherUrl] = useState('')
  const [publisherDeadlineMode, setPublisherDeadlineMode] = useState('relative')
  const [publisherDeadlineValue, setPublisherDeadlineValue] = useState('')
  const [publisherError, setPublisherError] = useState('')
  const [publisherBusy, setPublisherBusy] = useState(false)
  // Per-intervention analytics cache so we don't refetch when re-opening.
  const [analyticsCache, setAnalyticsCache] = useState({})
  // Inline message after student submits/responds/saves.
  const [interventionNotice, setInterventionNotice] = useState('')

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      fetchRoomData()
      loadInterventionConfig()
    }
  }, [token, roomId])

  // Load interventions once the room is known to be ended. Endpoint-per-role:
  // teacher → GET /api/interventions/room/:id (with flagged questions), student → GET /api/interventions/room/:id (filtered).
  useEffect(() => {
    if (!token || !roomId || !room?.endedAt) return
    loadInterventions()
    if (user?.role === 'teacher') loadFlaggedQuestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, roomId, room?.endedAt, user?.role])

  const loadInterventionConfig = async () => {
    try {
      const cfg = await fetchInterventionConfig(token)
      setInterventionConfig(cfg)
      // Seed the publisher's relative-deadline default with the backend's suggestion.
      if (cfg?.defaultRelativeHours && !publisherDeadlineValue) {
        setPublisherDeadlineValue(String(cfg.defaultRelativeHours))
      }
    } catch (e) { console.warn('[intervention] config:', e.message) }
  }

  const loadFlaggedQuestions = async () => {
    try {
      const { flagged } = await fetchFlaggedQuestions(token, roomId)
      setFlaggedQuestions(flagged)
    } catch (e) { console.warn('[intervention] flagged:', e.message) }
  }

  const loadInterventions = async () => {
    try {
      const list = await fetchRoomInterventions(token, roomId)
      setInterventions(list)
    } catch (e) { console.warn('[intervention] list:', e.message) }
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

  // ---- Intervention handlers -----------------------------------------------------------
  // Teacher opens the publisher modal for a specific question.
  const openPublisher = (question) => {
    setPublisherQuestion(question)
    setPublisherType('need_notes')
    setPublisherText('')
    setPublisherUrl('')
    setPublisherDeadlineMode('relative')
    setPublisherDeadlineValue(String(interventionConfig?.defaultRelativeHours || 12))
    setPublisherError('')
  }
  const closePublisher = () => {
    if (publisherBusy) return
    setPublisherQuestion(null)
  }
  const submitPublisher = async () => {
    if (!publisherQuestion) return
    setPublisherError('')
    setPublisherBusy(true)
    try {
      const intervention = await publishIntervention(token, {
        questionId: publisherQuestion._id || publisherQuestion.questionId,
        type: publisherType,
        content: { text: publisherText, url: publisherUrl },
        deadlineMode: publisherDeadlineMode,
        deadlineValue: publisherDeadlineMode === 'relative'
          ? publisherDeadlineValue
          : publisherDeadlineValue
      })
      setInterventions((prev) => {
        const without = prev.filter((p) => p._id !== intervention._id)
        return [intervention, ...without]
      })
      setPublisherQuestion(null)
    } catch (e) {
      setPublisherError(e.message || 'Failed to publish intervention')
    } finally {
      setPublisherBusy(false)
    }
  }

  // Student submits one selected type (single radio choice) before the deadline.
  const handleRespond = async (intervention, selectedType) => {
    setInterventionNotice('')
    try {
      const r = await submitInterventionResponse(token, intervention._id, selectedType)
      setInterventions((prev) => prev.map((i) => i._id === intervention._id
        ? { ...i, studentSelectedType: r.selectedType, studentSavedAt: r.savedAt }
        : i))
      setInterventionNotice(`Recorded: ${INTERVENTION_TYPE_LABELS[selectedType]}`)
    } catch (e) {
      setInterventionNotice(e.message)
    }
  }

  // Build an exportable plain-text file from the intervention content and trigger a browser
  // download. This is the student's "save" action — material is written to their own device,
  // not merely flagged as persistent in the app's database. Pure client-side; no backend call.
  // The downloaded file includes both the notes text and the URL (if any) so the student has
  // everything in a single artifact on disk, even after the 3-day retention window closes.
  const downloadIntervention = (intervention) => {
    const parts = []
    parts.push(`Type: ${intervention.typeLabel || INTERVENTION_TYPE_LABELS[intervention.type] || intervention.type}`)
    if (intervention.createdAt) parts.push(`Published: ${new Date(intervention.createdAt).toLocaleString()}`)
    if (intervention.deadlineAt) parts.push(`Response deadline: ${new Date(intervention.deadlineAt).toLocaleString()}`)
    parts.push('')
    if (intervention.content?.text) {
      parts.push('--- Notes ---')
      parts.push(intervention.content.text)
      parts.push('')
    }
    if (intervention.content?.url) {
      parts.push('--- Link ---')
      parts.push(intervention.content.url)
      parts.push('')
    }
    const text = parts.join('\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeType = String(intervention.type || 'intervention').replace(/[^a-z0-9_]/gi, '_')
    const date = intervention.createdAt ? new Date(intervention.createdAt) : new Date()
    a.download = `intervention_${safeType}_${date.toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Revoke after the click has been processed by the browser.
    setTimeout(() => URL.revokeObjectURL(url), 0)
    setInterventionNotice(`Downloaded as ${a.download}. The file is on your device — view it anytime, even after this session ends.`)
  }

  const loadAnalytics = async (interventionId) => {
    if (analyticsCache[interventionId]) return analyticsCache[interventionId]
    try {
      const a = await fetchInterventionAnalytics(token, interventionId)
      setAnalyticsCache((prev) => ({ ...prev, [interventionId]: a }))
      return a
    } catch (e) {
      console.warn('[intervention] analytics:', e.message)
      return null
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
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
            {/* Role-specific card (3rd): teacher sees total students in the room; student sees their rank */}
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)',
              textAlign: 'center'
            }}>
              {user?.role === 'teacher' ? (
                <>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>🧑‍🎓</div>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)' }}>{stats.totalStudents || 0}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Students</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏅</div>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b' }}>{stats.userRank ? `#${stats.userRank}` : '—'}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Your Rank</div>
                </>
              )}
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
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Question-wise Analysis
            </h2>
            
            {questions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                <p>No questions were asked in this room.</p>
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

                  // Accuracy = correct / total eligible (room-wide joined students).
                  // Used for the "flagged" badge for teachers. The room-wide totalJoined is
                  // shared across all questions in the room — non-responders are in the denominator
                  // but not the numerator, matching the brief's accuracy formula.
                  const flagged = isTeacher && interventionConfig && stats.totalStudents > 0
                    ? (qStats.correctCount || 0) / stats.totalStudents < interventionConfig.threshold
                    : false

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
                            {flagged && (
                              <span
                                title={`Accuracy is below the configured intervention threshold (${interventionConfig.thresholdPercent}%). Click "Add Intervention" to publish supporting content for this question.`}
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  background: '#fee2e2',
                                  color: '#dc2626',
                                  border: '1px solid #fca5a5'
                                }}
                              >
                                🚩 Flagged
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
                          {/* Teacher: Add-intervention button on flagged questions. */}
                          {isTeacher && flagged && room?.endedAt && (
                            <button
                              onClick={() => openPublisher(q)}
                              style={{
                                marginTop: '16px',
                                padding: '8px 16px',
                                background: '#7c3aed',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              🛟 Add Intervention
                            </button>
                          )}
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

          {/* Post-Session Question Interventions */}
          {room?.endedAt && (
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)',
              marginTop: '24px'
            }}>
              <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
                🛟 Question Interventions
              </h2>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                {user?.role === 'teacher'
                  ? `Interventions appear here once published. Flagged questions (accuracy below ${interventionConfig?.thresholdPercent ?? '...'}%) get an "Add Intervention" button in the analysis above.`
                  : 'Interventions are notes, explanations, or follow-ups your teacher published for questions the class struggled with.'}
              </p>

              {interventionNotice && (
                <div style={{
                  padding: '10px 14px',
                  background: '#eff6ff',
                  color: '#1e40af',
                  borderRadius: '8px',
                  fontSize: '13px',
                  marginBottom: '12px',
                  border: '1px solid #bfdbfe'
                }}>
                  {interventionNotice}
                </div>
              )}

              {interventions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                  No interventions have been published for this session yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {interventions.map((iv) => {
                    const deadlineMs = iv.deadlineAt ? new Date(iv.deadlineAt).getTime() : 0
                    const pastDeadline = deadlineMs > 0 && deadlineMs <= Date.now()
                    const expiresMs = iv.contentExpiresAt ? new Date(iv.contentExpiresAt).getTime() : 0
                    const pastRetention = expiresMs > 0 && expiresMs <= Date.now()
                    const isTeacher = user?.role === 'teacher'
                    return (
                      <div key={iv._id} style={{
                        padding: '16px',
                        background: 'var(--bg-primary)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-color)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                          <span style={{
                            padding: '4px 10px',
                            background: '#ede9fe',
                            color: '#5b21b6',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}>
                            {iv.typeLabel || INTERVENTION_TYPE_LABELS[iv.type] || iv.type}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            Deadline: {deadlineMs ? new Date(deadlineMs).toLocaleString() : '—'}
                          </span>
                          {pastDeadline && (
                            <span style={{
                              padding: '2px 8px',
                              background: '#fef3c7',
                              color: '#92400e',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>
                              Response closed
                            </span>
                          )}
                        </div>

                        {iv.contentVisible ? (
                          <>
                            {iv.content?.text && (
                              <p style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                                {iv.content.text}
                              </p>
                            )}
                            {iv.content?.url && (
                              <p style={{ margin: '0 0 8px', fontSize: '14px' }}>
                                <a href={iv.content.url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
                                  🔗 {iv.content.url}
                                </a>
                              </p>
                            )}
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                              Visible until: {expiresMs ? new Date(expiresMs).toLocaleDateString() : '—'}
                            </div>
                          </>
                        ) : (
                          <p style={{ margin: '0', fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            This intervention's content has expired and was not saved.
                          </p>
                        )}

                        {/* Student: respond (single-select radio) + save */}
                        {!isTeacher && iv.contentVisible && (
                          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                            {pastDeadline ? (
                              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0' }}>
                                The response deadline has passed.
                              </p>
                            ) : (
                              <>
                                <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: '0 0 8px', fontWeight: '600' }}>
                                  What would help you most for this question?
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                                  {Object.entries(INTERVENTION_TYPE_LABELS).map(([key, label]) => (
                                    <label key={key} style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      cursor: 'pointer',
                                      fontSize: '13px',
                                      color: 'var(--text-primary)'
                                    }}>
                                      <input
                                        type="radio"
                                        name={`iv-${iv._id}`}
                                        value={key}
                                        checked={iv.studentSelectedType === key}
                                        onChange={() => handleRespond(iv, key)}
                                        style={{ cursor: 'pointer' }}
                                      />
                                      {label}
                                    </label>
                                  ))}
                                </div>
                              </>
                            )}
                            {(iv.content?.text || iv.content?.url) && (
                              <button
                                onClick={() => downloadIntervention(iv)}
                                style={{
                                  marginTop: '8px',
                                  padding: '6px 14px',
                                  background: 'transparent',
                                  color: '#7c3aed',
                                  border: '1px solid #7c3aed',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  cursor: 'pointer'
                                }}
                              >
                                ⬇ Download
                              </button>
                            )}
                          </div>
                        )}

                        {/* Teacher: per-intervention analytics */}
                        {isTeacher && (
                          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                            <button
                              onClick={() => loadAnalytics(iv._id)}
                              style={{
                                padding: '6px 14px',
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              View response analytics
                            </button>
                            {analyticsCache[iv._id] && (
                              <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text-primary)' }}>
                                <div style={{ fontWeight: '600', marginBottom: '6px' }}>
                                  Total responses: {analyticsCache[iv._id].totalResponses}
                                </div>
                                {Object.entries(analyticsCache[iv._id].counts || {}).map(([k, v]) => (
                                  <div key={k} style={{ color: 'var(--text-secondary)' }}>
                                    {INTERVENTION_TYPE_LABELS[k] || k}: {v}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Publisher modal (teacher only) */}
          {publisherQuestion && (
            <div
              onClick={closePublisher}
              style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'white',
                  borderRadius: '16px',
                  padding: '32px',
                  width: '90%',
                  maxWidth: '560px',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
                }}
              >
                <h3 style={{ margin: '0 0 16px', fontSize: '20px', fontWeight: '700', color: '#1f2937' }}>
                  Publish Intervention
                </h3>
                <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#6b7280' }}>
                  For: <strong>{publisherQuestion.question}</strong>
                </p>

                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                  Type
                </label>
                <select
                  value={publisherType}
                  onChange={(e) => setPublisherType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                    marginBottom: '16px',
                    background: 'white',
                    color: '#1f2937'
                  }}
                >
                  {Object.entries(INTERVENTION_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>

                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                  Notes / Explanation (text)
                </label>
                <textarea
                  value={publisherText}
                  onChange={(e) => setPublisherText(e.target.value)}
                  rows={5}
                  placeholder="Write the notes, explanation, or follow-up here…"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                    marginBottom: '16px',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />

                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                  Link (optional)
                </label>
                <input
                  type="url"
                  value={publisherUrl}
                  onChange={(e) => setPublisherUrl(e.target.value)}
                  placeholder="https://…"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                    marginBottom: '16px'
                  }}
                />

                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                  Response deadline
                </label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                    <input
                      type="radio"
                      name="deadlineMode"
                      value="relative"
                      checked={publisherDeadlineMode === 'relative'}
                      onChange={() => {
                        setPublisherDeadlineMode('relative')
                        setPublisherDeadlineValue(String(interventionConfig?.defaultRelativeHours || 12))
                      }}
                    />
                    Relative (hours)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                    <input
                      type="radio"
                      name="deadlineMode"
                      value="absolute"
                      checked={publisherDeadlineMode === 'absolute'}
                      onChange={() => {
                        setPublisherDeadlineMode('absolute')
                        setPublisherDeadlineValue('')
                      }}
                    />
                    Absolute (date+time)
                  </label>
                </div>
                {publisherDeadlineMode === 'relative' ? (
                  <input
                    type="number"
                    min="0.0167"
                    step="0.5"
                    value={publisherDeadlineValue}
                    onChange={(e) => setPublisherDeadlineValue(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '14px',
                      marginBottom: '16px'
                    }}
                  />
                ) : (
                  <input
                    type="datetime-local"
                    value={publisherDeadlineValue}
                    onChange={(e) => setPublisherDeadlineValue(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '14px',
                      marginBottom: '16px'
                    }}
                  />
                )}

                {publisherError && (
                  <div style={{
                    padding: '10px',
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    fontSize: '13px',
                    marginBottom: '12px'
                  }}>
                    {publisherError}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    onClick={closePublisher}
                    disabled={publisherBusy}
                    style={{
                      padding: '10px 20px',
                      background: '#e5e7eb',
                      color: '#374151',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: publisherBusy ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitPublisher}
                    disabled={publisherBusy}
                    style={{
                      padding: '10px 20px',
                      background: publisherBusy ? '#9ca3af' : '#7c3aed',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: publisherBusy ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {publisherBusy ? 'Publishing…' : 'Publish'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default RoomResultsPage