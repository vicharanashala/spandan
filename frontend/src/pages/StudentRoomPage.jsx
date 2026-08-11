// import React, { useState, useEffect, useRef } from 'react'
// import { useParams, useNavigate } from 'react-router-dom'
// import useAuthStore from '../stores/authStore'
// import useSocketStore from '../stores/socketStore'
// import useRoomStore from '../stores/roomStore'
// import Sidebar from '../components/Sidebar'
// import ThemeToggle from '../components/ThemeToggle'
// import ProfileDropdown from '../components/ProfileDropdown'
// import Leaderboard from '../components/Leaderboard'
// import { API_URL } from '../config.js'
// import { useVoiceAnswer, matchOptionFromPhrase } from '../hooks/useVoiceAnswer.js'

// // Spread the ~N students' navigation to the results page over this window (ms). When a big room
// // ends, all students receive room:ended at once; without a spread they'd all hit the results
// // endpoints in the same instant (the end-session "results stampede"). Each student waits a random
// // delay in [0, this) before navigating. Scoring is unaffected — the session is already over.
// const RESULTS_NAV_JITTER_MS = 4000

// function StudentRoomPage() {
//   const { roomCode } = useParams()
//   const navigate = useNavigate()
//   const { user, token, logout } = useAuthStore()
//   const { socket, isConnected, joinRoom, leaveRoom } = useSocketStore()
//   const { joinRoomByCode, setAuthToken } = useRoomStore()
  
//   const [room, setRoom] = useState(null)
//   const [isLoading, setIsLoading] = useState(true)
//   const [error, setError] = useState('')
//   const [currentQuestion, setCurrentQuestion] = useState(null)
//   const [selectedOptions, setSelectedOptions] = useState([]) // Array for MSQ support
//   const [submitted, setSubmitted] = useState(false)
//   // Voice/typed answer mode: typedAnswer is the fallback text input (also used by browsers
//   // without SpeechRecognition support); voiceNotice surfaces "didn't catch that" / toggled
//   // messages next to the mic button without blocking the question UI.
//   const [typedAnswer, setTypedAnswer] = useState('')
//   const [voiceNotice, setVoiceNotice] = useState('')
//   const [hasAnsweredPoll, setHasAnsweredPoll] = useState(false) // Track if student has answered at least one poll
//   const [myRank, setMyRank] = useState(null) // this student's latest rank, returned by the submit POST
//   const [timeLeft, setTimeLeft] = useState(0)
//   const [results, setResults] = useState(null)
//   // Past responses loaded from MongoDB - no sessionStorage needed
//   const [pastResponses, setPastResponses] = useState([])
//   const [sessionEnded, setSessionEnded] = useState(false) // room ended → show interstitial while we stagger navigation
//   const timerIntervalRef = useRef(null)
//   const resultsNavTimerRef = useRef(null)

//   useEffect(() => {
//     if (!token || !socket) return
//     setAuthToken(token)
//     joinSession()
//     return () => {
//       if (room?.code) {
//         leaveRoom(room.code, user._id)
//       }
//     }
//   }, [token, socket])



//   useEffect(() => {
//     if (!socket) return

//     const handleQuestionStarted = (data) => {
//       setCurrentQuestion(data)
//       setSelectedOptions([])
//       setSubmitted(false)
//       setTypedAnswer('')
//       setVoiceNotice('')
//       setTimeLeft(data.timer || 30)
      
//       if (data.question && data.question.timeToAnswer) {
//         setTimeLeft(data.question.timeToAnswer)
//       }
      
//       // Clear any existing timer
//       if (timerIntervalRef.current) {
//         clearInterval(timerIntervalRef.current)
//         timerIntervalRef.current = null
//       }
      
//       timerIntervalRef.current = setInterval(() => {
//         setTimeLeft(prev => {
//           if (prev <= 1) {
//             clearInterval(timerIntervalRef.current)
//             timerIntervalRef.current = null
//             // Time expired - refresh from MongoDB only if room/user available
//             if (room?._id && user?._id) {
//               fetchPastResponses(room._id, user._id)
//             }
//             setCurrentQuestion(null)
//             return 0
//           }
//           return prev - 1
//         })
//       }, 1000)
//     }

//     const handleQuestionEnded = (data) => {
//       // Clear timer if running
//       if (timerIntervalRef.current) {
//         clearInterval(timerIntervalRef.current)
//         timerIntervalRef.current = null
//       }
      
//       // Only fetch if room and user are available
//       if (room?._id && user?._id) {
//         fetchPastResponses(room._id, user._id)
//       }
//       setResults(data?.results || null)
//       setCurrentQuestion(null)
//     }

//     const handleNewQuestion = (question) => {
//       // Handle manually created questions from teacher
//       // Clear any existing timer
//       if (timerIntervalRef.current) {
//         clearInterval(timerIntervalRef.current)
//         timerIntervalRef.current = null
//       }
      
//       setCurrentQuestion(question)
//       setSelectedOptions([])
//       setSubmitted(false)
//       setTimeLeft(question.timeToAnswer || 30)
      
//       timerIntervalRef.current = setInterval(() => {
//         setTimeLeft(prev => {
//           if (prev <= 1) {
//             clearInterval(timerIntervalRef.current)
//             timerIntervalRef.current = null
//             // Time expired - refresh from MongoDB only if room/user available
//             if (room?._id && user?._id) {
//               fetchPastResponses(room._id, user._id)
//             }
//             setCurrentQuestion(null)
//             return 0
//           }
//           return prev - 1
//         })
//       }, 1000)
//     }

//     // Self-heal after a socket reconnect: the store re-joins the room automatically, but a
//     // question pushed WHILE we were briefly disconnected would have been missed. Re-pull the
//     // room's questions so any missed one surfaces without the student manually refreshing.
//     const handleReconnect = () => {
//       if (room?._id && user?._id) {
//         fetchPastResponses(room._id, user._id)
//       }
//     }

//     socket.on('question:started', handleQuestionStarted)
//     socket.on('question:ended', handleQuestionEnded)
//     socket.on('new_question', handleNewQuestion)
//     socket.on('connect', handleReconnect)
//     socket.on('room:ended', () => {
//       // Show the interstitial immediately, but stagger the actual navigation across a jitter window
//       // so all students don't hit the results endpoints in the same instant.
//       setSessionEnded(true)
//       const delay = Math.random() * RESULTS_NAV_JITTER_MS
//       resultsNavTimerRef.current = setTimeout(() => {
//         navigate(`/student/room/${room?._id}/results`)
//       }, delay)
//     })

//     return () => {
//       socket.off('question:started', handleQuestionStarted)
//       socket.off('question:ended', handleQuestionEnded)
//       socket.off('new_question', handleNewQuestion)
//       socket.off('connect', handleReconnect)
//       socket.off('room:ended')
//       if (resultsNavTimerRef.current) clearTimeout(resultsNavTimerRef.current)
//     }
//   }, [socket, navigate, room?._id])

//   const joinSession = async () => {
//     setIsLoading(true)
//     try {
//       const roomData = await joinRoomByCode(roomCode)
//       setRoom(roomData)
//       if (user?._id && socket) {
//         // Join via socket - room:joined confirms the student was added to RoomMember
//         return new Promise((resolve, reject) => {
//           const timeout = setTimeout(() => {
//             socket.off('room:joined', handleRoomJoined)
//             // Still fetch even if timeout - RoomMember should already exist from HTTP join
//             fetchPastResponses(roomData._id, user._id)
//             resolve()
//           }, 3000)

//           const handleRoomJoined = (data) => {
//             if (data.roomCode === roomData.code) {
//               clearTimeout(timeout)
//               socket.off('room:joined', handleRoomJoined)
//               fetchPastResponses(roomData._id, user._id)
//               resolve()
//             }
//           }
//           socket.on('room:joined', handleRoomJoined)
//           joinRoom(roomData.code, user._id)
//         })
//       }
//     } catch (err) {
//       setError(err.message)
//     } finally {
//       setIsLoading(false)
//     }
//   }
  
//   const fetchPastResponses = async (roomId, studentId) => {
//     // Defensive: don't call if room or user not ready
//     if (!roomId || !studentId) {
//       console.warn('fetchPastResponses skipped: missing roomId or studentId', { roomId, studentId })
//       return
//     }
//     try {
//       console.log('[StudentRoom] Fetching past responses for room:', roomId, 'student:', studentId)
//       const response = await fetch(`${API_URL}/responses/room/${roomId}/student/${studentId}`, {
//         headers: {
//           'Authorization': `Bearer ${token}`
//         }
//       })
//       if (!response.ok) {
//         console.error('Failed to fetch responses:', response.status)
//         return
//       }
//       const data = await response.json()
//       if (data.success && data.questions) {
//         setPastResponses(data.questions)
//         // If student has already answered polls, disable leave button
//         if (data.questions.some(q => q.answered)) {
//           setHasAnsweredPoll(true)
//         }
//       }
//     } catch (err) {
//       console.error('Failed to fetch past responses:', err)
//     }
//   }

//   const handleSubmitAnswer = async (overrideOptions) => {
//     // overrideOptions lets a caller (voice match) submit the exact options it just recognized
//     // without waiting for setSelectedOptions() to flush through a render — relying on the
//     // `selectedOptions` state here would submit stale (empty) data on the very same tick.
//     const optionsToSubmit = overrideOptions ?? selectedOptions
//     if (optionsToSubmit.length === 0 || submitted || !currentQuestion) return
//     if (overrideOptions) setSelectedOptions(overrideOptions)

//     const questionId = currentQuestion._id || currentQuestion.question?._id
//     const tta = currentQuestion.timeToAnswer || 30
//     // Freeze responseTime at CLICK time. Scoring is based on this value, NOT on when the request
//     // is actually sent, so the send-jitter below can never change a student's points.
//     const responseTime = tta - timeLeft
//     const roomId = room?._id
//     const studentId = user?._id

//     // Lock the UI immediately so the student sees their answer registered and cannot double-submit,
//     // even though the network POST itself is deferred by a small random delay.
//     setSubmitted(true)
//     setHasAnsweredPoll(true) // Prevent accidental leave after answering

//     // Client-side jitter: spread submissions across 0–2s so a synchronized classroom of 500+ does
//     // not all hit POST /responses in the same instant. A simultaneous burst saturates the 2-core
//     // event loop and starves the next question's broadcast (the missed-poll root cause); smearing
//     // the sends flattens that peak. responseTime is already frozen above, so points are unaffected.
//     const jitterMs = Math.floor(Math.random() * 2000)

//     console.log('[StudentRoom] Submitting answer:', {
//       questionId, roomId, studentId, selectedOptions: optionsToSubmit, timeToAnswer: tta, timeLeft, responseTime, jitterMs
//     })

//     if (jitterMs > 0) await new Promise(resolve => setTimeout(resolve, jitterMs))

//     // Save to MongoDB
//     try {
//       const saveResponse = await fetch(`${API_URL}/responses`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//           'Authorization': `Bearer ${token}`
//         },
//         body: JSON.stringify({
//           roomId,
//           questionId,
//           studentId,
//           selectedOptions: optionsToSubmit,
//           responseTime
//         })
//       })
//       const saveData = await saveResponse.json()
//       console.log('[StudentRoom] Response saved:', saveData)

//       // Phase 1: the server now emits the throttled leaderboard/answer-count updates itself
//       // (from this authenticated POST) — the client no longer emits points:update /
//       // response:submit. The POST returns this student's current rank; surface it so the
//       // leaderboard's "you" pill updates even when outside the broadcast top-N.
//       if (saveData.success && saveData.rank != null) {
//         setMyRank(saveData.rank)
//       }
//     } catch (err) {
//       console.error('Failed to save response:', err)
//     }

//     if (roomId && studentId) {
//       fetchPastResponses(roomId, studentId)
//     }
//   }

//   // Voice/typed answer mode. MCQ and TF are single-answer, so a confirmed match auto-submits
//   // hands-free. MSQ needs potentially several spoken answers ("Option A", then "Option C"), so a
//   // match there only toggles the selection — the student still taps Submit once they're done,
//   // otherwise one word would lock in an answer that was meant to be the first of several.
//   const handleVoiceMatch = (matchedIndex, heardText) => {
//     if (submitted || !currentQuestion) return
//     const isMSQ = currentQuestion.type === 'MSQ'
//     setVoiceNotice(`Heard: "${heardText}"`)
//     if (isMSQ) {
//       setSelectedOptions((prev) =>
//         prev.includes(matchedIndex) ? prev.filter((i) => i !== matchedIndex) : [...prev, matchedIndex]
//       )
//     } else {
//       handleSubmitAnswer([matchedIndex])
//     }
//   }

//   const voiceAnswer = useVoiceAnswer({
//     options: currentQuestion?.options,
//     onMatch: handleVoiceMatch
//   })

//   // Typed-answer fallback: same matching logic as voice, so "type it or say it" behave
//   // identically. Also the only path available in browsers without SpeechRecognition support.
//   const handleTypedAnswerSubmit = () => {
//     if (submitted || !currentQuestion || !typedAnswer.trim()) return
//     const matchedIndex = matchOptionFromPhrase(typedAnswer, currentQuestion.options)
//     if (matchedIndex == null) {
//       setVoiceNotice(`Couldn't match "${typedAnswer}" to an option — try the option letter (A, B, C…) or its exact text.`)
//       return
//     }
//     setTypedAnswer('')
//     handleVoiceMatch(matchedIndex, typedAnswer)
//   }

//   const leaveSession = () => {
//     if (room?.code) {
//       leaveRoom(room.code, user._id)
//     }
//     navigate('/student')
//   }

//   if (isLoading) {
//     return (
//       <div style={{
//         display: 'flex',
//         minHeight: '100vh',
//         background: 'var(--bg-primary)',
//         fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
//       }}>
//         <Sidebar user={user} />
//         <div style={{ flex: 1, marginLeft: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//           <div style={{ textAlign: 'center' }}>
//             <div style={{
//               width: '48px',
//               height: '48px',
//               border: '4px solid var(--border-color)',
//               borderTopColor: '#3b82f6',
//               borderRadius: '50%',
//               animation: 'spin 1s linear infinite',
//               margin: '0 auto 16px'
//             }} />
//             <p style={{ color: 'var(--text-secondary)' }}>Joining classroom session...</p>
//           </div>
//         </div>
//       </div>
//     )
//   }

//   if (!room) {
//     return (
//       <div style={{
//         display: 'flex',
//         minHeight: '100vh',
//         background: 'var(--bg-primary)',
//         fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
//       }}>
//         <Sidebar user={user} />
//         <div style={{ flex: 1, marginLeft: '240px', padding: '32px' }}>
//           <div style={{
//             background: 'var(--bg-card)',
//             borderRadius: '16px',
//             padding: '32px',
//             border: '1px solid var(--border-color)',
//             textAlign: 'center'
//           }}>
//             <h2 style={{ color: 'var(--text-primary)' }}>{error || 'Failed to join session'}</h2>
//             <button
//               onClick={() => navigate('/student')}
//               style={{
//                 marginTop: '16px',
//                 padding: '12px 24px',
//                 background: '#3b82f6',
//                 color: 'white',
//                 border: 'none',
//                 borderRadius: '10px',
//                 cursor: 'pointer'
//               }}
//             >
//               Back to Dashboard
//             </button>
//           </div>
//         </div>
//       </div>
//     )
//   }

//   if (sessionEnded) {
//     return (
//       <div style={{
//         display: 'flex',
//         minHeight: '100vh',
//         background: 'var(--bg-primary)',
//         fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
//       }}>
//         <Sidebar user={user} />
//         <div style={{ flex: 1, marginLeft: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//           <div style={{ textAlign: 'center' }}>
//             <div style={{
//               width: '48px',
//               height: '48px',
//               border: '4px solid var(--border-color)',
//               borderTopColor: '#3b82f6',
//               borderRadius: '50%',
//               animation: 'spin 1s linear infinite',
//               margin: '0 auto 16px'
//             }} />
//             <p style={{ color: 'var(--text-secondary)' }}>Session ended — loading your results...</p>
//           </div>
//         </div>
//       </div>
//     )
//   }

//   return (
//     <div style={{
//       display: 'flex',
//       minHeight: '100vh',
//       background: 'var(--bg-primary)',
//       fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
//       width: '100vw',
//       maxWidth: '100vw',
//       overflowX: 'hidden'
//     }}>
//       <Sidebar user={user} />
      
//       <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px', minWidth: 0, maxWidth: 'calc(100vw - 240px)', overflowX: 'hidden' }}>
//         {/* Header */}
//         <header style={{
//           background: 'var(--header-bg)',
//           color: 'white',
//           padding: '24px 32px'
//         }}>
//           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//             <div>
//               <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Room: {room.name}</h1>
//               <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>Code: {room.code}</p>
//             </div>
//             <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
//               <ThemeToggle />
//               <ProfileDropdown />
//             </div>
//           </div>
//         </header>

//         {/* Content */}
//         <div style={{ flex: 1, padding: '32px', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
//           {/* Connection Status */}
//           <div style={{
//             background: 'var(--bg-card)',
//             borderRadius: '16px',
//             padding: '16px 24px',
//             boxShadow: 'var(--card-shadow)',
//             border: '1px solid var(--border-color)',
//             marginBottom: '24px',
//             display: 'flex',
//             alignItems: 'center',
//             justifyContent: 'space-between'
//           }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//               <div style={{
//                 width: '12px',
//                 height: '12px',
//                 borderRadius: '50%',
//                 background: isConnected ? '#10b981' : '#ef4444'
//               }} />
//               <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500' }}>
//                 {isConnected ? 'Connected' : 'Reconnecting...'}
//               </span>
//             </div>
//             <button
//               onClick={leaveSession}
//               disabled={hasAnsweredPoll}
//               title={hasAnsweredPoll ? 'You cannot leave after answering a question' : 'Leave the session'}
//               style={{
//                 padding: '8px 16px',
//                 background: hasAnsweredPoll ? 'var(--border-color)' : '#ef4444',
//                 color: hasAnsweredPoll ? 'var(--text-secondary)' : 'white',
//                 border: '1px solid var(--border-color)',
//                 borderRadius: '8px',
//                 fontSize: '13px',
//                 fontWeight: '600',
//                 cursor: hasAnsweredPoll ? 'not-allowed' : 'pointer',
//                 opacity: hasAnsweredPoll ? 0.6 : 1
//               }}
//             >
//               Leave
//             </button>
//           </div>

//           {/* Live Question */}
//           {currentQuestion ? (
//             <div style={{
//               background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
//               borderRadius: '16px',
//               padding: '32px',
//               color: 'white',
//               boxShadow: '0 10px 40px rgba(124, 58, 237, 0.3)'
//             }}>
//               {/* Timer */}
//               <div style={{ textAlign: 'center', marginBottom: '24px' }}>
//                 <div style={{
//                   width: '100px',
//                   height: '100px',
//                   borderRadius: '50%',
//                   border: '4px solid rgba(255,255,255,0.3)',
//                   display: 'flex',
//                   alignItems: 'center',
//                   justifyContent: 'center',
//                   margin: '0 auto 16px'
//                 }}>
//                   <span style={{ fontSize: '36px', fontWeight: '700' }}>{timeLeft}</span>
//                 </div>
//                 <p style={{ fontSize: '14px', opacity: 0.9 }}>seconds remaining</p>
//               </div>

//               {/* Question */}
//               <h2 style={{ fontSize: '24px', fontWeight: '700', textAlign: 'center', marginBottom: '32px' }}>
//                 {currentQuestion.question}
//               </h2>

//               {/* Options */}
//               <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
//                 {currentQuestion.options && currentQuestion.options.map((option, index) => {
//                   const isMSQ = currentQuestion.type === 'MSQ'
//                   const isSelected = isMSQ 
//                     ? selectedOptions.includes(index)
//                     : selectedOptions.length === 1 && selectedOptions[0] === index
//                   const optionText = typeof option === 'string' ? option : option.text
//                   const optionLabel = String.fromCharCode(65 + index)
                  
//                   const handleOptionClick = () => {
//                     if (submitted) return
//                     if (isMSQ) {
//                       // MSQ: Toggle selection
//                       setSelectedOptions(prev => 
//                         prev.includes(index) 
//                           ? prev.filter(i => i !== index)
//                           : [...prev, index]
//                       )
//                     } else {
//                       // MCQ/TF: Single selection
//                       setSelectedOptions([index])
//                     }
//                   }
                  
//                   return (
//                     <button
//                       key={index}
//                       onClick={handleOptionClick}
//                       disabled={submitted}
//                       style={{
//                         padding: '20px 24px',
//                         background: submitted 
//                           ? 'rgba(255,255,255,0.1)'
//                           : (isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'),
//                         border: `2px solid ${isSelected ? '#ffd700' : 'rgba(255,255,255,0.2)'}`,
//                         borderRadius: '12px',
//                         color: 'white',
//                         fontSize: '18px',
//                         textAlign: 'left',
//                         cursor: submitted ? 'default' : 'pointer',
//                         display: 'flex',
//                         alignItems: 'center',
//                         gap: '16px'
//                       }}
//                     >
//                       {isMSQ && (
//                         <span style={{
//                           width: '24px',
//                           height: '24px',
//                           borderRadius: '6px',
//                           background: isSelected ? '#ffd700' : 'transparent',
//                           border: `2px solid ${isSelected ? '#ffd700' : 'rgba(255,255,255,0.4)'}`,
//                           display: 'flex',
//                           alignItems: 'center',
//                           justifyContent: 'center',
//                           color: isSelected ? '#1f2937' : 'white',
//                           fontSize: '14px'
//                         }}>
//                           {isSelected ? '✓' : ''}
//                         </span>
//                       )}
//                       <span style={{
//                         width: '36px',
//                         height: '36px',
//                         borderRadius: '50%',
//                         background: isSelected ? '#ffd700' : 'rgba(255,255,255,0.2)',
//                         display: 'flex',
//                         alignItems: 'center',
//                         justifyContent: 'center',
//                         fontWeight: '700',
//                         color: isSelected ? '#1f2937' : 'white',
//                         fontSize: '16px'
//                       }}>
//                         {optionLabel}
//                       </span>
//                       <span>{optionText}</span>
//                     </button>
//                   )
//                 })}
//               </div>

//               {/* Voice / Typed Answer Mode */}
//               {!submitted && (
//                 <div style={{
//                   background: 'rgba(255,255,255,0.08)',
//                   border: '1px solid rgba(255,255,255,0.15)',
//                   borderRadius: '12px',
//                   padding: '16px',
//                   marginBottom: '20px'
//                 }}>
//                   <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
//                     {voiceAnswer.isSupported && (
//                       <button
//                         onClick={voiceAnswer.start}
//                         style={{
//                           display: 'flex',
//                           alignItems: 'center',
//                           gap: '8px',
//                           padding: '10px 18px',
//                           borderRadius: '999px',
//                           border: 'none',
//                           fontSize: '14px',
//                           fontWeight: '600',
//                           cursor: 'pointer',
//                           background: voiceAnswer.status === 'listening' ? '#ef4444' : '#ffd700',
//                           color: voiceAnswer.status === 'listening' ? 'white' : '#1f2937',
//                           animation: voiceAnswer.status === 'listening' ? 'voicePulse 1.2s ease-in-out infinite' : 'none'
//                         }}
//                       >
//                         <span>🎙️</span>
//                         {voiceAnswer.status === 'listening' ? 'Listening… tap to stop' : 'Answer by voice'}
//                       </button>
//                     )}
//                     <span style={{ fontSize: '13px', opacity: 0.85 }}>
//                       {currentQuestion.type === 'MSQ'
//                         ? 'Say each option ("Option A"), then tap Submit.'
//                         : 'Say "Option A" / "True" / "False" — submits automatically.'}
//                     </span>
//                   </div>

//                   {voiceAnswer.status === 'no-match' && (
//                     <p style={{ fontSize: '13px', color: '#fecaca', marginTop: '10px' }}>
//                       Didn't catch a valid option — try again, or type your answer below.
//                     </p>
//                   )}
//                   {voiceAnswer.status === 'error' && (
//                     <p style={{ fontSize: '13px', color: '#fecaca', marginTop: '10px' }}>
//                       Couldn't access the microphone — check your browser's mic permission, or type your answer below.
//                     </p>
//                   )}
//                   {voiceNotice && voiceAnswer.status !== 'no-match' && voiceAnswer.status !== 'error' && (
//                     <p style={{ fontSize: '13px', opacity: 0.85, marginTop: '10px' }}>{voiceNotice}</p>
//                   )}

//                   {/* Typed fallback — always available, also used by browsers without mic support */}
//                   <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
//                     <input
//                       type="text"
//                       value={typedAnswer}
//                       onChange={(e) => setTypedAnswer(e.target.value)}
//                       onKeyDown={(e) => { if (e.key === 'Enter') handleTypedAnswerSubmit() }}
//                       placeholder={currentQuestion.type === 'TF' ? 'Type True or False…' : 'Or type the option letter / answer…'}
//                       style={{
//                         flex: 1,
//                         padding: '10px 14px',
//                         borderRadius: '8px',
//                         border: '1px solid rgba(255,255,255,0.25)',
//                         background: 'rgba(255,255,255,0.1)',
//                         color: 'white',
//                         fontSize: '14px',
//                         outline: 'none'
//                       }}
//                     />
//                     <button
//                       onClick={handleTypedAnswerSubmit}
//                       disabled={!typedAnswer.trim()}
//                       style={{
//                         padding: '10px 18px',
//                         borderRadius: '8px',
//                         border: 'none',
//                         background: typedAnswer.trim() ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
//                         color: '#1f2937',
//                         fontWeight: '600',
//                         fontSize: '14px',
//                         cursor: typedAnswer.trim() ? 'pointer' : 'not-allowed'
//                       }}
//                     >
//                       Go
//                     </button>
//                   </div>
//                 </div>
//               )}

//               {/* Submit Button */}
//               {submitted ? (
//                 <div style={{
//                   textAlign: 'center',
//                   padding: '20px',
//                   background: 'rgba(255,255,255,0.1)',
//                   borderRadius: '12px'
//                 }}>
//                   <p style={{ fontSize: '18px', fontWeight: '600' }}>✓ Answer Submitted</p>
//                   <p style={{ fontSize: '14px', opacity: 0.9, marginTop: '8px' }}>
//                     Waiting for next question...
//                   </p>
//                 </div>
//               ) : (
//                 <button
//                   onClick={() => handleSubmitAnswer()}
//                   disabled={selectedOptions.length === 0}
//                   style={{
//                     width: '100%',
//                     padding: '16px',
//                     background: selectedOptions.length > 0 ? '#ffd700' : 'rgba(255,255,255,0.2)',
//                     color: selectedOptions.length > 0 ? '#1f2937' : 'rgba(255,255,255,0.5)',
//                     border: 'none',
//                     borderRadius: '12px',
//                     fontSize: '16px',
//                     fontWeight: '600',
//                     cursor: selectedOptions.length > 0 ? 'pointer' : 'not-allowed'
//                   }}
//                 >
//                   Submit Answer
//                 </button>
//               )}
//             </div>
//           ) : (
//             /* Waiting State - Show Passed Questions */
//             <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
//               {/* Active question area placeholder */}
//               <div style={{
//                 background: 'var(--bg-card)',
//                 borderRadius: '16px',
//                 padding: '48px',
//                 boxShadow: 'var(--card-shadow)',
//                 border: '1px solid var(--border-color)',
//                 textAlign: 'center'
//               }}>
//                 <div style={{
//                   width: '80px',
//                   height: '80px',
//                   background: '#eff6ff',
//                   borderRadius: '50%',
//                   display: 'flex',
//                   alignItems: 'center',
//                   justifyContent: 'center',
//                   margin: '0 auto 24px',
//                   fontSize: '40px'
//                 }}>
//                   ⏳
//                 </div>
//                 <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
//                   Waiting for Next Question
//                 </h2>
//                 <p style={{ color: 'var(--text-secondary)', marginBottom: '0' }}>
//                   The teacher will start a poll soon. Stay tuned!
//                 </p>
//               </div>

//               {/* Past Questions (flex) + Leaderboard (flex) */}
//               <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', width: '100%', boxSizing: 'border-box' }}>
//                 {/* Past Questions - flexible width */}
//                 <div style={{ flex: '1 1 calc(70% - 8px)', minWidth: '300px', maxWidth: '100%', background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}>
//                   <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
//                     📋 Past Questions {pastResponses.length > 0 && `(${pastResponses.length})`}
//                   </h3>
//                 {pastResponses.length === 0 ? (
//                   <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
//                     No questions answered yet. Questions you answer will appear here.
//                   </p>
//                 ) : (
//                   <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
//                     {pastResponses.map((q, index) => (
//                       <div key={`past-${index}`} style={{
//                         padding: '20px',
//                         background: 'var(--bg-primary)',
//                         borderRadius: '12px',
//                         border: '1px solid var(--border-color)',
//                         opacity: q.answered ? 1 : 0.8
//                       }}>
//                         {/* Header with status badges */}
//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
//                           <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
//                             <span style={{
//                               padding: '2px 10px',
//                               background: q.answered ? '#d1fae5' : '#fee2e2',
//                               color: q.answered ? '#059669' : '#dc2626',
//                               borderRadius: '6px',
//                               fontSize: '12px',
//                               fontWeight: '600'
//                             }}>
//                               {q.answered ? 'Answered' : 'Missed'}
//                             </span>
//                             <span style={{
//                               padding: '2px 10px',
//                               background: '#eff6ff',
//                               color: '#3b82f6',
//                               borderRadius: '6px',
//                               fontSize: '12px',
//                               fontWeight: '600'
//                             }}>
//                               {q.type}
//                             </span>
//                             <span style={{
//                               padding: '2px 10px',
//                               background: '#fef3c7',
//                               color: '#d97706',
//                               borderRadius: '6px',
//                               fontSize: '12px',
//                               fontWeight: '600'
//                             }}>
//                               {q.answered ? (q.pointsEarned || 0) : 0}/{q.maxPoints || 100} pts
//                             </span>
//                           </div>
//                           {q.answered && q.isCorrect && (
//                             <span style={{
//                               padding: '4px 12px',
//                               background: '#10b981',
//                               color: 'white',
//                               borderRadius: '6px',
//                               fontSize: '12px',
//                               fontWeight: '600'
//                             }}>
//                               ✓ Correct (+{q.pointsEarned || 0})
//                             </span>
//                           )}
//                           {q.answered && !q.isCorrect && (
//                             <span style={{
//                               padding: '4px 12px',
//                               background: '#ef4444',
//                               color: 'white',
//                               borderRadius: '6px',
//                               fontSize: '12px',
//                               fontWeight: '600'
//                             }}>
//                               ✗ Incorrect (+{q.pointsEarned || 0})
//                             </span>
//                           )}
//                         </div>
                        
//                         {/* Question text */}
//                         <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 16px 0', lineHeight: '1.5' }}>
//                           {q.question || 'Question'}
//                         </p>
                        
//                         {/* All options - always shown */}
//                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
//                           {(q.options || []).map((option, optIdx) => {
//                             const isSelected = q.selectedOptions?.includes(optIdx)
//                             const isCorrect = option.isCorrect
//                             const letter = String.fromCharCode(65 + optIdx)
                            
//                             let bgColor = 'var(--bg-secondary)'
//                             let borderColor = 'var(--border-color)'
//                             let textColor = 'var(--text-primary)'
//                             let label = ''
                            
//                             if (q.answered && isSelected && isCorrect) {
//                               bgColor = '#d1fae5'
//                               borderColor = '#059669'
//                               label = ' (Your correct answer)'
//                             } else if (q.answered && isSelected && !isCorrect) {
//                               bgColor = '#fee2e2'
//                               borderColor = '#dc2626'
//                               label = ' (Your wrong answer)'
//                             } else if (!q.answered && isCorrect) {
//                               bgColor = '#d1fae5'
//                               borderColor = '#059669'
//                               label = ' (Correct answer)'
//                             }
                            
//                             return (
//                               <div key={optIdx} style={{
//                                 padding: '12px 16px',
//                                 background: bgColor,
//                                 border: `2px solid ${borderColor}`,
//                                 borderRadius: '8px',
//                                 display: 'flex',
//                                 alignItems: 'center',
//                                 gap: '12px'
//                               }}>
//                                 <span style={{
//                                   width: '28px',
//                                   height: '28px',
//                                   borderRadius: '50%',
//                                   background: isCorrect ? '#059669' : 'var(--border-color)',
//                                   color: 'white',
//                                   display: 'flex',
//                                   alignItems: 'center',
//                                   justifyContent: 'center',
//                                   fontWeight: '700',
//                                   fontSize: '14px',
//                                   flexShrink: 0
//                                 }}>
//                                   {letter}
//                                 </span>
//                                 <span style={{ fontSize: '14px', color: textColor, fontWeight: isCorrect ? '600' : '400' }}>
//                                   {option.text || option}
//                                 </span>
//                                 {label && (
//                                   <span style={{ fontSize: '12px', color: textColor, fontWeight: '600', marginLeft: 'auto' }}>
//                                     {label}
//                                   </span>
//                                 )}
//                               </div>
//                             )
//                           })}
//                         </div>
                        
//                         {/* Missed question notice */}
//                         {!q.answered && (
//                           <p style={{ fontSize: '13px', color: '#dc2626', margin: 0, fontStyle: 'italic' }}>
//                             ⚠️ You did not answer this question
//                           </p>
//                         )}
//                       </div>
//                     ))}
//                   </div>
//                 )}
//                 </div>
//                 {/* Leaderboard - flexible width */}
//                 <div style={{ flex: '1 1 calc(30% - 10px)', minWidth: '280px', maxWidth: '100%', background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)', boxSizing: 'border-box', overflow: 'hidden' }}>
//                   <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
//                     🏆 Leaderboard
//                   </h3>
//                   <Leaderboard roomId={room?._id} token={token} socket={socket} userId={user?._id} myRank={myRank} />
//                 </div>
//               </div>
//             </div>
//           )}
//         </div>
//       </div>

//       <style>{`
//         @keyframes voicePulse {
//           0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
//           50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
//         }
//       `}</style>
//     </div>
//   )
// }

// export default StudentRoomPage


import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import Leaderboard from '../components/Leaderboard'
import { API_URL } from '../config.js'
import { useVoiceAnswer, matchOptionFromPhrase } from '../hooks/useVoiceAnswer.js'

// Spread the ~N students' navigation to the results page over this window (ms). When a big room
// ends, all students receive room:ended at once; without a spread they'd all hit the results
// endpoints in the same instant (the end-session "results stampede"). Each student waits a random
// delay in [0, this) before navigating. Scoring is unaffected — the session is already over.
const RESULTS_NAV_JITTER_MS = 4000

function StudentRoomPage() {
  const { roomCode } = useParams()
  const navigate = useNavigate()
  const { user, token, logout } = useAuthStore()
  const { socket, isConnected, joinRoom, leaveRoom } = useSocketStore()
  const { joinRoomByCode, setAuthToken } = useRoomStore()
  
  const [room, setRoom] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [selectedOptions, setSelectedOptions] = useState([]) // Array for MSQ support
  const [submitted, setSubmitted] = useState(false)
  // Voice/typed answer mode: typedAnswer is the fallback text input (also used by browsers
  // without SpeechRecognition support); voiceNotice surfaces "didn't catch that" / toggled
  // messages next to the mic button without blocking the question UI.
  const [typedAnswer, setTypedAnswer] = useState('')
  const [voiceNotice, setVoiceNotice] = useState('')
  // Voice answering now starts automatically the instant an eligible question appears (see
  // autoListenEligible below) — no manual toggle or tap-to-start button anymore. Removing the
  // toggle also removes the awkward "student manually enables mic, but by the time they've done
  // that they could've just clicked the right option" loop the button created.
  const [hasAnsweredPoll, setHasAnsweredPoll] = useState(false) // Track if student has answered at least one poll
  const [myRank, setMyRank] = useState(null) // this student's latest rank, returned by the submit POST
  const [timeLeft, setTimeLeft] = useState(0)
  const [results, setResults] = useState(null)
  // Past responses loaded from MongoDB - no sessionStorage needed
  const [pastResponses, setPastResponses] = useState([])
  const [sessionEnded, setSessionEnded] = useState(false) // room ended → show interstitial while we stagger navigation
  const timerIntervalRef = useRef(null)
  const resultsNavTimerRef = useRef(null)

  useEffect(() => {
    if (!token || !socket) return
    setAuthToken(token)
    joinSession()
    return () => {
      if (room?.code) {
        leaveRoom(room.code, user._id)
      }
    }
  }, [token, socket])



  useEffect(() => {
    if (!socket) return

    const handleQuestionStarted = (data) => {
      setCurrentQuestion(data)
      setSelectedOptions([])
      setSubmitted(false)
      setTypedAnswer('')
      setVoiceNotice('')
      setTimeLeft(data.timer || 30)
      
      if (data.question && data.question.timeToAnswer) {
        setTimeLeft(data.question.timeToAnswer)
      }
      
      // Clear any existing timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current)
            timerIntervalRef.current = null
            // Time expired - refresh from MongoDB only if room/user available
            if (room?._id && user?._id) {
              fetchPastResponses(room._id, user._id)
            }
            setCurrentQuestion(null)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    const handleQuestionEnded = (data) => {
      // Clear timer if running
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      
      // Only fetch if room and user are available
      if (room?._id && user?._id) {
        fetchPastResponses(room._id, user._id)
      }
      setResults(data?.results || null)
      setCurrentQuestion(null)
    }

    const handleNewQuestion = (question) => {
      // Handle manually created questions from teacher
      // Clear any existing timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      
      setCurrentQuestion(question)
      setSelectedOptions([])
      setSubmitted(false)
      setTimeLeft(question.timeToAnswer || 30)
      
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current)
            timerIntervalRef.current = null
            // Time expired - refresh from MongoDB only if room/user available
            if (room?._id && user?._id) {
              fetchPastResponses(room._id, user._id)
            }
            setCurrentQuestion(null)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    // Self-heal after a socket reconnect: the store re-joins the room automatically, but a
    // question pushed WHILE we were briefly disconnected would have been missed. Re-pull the
    // room's questions so any missed one surfaces without the student manually refreshing.
    const handleReconnect = () => {
      if (room?._id && user?._id) {
        fetchPastResponses(room._id, user._id)
      }
    }

    socket.on('question:started', handleQuestionStarted)
    socket.on('question:ended', handleQuestionEnded)
    socket.on('new_question', handleNewQuestion)
    socket.on('connect', handleReconnect)
    socket.on('room:ended', () => {
      // Show the interstitial immediately, but stagger the actual navigation across a jitter window
      // so all students don't hit the results endpoints in the same instant.
      setSessionEnded(true)
      const delay = Math.random() * RESULTS_NAV_JITTER_MS
      resultsNavTimerRef.current = setTimeout(() => {
        navigate(`/student/room/${room?._id}/results`)
      }, delay)
    })

    return () => {
      socket.off('question:started', handleQuestionStarted)
      socket.off('question:ended', handleQuestionEnded)
      socket.off('new_question', handleNewQuestion)
      socket.off('connect', handleReconnect)
      socket.off('room:ended')
      if (resultsNavTimerRef.current) clearTimeout(resultsNavTimerRef.current)
    }
  }, [socket, navigate, room?._id])

  const joinSession = async () => {
    setIsLoading(true)
    try {
      const roomData = await joinRoomByCode(roomCode)
      setRoom(roomData)
      if (user?._id && socket) {
        // Join via socket - room:joined confirms the student was added to RoomMember
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            socket.off('room:joined', handleRoomJoined)
            // Still fetch even if timeout - RoomMember should already exist from HTTP join
            fetchPastResponses(roomData._id, user._id)
            resolve()
          }, 3000)

          const handleRoomJoined = (data) => {
            if (data.roomCode === roomData.code) {
              clearTimeout(timeout)
              socket.off('room:joined', handleRoomJoined)
              fetchPastResponses(roomData._id, user._id)
              resolve()
            }
          }
          socket.on('room:joined', handleRoomJoined)
          joinRoom(roomData.code, user._id)
        })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }
  
  const fetchPastResponses = async (roomId, studentId) => {
    // Defensive: don't call if room or user not ready
    if (!roomId || !studentId) {
      console.warn('fetchPastResponses skipped: missing roomId or studentId', { roomId, studentId })
      return
    }
    try {
      console.log('[StudentRoom] Fetching past responses for room:', roomId, 'student:', studentId)
      const response = await fetch(`${API_URL}/responses/room/${roomId}/student/${studentId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (!response.ok) {
        console.error('Failed to fetch responses:', response.status)
        return
      }
      const data = await response.json()
      if (data.success && data.questions) {
        setPastResponses(data.questions)
        // If student has already answered polls, disable leave button
        if (data.questions.some(q => q.answered)) {
          setHasAnsweredPoll(true)
        }
      }
    } catch (err) {
      console.error('Failed to fetch past responses:', err)
    }
  }

  const handleSubmitAnswer = async (overrideOptions) => {
    // overrideOptions lets a caller (voice match) submit the exact options it just recognized
    // without waiting for setSelectedOptions() to flush through a render — relying on the
    // `selectedOptions` state here would submit stale (empty) data on the very same tick.
    const optionsToSubmit = overrideOptions ?? selectedOptions
    if (optionsToSubmit.length === 0 || submitted || !currentQuestion) return
    if (overrideOptions) setSelectedOptions(overrideOptions)

    const questionId = currentQuestion._id || currentQuestion.question?._id
    const tta = currentQuestion.timeToAnswer || 30
    // Freeze responseTime at CLICK time. Scoring is based on this value, NOT on when the request
    // is actually sent, so the send-jitter below can never change a student's points.
    const responseTime = tta - timeLeft
    const roomId = room?._id
    const studentId = user?._id

    // Lock the UI immediately so the student sees their answer registered and cannot double-submit,
    // even though the network POST itself is deferred by a small random delay.
    setSubmitted(true)
    setHasAnsweredPoll(true) // Prevent accidental leave after answering

    // Client-side jitter: spread submissions across 0–2s so a synchronized classroom of 500+ does
    // not all hit POST /responses in the same instant. A simultaneous burst saturates the 2-core
    // event loop and starves the next question's broadcast (the missed-poll root cause); smearing
    // the sends flattens that peak. responseTime is already frozen above, so points are unaffected.
    const jitterMs = Math.floor(Math.random() * 2000)

    console.log('[StudentRoom] Submitting answer:', {
      questionId, roomId, studentId, selectedOptions: optionsToSubmit, timeToAnswer: tta, timeLeft, responseTime, jitterMs
    })

    if (jitterMs > 0) await new Promise(resolve => setTimeout(resolve, jitterMs))

    // Save to MongoDB
    try {
      const saveResponse = await fetch(`${API_URL}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId,
          questionId,
          studentId,
          selectedOptions: optionsToSubmit,
          responseTime
        })
      })
      const saveData = await saveResponse.json()
      console.log('[StudentRoom] Response saved:', saveData)

      // Phase 1: the server now emits the throttled leaderboard/answer-count updates itself
      // (from this authenticated POST) — the client no longer emits points:update /
      // response:submit. The POST returns this student's current rank; surface it so the
      // leaderboard's "you" pill updates even when outside the broadcast top-N.
      if (saveData.success && saveData.rank != null) {
        setMyRank(saveData.rank)
      }
    } catch (err) {
      console.error('Failed to save response:', err)
    }

    if (roomId && studentId) {
      fetchPastResponses(roomId, studentId)
    }
  }

  // Voice/typed answer mode. MCQ and TF are single-answer, so a confirmed match auto-submits
  // hands-free. MSQ needs potentially several spoken answers ("Option A", then "Option C"), so a
  // match there only toggles the selection — the student still taps Submit once they're done,
  // otherwise one word would lock in an answer that was meant to be the first of several.
  const handleVoiceMatch = (matchedIndex, heardText) => {
    if (submitted || !currentQuestion) return
    const isMSQ = currentQuestion.type === 'MSQ'
    setVoiceNotice(`Heard: "${heardText}"`)
    if (isMSQ) {
      setSelectedOptions((prev) =>
        prev.includes(matchedIndex) ? prev.filter((i) => i !== matchedIndex) : [...prev, matchedIndex]
      )
    } else {
      handleSubmitAnswer([matchedIndex])
    }
  }

  const voiceQuestionId = currentQuestion?._id || currentQuestion?.question?._id
  // Auto-listen fires for every single-answer question (MCQ/TF) the moment it appears — a match
  // there is unambiguous and safe to auto-submit. MSQ can need several spoken answers in
  // sequence with no natural "done" signal, so it's excluded and falls back to typed answers.
  const autoListenEligible = currentQuestion?.type !== 'MSQ'

  const voiceAnswer = useVoiceAnswer({
    options: currentQuestion?.options,
    onMatch: handleVoiceMatch,
    autoListen: autoListenEligible,
    sessionKey: autoListenEligible ? voiceQuestionId : null,
    maxAutoAttempts: 3
  })

  // Typed-answer fallback: same matching logic as voice, so "type it or say it" behave
  // identically. Also the only path available in browsers without SpeechRecognition support.
  const handleTypedAnswerSubmit = () => {
    if (submitted || !currentQuestion || !typedAnswer.trim()) return
    voiceAnswer.stop()
    const matchedIndex = matchOptionFromPhrase(typedAnswer, currentQuestion.options)
    if (matchedIndex == null) {
      setVoiceNotice(`Couldn't match "${typedAnswer}" to an option — try the option letter (A, B, C…) or its exact text.`)
      return
    }
    setTypedAnswer('')
    handleVoiceMatch(matchedIndex, typedAnswer)
  }

  const leaveSession = () => {
    if (room?.code) {
      leaveRoom(room.code, user._id)
    }
    navigate('/student')
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
            <p style={{ color: 'var(--text-secondary)' }}>Joining classroom session...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
      }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: '240px', padding: '32px' }}>
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            padding: '32px',
            border: '1px solid var(--border-color)',
            textAlign: 'center'
          }}>
            <h2 style={{ color: 'var(--text-primary)' }}>{error || 'Failed to join session'}</h2>
            <button
              onClick={() => navigate('/student')}
              style={{
                marginTop: '16px',
                padding: '12px 24px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (sessionEnded) {
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
            <p style={{ color: 'var(--text-secondary)' }}>Session ended — loading your results...</p>
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
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      width: '100vw',
      maxWidth: '100vw',
      overflowX: 'hidden'
    }}>
      <Sidebar user={user} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px', minWidth: 0, maxWidth: 'calc(100vw - 240px)', overflowX: 'hidden' }}>
        {/* Header */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: '24px 32px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Room: {room.name}</h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>Code: {room.code}</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, padding: '32px', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
          {/* Connection Status */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            padding: '16px 24px',
            boxShadow: 'var(--card-shadow)',
            border: '1px solid var(--border-color)',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: isConnected ? '#10b981' : '#ef4444'
              }} />
              <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500' }}>
                {isConnected ? 'Connected' : 'Reconnecting...'}
              </span>
            </div>
            <button
              onClick={leaveSession}
              disabled={hasAnsweredPoll}
              title={hasAnsweredPoll ? 'You cannot leave after answering a question' : 'Leave the session'}
              style={{
                padding: '8px 16px',
                background: hasAnsweredPoll ? 'var(--border-color)' : '#ef4444',
                color: hasAnsweredPoll ? 'var(--text-secondary)' : 'white',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: hasAnsweredPoll ? 'not-allowed' : 'pointer',
                opacity: hasAnsweredPoll ? 0.6 : 1
              }}
            >
              Leave
            </button>
          </div>

          {/* Live Question */}
          {currentQuestion ? (
            <div style={{
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              borderRadius: '16px',
              padding: '32px',
              color: 'white',
              boxShadow: '0 10px 40px rgba(124, 58, 237, 0.3)'
            }}>
              {/* Timer */}
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{
                  width: '100px',
                  height: '100px',
                  borderRadius: '50%',
                  border: '4px solid rgba(255,255,255,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px'
                }}>
                  <span style={{ fontSize: '36px', fontWeight: '700' }}>{timeLeft}</span>
                </div>
                <p style={{ fontSize: '14px', opacity: 0.9 }}>seconds remaining</p>
              </div>

              {/* Question */}
              <h2 style={{ fontSize: '24px', fontWeight: '700', textAlign: 'center', marginBottom: '32px' }}>
                {currentQuestion.question}
              </h2>

              {/* Options */}
              <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
                {currentQuestion.options && currentQuestion.options.map((option, index) => {
                  const isMSQ = currentQuestion.type === 'MSQ'
                  const isSelected = isMSQ 
                    ? selectedOptions.includes(index)
                    : selectedOptions.length === 1 && selectedOptions[0] === index
                  const optionText = typeof option === 'string' ? option : option.text
                  const optionLabel = String.fromCharCode(65 + index)
                  
                  const handleOptionClick = () => {
                    if (submitted) return
                    voiceAnswer.stop()
                    if (isMSQ) {
                      // MSQ: Toggle selection
                      setSelectedOptions(prev => 
                        prev.includes(index) 
                          ? prev.filter(i => i !== index)
                          : [...prev, index]
                      )
                    } else {
                      // MCQ/TF: Single selection
                      setSelectedOptions([index])
                    }
                  }
                  
                  return (
                    <button
                      key={index}
                      onClick={handleOptionClick}
                      disabled={submitted}
                      style={{
                        padding: '20px 24px',
                        background: submitted 
                          ? 'rgba(255,255,255,0.1)'
                          : (isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'),
                        border: `2px solid ${isSelected ? '#ffd700' : 'rgba(255,255,255,0.2)'}`,
                        borderRadius: '12px',
                        color: 'white',
                        fontSize: '18px',
                        textAlign: 'left',
                        cursor: submitted ? 'default' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px'
                      }}
                    >
                      {isMSQ && (
                        <span style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '6px',
                          background: isSelected ? '#ffd700' : 'transparent',
                          border: `2px solid ${isSelected ? '#ffd700' : 'rgba(255,255,255,0.4)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isSelected ? '#1f2937' : 'white',
                          fontSize: '14px'
                        }}>
                          {isSelected ? '✓' : ''}
                        </span>
                      )}
                      <span style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: isSelected ? '#ffd700' : 'rgba(255,255,255,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '700',
                        color: isSelected ? '#1f2937' : 'white',
                        fontSize: '16px'
                      }}>
                        {optionLabel}
                      </span>
                      <span>{optionText}</span>
                    </button>
                  )
                })}
              </div>

              {/* Voice / Typed Answer Mode */}
              {!submitted && (
                <div style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '20px'
                }}>
                  {voiceAnswer.isSupported && autoListenEligible && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 18px',
                        borderRadius: '999px',
                        fontSize: '14px',
                        fontWeight: '600',
                        background: (voiceAnswer.status === 'listening' || voiceAnswer.status === 'starting') ? '#ef4444' : 'rgba(255,255,255,0.15)',
                        color: (voiceAnswer.status === 'listening' || voiceAnswer.status === 'starting') ? 'white' : 'inherit',
                        animation: voiceAnswer.status === 'listening' ? 'voicePulse 1.2s ease-in-out infinite' : 'none'
                      }}>
                        <span>🎙️</span>
                        {voiceAnswer.status === 'listening' && 'Listening…'}
                        {voiceAnswer.status === 'starting' && 'Get ready…'}
                        {voiceAnswer.status === 'exhausted' && 'Mic off — type your answer'}
                        {!['listening', 'starting', 'exhausted'].includes(voiceAnswer.status) && 'Mic ready'}
                      </span>
                      <span style={{ fontSize: '13px', opacity: 0.85 }}>
                        Just say "Option A" / "True" / "False" — submits automatically.
                        {voiceAnswer.attempt > 0 && voiceAnswer.attempt <= voiceAnswer.maxAutoAttempts && voiceAnswer.status !== 'exhausted' && (
                          <> · attempt {voiceAnswer.attempt}/{voiceAnswer.maxAutoAttempts}</>
                        )}
                      </span>
                    </div>
                  )}

                  {voiceAnswer.status === 'no-match' && autoListenEligible && (
                    <p style={{ fontSize: '13px', color: '#fde68a', marginTop: '10px' }}>
                      Didn't catch that — retrying automatically…
                    </p>
                  )}
                  {voiceAnswer.status === 'exhausted' && (
                    <p style={{ fontSize: '13px', color: '#fecaca', marginTop: '10px' }}>
                      Couldn't catch a clear answer after {voiceAnswer.maxAutoAttempts} tries — please select an option above or type your answer below.
                    </p>
                  )}
                  {voiceAnswer.status === 'error' && (
                    <p style={{ fontSize: '13px', color: '#fecaca', marginTop: '10px' }}>
                      Couldn't access the microphone — check your browser's mic permission, or type your answer below.
                    </p>
                  )}
                  {voiceNotice && !['no-match', 'error', 'exhausted'].includes(voiceAnswer.status) && (
                    <p style={{ fontSize: '13px', opacity: 0.85, marginTop: '10px' }}>{voiceNotice}</p>
                  )}

                  {/* Typed fallback — always available, also used by browsers without mic support */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <input
                      type="text"
                      value={typedAnswer}
                      onChange={(e) => setTypedAnswer(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleTypedAnswerSubmit() }}
                      placeholder={currentQuestion.type === 'TF' ? 'Type True or False…' : 'Or type the option letter / answer…'}
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.25)',
                        background: 'rgba(255,255,255,0.1)',
                        color: 'white',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                    <button
                      onClick={handleTypedAnswerSubmit}
                      disabled={!typedAnswer.trim()}
                      style={{
                        padding: '10px 18px',
                        borderRadius: '8px',
                        border: 'none',
                        background: typedAnswer.trim() ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
                        color: '#1f2937',
                        fontWeight: '600',
                        fontSize: '14px',
                        cursor: typedAnswer.trim() ? 'pointer' : 'not-allowed'
                      }}
                    >
                      Go
                    </button>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              {submitted ? (
                <div style={{
                  textAlign: 'center',
                  padding: '20px',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '12px'
                }}>
                  <p style={{ fontSize: '18px', fontWeight: '600' }}>✓ Answer Submitted</p>
                  <p style={{ fontSize: '14px', opacity: 0.9, marginTop: '8px' }}>
                    Waiting for next question...
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => handleSubmitAnswer()}
                  disabled={selectedOptions.length === 0}
                  style={{
                    width: '100%',
                    padding: '16px',
                    background: selectedOptions.length > 0 ? '#ffd700' : 'rgba(255,255,255,0.2)',
                    color: selectedOptions.length > 0 ? '#1f2937' : 'rgba(255,255,255,0.5)',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: selectedOptions.length > 0 ? 'pointer' : 'not-allowed'
                  }}
                >
                  Submit Answer
                </button>
              )}
            </div>
          ) : (
            /* Waiting State - Show Passed Questions */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Active question area placeholder */}
              <div style={{
                background: 'var(--bg-card)',
                borderRadius: '16px',
                padding: '48px',
                boxShadow: 'var(--card-shadow)',
                border: '1px solid var(--border-color)',
                textAlign: 'center'
              }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  background: '#eff6ff',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px',
                  fontSize: '40px'
                }}>
                  ⏳
                </div>
                <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
                  Waiting for Next Question
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '0' }}>
                  The teacher will start a poll soon. Stay tuned!
                </p>
              </div>

              {/* Past Questions (flex) + Leaderboard (flex) */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', width: '100%', boxSizing: 'border-box' }}>
                {/* Past Questions - flexible width */}
                <div style={{ flex: '1 1 calc(70% - 8px)', minWidth: '300px', maxWidth: '100%', background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
                    📋 Past Questions {pastResponses.length > 0 && `(${pastResponses.length})`}
                  </h3>
                {pastResponses.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
                    No questions answered yet. Questions you answer will appear here.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {pastResponses.map((q, index) => (
                      <div key={`past-${index}`} style={{
                        padding: '20px',
                        background: 'var(--bg-primary)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-color)',
                        opacity: q.answered ? 1 : 0.8
                      }}>
                        {/* Header with status badges */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{
                              padding: '2px 10px',
                              background: q.answered ? '#d1fae5' : '#fee2e2',
                              color: q.answered ? '#059669' : '#dc2626',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {q.answered ? 'Answered' : 'Missed'}
                            </span>
                            <span style={{
                              padding: '2px 10px',
                              background: '#eff6ff',
                              color: '#3b82f6',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {q.type}
                            </span>
                            <span style={{
                              padding: '2px 10px',
                              background: '#fef3c7',
                              color: '#d97706',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {q.answered ? (q.pointsEarned || 0) : 0}/{q.maxPoints || 100} pts
                            </span>
                          </div>
                          {q.answered && q.isCorrect && (
                            <span style={{
                              padding: '4px 12px',
                              background: '#10b981',
                              color: 'white',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              ✓ Correct (+{q.pointsEarned || 0})
                            </span>
                          )}
                          {q.answered && !q.isCorrect && (
                            <span style={{
                              padding: '4px 12px',
                              background: '#ef4444',
                              color: 'white',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              ✗ Incorrect (+{q.pointsEarned || 0})
                            </span>
                          )}
                        </div>
                        
                        {/* Question text */}
                        <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 16px 0', lineHeight: '1.5' }}>
                          {q.question || 'Question'}
                        </p>
                        
                        {/* All options - always shown */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                          {(q.options || []).map((option, optIdx) => {
                            const isSelected = q.selectedOptions?.includes(optIdx)
                            const isCorrect = option.isCorrect
                            const letter = String.fromCharCode(65 + optIdx)
                            
                            let bgColor = 'var(--bg-secondary)'
                            let borderColor = 'var(--border-color)'
                            let textColor = 'var(--text-primary)'
                            let label = ''
                            
                            if (q.answered && isSelected && isCorrect) {
                              bgColor = '#d1fae5'
                              borderColor = '#059669'
                              label = ' (Your correct answer)'
                            } else if (q.answered && isSelected && !isCorrect) {
                              bgColor = '#fee2e2'
                              borderColor = '#dc2626'
                              label = ' (Your wrong answer)'
                            } else if (!q.answered && isCorrect) {
                              bgColor = '#d1fae5'
                              borderColor = '#059669'
                              label = ' (Correct answer)'
                            }
                            
                            return (
                              <div key={optIdx} style={{
                                padding: '12px 16px',
                                background: bgColor,
                                border: `2px solid ${borderColor}`,
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                              }}>
                                <span style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  background: isCorrect ? '#059669' : 'var(--border-color)',
                                  color: 'white',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: '700',
                                  fontSize: '14px',
                                  flexShrink: 0
                                }}>
                                  {letter}
                                </span>
                                <span style={{ fontSize: '14px', color: textColor, fontWeight: isCorrect ? '600' : '400' }}>
                                  {option.text || option}
                                </span>
                                {label && (
                                  <span style={{ fontSize: '12px', color: textColor, fontWeight: '600', marginLeft: 'auto' }}>
                                    {label}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        
                        {/* Missed question notice */}
                        {!q.answered && (
                          <p style={{ fontSize: '13px', color: '#dc2626', margin: 0, fontStyle: 'italic' }}>
                            ⚠️ You did not answer this question
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                </div>
                {/* Leaderboard - flexible width */}
                <div style={{ flex: '1 1 calc(30% - 10px)', minWidth: '280px', maxWidth: '100%', background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
                    🏆 Leaderboard
                  </h3>
                  <Leaderboard roomId={room?._id} token={token} socket={socket} userId={user?._id} myRank={myRank} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes voicePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
          50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
        }
      `}</style>
    </div>
  )
}

export default StudentRoomPage