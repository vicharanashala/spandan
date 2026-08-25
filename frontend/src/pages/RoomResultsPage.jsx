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
  const [insights, setInsights] = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
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

        setStats({
          totalResponses,
          totalCorrect,
          averageScore,
          totalStudents: uniqueStudents,
          participationRate: 0
        })
        setInsightsLoading(true)
        try {
          const insightRes = await fetch(`${API_URL}/responses/insights/${roomId}`, { headers: { 'Authorization': `Bearer ${token}` } })
          const insightData = await insightRes.json()
          if (insightRes.ok) {
            const classroomInsights = insightData.insights
            setInsights(classroomInsights)
            setStats(prev => ({
              ...prev,
              participationRate: classroomInsights?.responseRate || 0
            }))
          }
        } catch (insightErr) { console.error('Failed to load classroom insights:', insightErr) }
        finally { setInsightsLoading(false) }
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
          {user?.role === 'teacher' && (
            <section style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', marginBottom: '24px', border: '1px solid var(--border-color)', boxShadow: 'var(--card-shadow)' }}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px'}}>
                <div><div style={{display:'flex',alignItems:'center',gap:'10px'}}><span style={{fontSize:'24px'}}>🧠</span><h2 style={{margin:0,fontSize:'20px',color:'var(--text-primary)'}}>AI Classroom Insight Engine</h2><span style={{padding:'4px 9px',borderRadius:'999px',fontSize:'10px',fontWeight:700,background:'#ede9fe',color:'#7c3aed'}}>SMART ANALYSIS</span></div><p style={{margin:'6px 0 0',color:'var(--text-secondary)',fontSize:'13px'}}>Turns student answers into actionable teaching insights — not just marks.</p></div>
                {insights && <div style={{padding:'8px 12px',borderRadius:'10px',background:insights.classPulse==='excellent'?'#d1fae5':insights.classPulse==='steady'?'#dbeafe':'#fef3c7',fontSize:'12px',fontWeight:700}}>Class pulse: {insights.classPulse.replace('-',' ')}</div>}
              </div>
              {insightsLoading && <div style={{padding:'24px',textAlign:'center',color:'var(--text-secondary)'}}>Analyzing answer patterns...</div>}
              {!insightsLoading && insights && <>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'12px',marginBottom:'18px'}}>{[['🎯',`${insights.overallAccuracy}%`,'Class mastery'],['👥',`${insights.responseRate}%`,'Participation'],['⚡',`${insights.averageResponseTime}s`,'Avg response time'],['🚨',`${insights.misconceptions.length}`,'Misconception alerts']].map(([icon,value,label])=><div key={label} style={{padding:'16px',borderRadius:'12px',background:'var(--bg-primary)',border:'1px solid var(--border-color)'}}><div style={{fontSize:'20px'}}>{icon}</div><div style={{fontSize:'24px',fontWeight:800,marginTop:'5px',color:'var(--text-primary)'}}>{value}</div><div style={{fontSize:'11px',color:'var(--text-secondary)'}}>{label}</div></div>)}</div>
                <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:'14px'}}>
                  <div style={{padding:'18px',borderRadius:'12px',background:'var(--bg-primary)',border:'1px solid var(--border-color)'}}><h3 style={{margin:'0 0 12px',fontSize:'15px',color:'var(--text-primary)'}}>🚨 Misconception Radar</h3>{insights.misconceptions.length===0?<p style={{margin:0,color:'var(--text-secondary)',fontSize:'13px'}}>No strong misconception pattern detected yet.</p>:insights.misconceptions.map(m=><div key={String(m.questionId)} style={{padding:'12px 0',borderBottom:'1px solid var(--border-color)'}}><div style={{fontSize:'12px',fontWeight:600,color:'var(--text-primary)'}}>Q{m.number}: {m.question}</div><div style={{marginTop:'6px',fontSize:'12px',color:'#dc2626'}}>⚠ {m.misconception.selectedByPercent}% chose “{m.misconception.option}”</div></div>)}</div>
                  <div style={{padding:'18px',borderRadius:'12px',background:'var(--bg-primary)',border:'1px solid var(--border-color)'}}><h3 style={{margin:'0 0 12px',fontSize:'15px',color:'var(--text-primary)'}}>🎯 Adaptive Teaching Coach</h3>{insights.recommendation?<><div style={{fontSize:'13px',fontWeight:700,color:'var(--text-primary)'}}>{insights.recommendation.title}</div><p style={{fontSize:'12px',lineHeight:1.6,color:'var(--text-secondary)'}}>{insights.recommendation.reason}</p><div style={{padding:'12px',borderRadius:'9px',background:'#f5f3ff',color:'#5b21b6',fontSize:'12px',lineHeight:1.5}}><strong>Next step:</strong> Ask an easier question on the same concept with a misconception-based distractor.</div></>:<p style={{margin:0,color:'var(--text-secondary)',fontSize:'13px'}}>Collect more responses to generate an adaptive recommendation.</p>}</div>
                </div>
                <div style={{marginTop:'14px',padding:'14px 16px',borderRadius:'10px',background:'#f8fafc',border:'1px solid var(--border-color)',fontSize:'12px',lineHeight:1.6,color:'var(--text-primary)'}}>
                  <strong>🧾 AI classroom summary:</strong> {insights.summary}
                </div>
                {insights.weakQuestions?.length > 0 && (
                  <div style={{marginTop:'12px',padding:'14px 16px',borderRadius:'10px',background:'#fff7ed',border:'1px solid #fed7aa',color:'#9a3412',fontSize:'12px'}}>
                    <strong>🔴 Weak concepts to revisit:</strong>
                    <div style={{display:'flex',flexDirection:'column',gap:'5px',marginTop:'8px'}}>
                      {insights.weakQuestions.map(q => <div key={String(q.questionId)}>Q{q.number} — {q.accuracy}% accuracy: {q.question}</div>)}
                    </div>
                  </div>
                )}
                {insights.hardestQuestion && <div style={{marginTop:'12px',padding:'14px 16px',borderRadius:'10px',background:'#fff7ed',border:'1px solid #fed7aa',color:'#9a3412',fontSize:'12px'}}><strong>Hardest question:</strong> Q{insights.hardestQuestion.number} — {insights.hardestQuestion.accuracy}% accuracy. This is the first concept Spandan recommends revisiting.</div>}
              </>}
            </section>
          )}

          {user?.role === 'teacher' && insights?.engagement && (
            <section style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '24px',
              marginBottom: '24px',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--card-shadow)'
            }}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'16px',marginBottom:'20px'}}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                    <span style={{fontSize:'24px'}}>📈</span>
                    <h2 style={{margin:0,fontSize:'20px',color:'var(--text-primary)'}}>Class Engagement</h2>
                    <span style={{padding:'4px 9px',borderRadius:'999px',fontSize:'10px',fontWeight:700,background:'#dcfce7',color:'#15803d'}}>ACTIVITY SIGNAL</span>
                  </div>
                  <p style={{margin:'6px 0 0',color:'var(--text-secondary)',fontSize:'13px'}}>
                    A classroom-level activity indicator based on participation and response behavior.
                  </p>
                </div>
                <div style={{textAlign:'center',minWidth:'92px'}}>
                  <div style={{fontSize:'30px',fontWeight:800,color:'var(--text-primary)'}}>{insights.engagement.score}%</div>
                  <div style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',color:'var(--text-secondary)'}}>{insights.engagement.level.replace('-', ' ')}</div>
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'12px',marginBottom:'20px'}}>
                {[
                  ['👥', `${insights.engagement.participationRate}%`, 'Participation'],
                  ['📝', `${insights.engagement.responseCompletionRate}%`, 'Response completion'],
                  ['🎯', `${insights.engagement.accuracyContribution}%`, 'Accuracy signal'],
                  ['⚡', `${insights.engagement.averageResponseTime}s`, 'Avg response time']
                ].map(([icon,value,label]) => (
                  <div key={label} style={{padding:'15px',borderRadius:'12px',background:'var(--bg-primary)',border:'1px solid var(--border-color)'}}>
                    <div style={{fontSize:'19px'}}>{icon}</div>
                    <div style={{fontSize:'22px',fontWeight:800,marginTop:'5px',color:'var(--text-primary)'}}>{value}</div>
                    <div style={{fontSize:'11px',color:'var(--text-secondary)'}}>{label}</div>
                  </div>
                ))}
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
                <div style={{padding:'16px',borderRadius:'12px',background:'var(--bg-primary)',border:'1px solid var(--border-color)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',fontWeight:700,color:'var(--text-primary)',marginBottom:'7px'}}>
                    <span>Students participating</span>
                    <span>{insights.engagement.activeStudents}/{insights.engagement.totalStudents}</span>
                  </div>
                  <div style={{height:'8px',background:'var(--border-color)',borderRadius:'999px',overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${insights.engagement.participationRate}%`,background:'#3b82f6',borderRadius:'999px'}} />
                  </div>
                  <p style={{margin:'9px 0 0',fontSize:'11px',color:'var(--text-secondary)'}}>
                    {insights.engagement.questionsAttempted} of {insights.engagement.totalQuestions} questions received at least one response.
                  </p>
                </div>
                <div style={{padding:'16px',borderRadius:'12px',background:'var(--bg-primary)',border:'1px solid var(--border-color)'}}>
                  <div style={{fontSize:'12px',fontWeight:700,color:'var(--text-primary)',marginBottom:'8px'}}>💡 Engagement interpretation</div>
                  <p style={{margin:0,fontSize:'12px',lineHeight:1.6,color:'var(--text-secondary)'}}>
                    {insights.engagement.score >= 80
                      ? 'The class is highly active. Keep the current pace and use challenge questions to maintain participation.'
                      : insights.engagement.score >= 60
                        ? 'Participation is steady. Add quick checks or discussion prompts to bring quieter students into the activity.'
                        : 'Engagement needs attention. Try shorter questions, more frequent checks and a quick recap before the next poll.'}
                  </p>
                </div>
              </div>
              <p style={{margin:'14px 0 0',fontSize:'10px',color:'var(--text-secondary)'}}>
                Note: This score describes aggregate classroom activity; it does not label or rank individual students.
              </p>
            </section>
          )}

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