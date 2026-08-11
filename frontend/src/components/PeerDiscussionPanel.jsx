import React, { useState, useEffect, useRef, useCallback } from 'react'
import useSocketStore from '../stores/socketStore'
import { API_URL } from '../config.js'
import { useDictation } from '../hooks/useDictation.js'

// A question only offers peer discussion if the WHOLE CLASS struggled with it — a single
// student getting something wrong isn't itself a signal the question was genuinely hard.
const LOW_ACCURACY_THRESHOLD = 60

function PeerDiscussionPanel({ roomId, questions, token, user }) {
  const { socket, isConnected } = useSocketStore()

  const [eligible, setEligible] = useState([]) // [{questionId, question, accuracyPercent}]
  const [loadingEligible, setLoadingEligible] = useState(true)

  const [openQuestionId, setOpenQuestionId] = useState(null) // which question's candidate list is expanded
  const [candidates, setCandidates] = useState([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)

  const [pendingQuestionId, setPendingQuestionId] = useState(null) // "waiting for X to accept" for this question
  const [incomingRequest, setIncomingRequest] = useState(null) // { discussionId, requesterName, questionId }
  const [notice, setNotice] = useState('')

  const [activeDiscussion, setActiveDiscussion] = useState(null) // { discussionId, partnerName, questionText }
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const messagesEndRef = useRef(null)

  const dictation = useDictation({
    onResult: (text) => setChatInput((prev) => (prev ? `${prev} ${text}` : text))
  })

  // --- Load which questions qualify, merging class accuracy with this student's own results ---
  useEffect(() => {
    let cancelled = false
    async function loadEligible() {
      setLoadingEligible(true)
      try {
        const res = await fetch(`${API_URL}/peer/questions/${roomId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json()
        if (cancelled || !res.ok) return

        const ownById = new Map((questions || []).map((q) => [q._id, q]))
        const rows = (data.questions || [])
          .filter((qs) => {
            const own = ownById.get(qs.questionId?.toString?.() || qs.questionId)
            return own?.answered && own.isCorrect === false &&
              qs.accuracyPercent != null && qs.accuracyPercent < LOW_ACCURACY_THRESHOLD
          })
          .map((qs) => ({ questionId: qs.questionId, question: qs.question, accuracyPercent: qs.accuracyPercent }))
        setEligible(rows)
      } catch (err) {
        console.error('Failed to load peer-eligible questions:', err)
      } finally {
        if (!cancelled) setLoadingEligible(false)
      }
    }
    if (roomId && token) loadEligible()
    return () => { cancelled = true }
  }, [roomId, token, questions])

  // --- Resume an in-progress discussion after a page refresh ---
  useEffect(() => {
    let cancelled = false
    async function resume() {
      try {
        const res = await fetch(`${API_URL}/peer/my-discussions/${roomId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json()
        if (cancelled || !res.ok) return
        const active = (data.discussions || []).find((d) => d.status === 'active')
        if (active && socket) {
          const partnerName = active.requesterId === user._id ? active.partnerName : active.requesterName
          socket.emit('peer:join_chat', { discussionId: active._id })
          const detailRes = await fetch(`${API_URL}/peer/discussion/${active._id}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          const detail = await detailRes.json()
          setActiveDiscussion({ discussionId: active._id, partnerName })
          setMessages(detail?.discussion?.messages || [])
        }
      } catch (err) {
        console.error('Failed to resume peer discussion:', err)
      }
    }
    if (roomId && token && socket) resume()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, token, socket])

  // --- Presence: announce we're here, leave on unmount ---
  useEffect(() => {
    if (!socket || !isConnected || !roomId) return
    socket.emit('peer:presence:join', { roomId })
    return () => socket.emit('peer:presence:leave', { roomId })
  }, [socket, isConnected, roomId])

  // --- Live socket events ---
  useEffect(() => {
    if (!socket) return

    const onIncoming = (data) => setIncomingRequest(data)
    const onRequestSent = () => {} // pendingQuestionId already set optimistically on send
    const onRequestFailed = ({ reason }) => {
      setPendingQuestionId(null)
      setNotice(reason || "Couldn't send that request.")
    }
    const onMatched = ({ discussionId, partnerName }) => {
      socket.emit('peer:join_chat', { discussionId })
      setPendingQuestionId(null)
      setMessages([])
      setActiveDiscussion({ discussionId, partnerName })
    }
    const onDeclined = () => {
      setPendingQuestionId(null)
      setNotice('That student declined — try someone else from the list.')
    }
    const onExpired = () => {
      setPendingQuestionId(null)
      setNotice("They didn't respond in time — try someone else from the list.")
    }
    const onMessage = ({ discussionId, message }) => {
      setActiveDiscussion((cur) => {
        if (cur?.discussionId === discussionId) {
          setMessages((prev) => {
            // Guard against duplicate delivery (e.g. a brief overlapping reconnect) — treat two
            // messages from the same sender, with the same text, within 1s of each other as one.
            const isDupe = prev.some((m) =>
              m.senderId === message.senderId &&
              m.text === message.text &&
              Math.abs(new Date(m.sentAt).getTime() - new Date(message.sentAt).getTime()) < 1000
            )
            return isDupe ? prev : [...prev, message]
          })
        }
        return cur
      })
    }
    const onEnded = ({ discussionId }) => {
      setActiveDiscussion((cur) => {
        if (cur?.discussionId === discussionId) {
          setNotice('The discussion has ended.')
          return null
        }
        return cur
      })
    }

    socket.on('peer:incoming_request', onIncoming)
    socket.on('peer:request_sent', onRequestSent)
    socket.on('peer:request_failed', onRequestFailed)
    socket.on('peer:matched', onMatched)
    socket.on('peer:declined', onDeclined)
    socket.on('peer:expired', onExpired)
    socket.on('peer:message', onMessage)
    socket.on('peer:ended', onEnded)

    return () => {
      socket.off('peer:incoming_request', onIncoming)
      socket.off('peer:request_sent', onRequestSent)
      socket.off('peer:request_failed', onRequestFailed)
      socket.off('peer:matched', onMatched)
      socket.off('peer:declined', onDeclined)
      socket.off('peer:expired', onExpired)
      socket.off('peer:message', onMessage)
      socket.off('peer:ended', onEnded)
    }
  }, [socket])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const openCandidates = useCallback(async (questionId) => {
    setOpenQuestionId(questionId)
    setLoadingCandidates(true)
    setCandidates([])
    try {
      const res = await fetch(`${API_URL}/peer/candidates/${roomId}/${questionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setCandidates(data.candidates || [])
    } catch (err) {
      console.error('Failed to load candidates:', err)
    } finally {
      setLoadingCandidates(false)
    }
  }, [roomId, token])

  const sendRequest = (questionId, partnerId) => {
    if (!socket) return
    setPendingQuestionId(questionId)
    setNotice('')
    socket.emit('peer:request', { roomId, questionId, partnerId })
  }

  const respondToIncoming = (accept) => {
    if (!socket || !incomingRequest) return
    socket.emit('peer:respond', { discussionId: incomingRequest.discussionId, accept })
    if (accept) {
      setMessages([])
      setActiveDiscussion({ discussionId: incomingRequest.discussionId, partnerName: incomingRequest.requesterName })
    }
    setIncomingRequest(null)
  }

  const sendMessage = () => {
    const text = chatInput.trim()
    if (!text || !activeDiscussion || !socket) return
    socket.emit('peer:message', { discussionId: activeDiscussion.discussionId, text })
    setChatInput('')
  }

  const endDiscussion = () => {
    if (!activeDiscussion || !socket) return
    socket.emit('peer:end', { discussionId: activeDiscussion.discussionId })
    setActiveDiscussion(null)
  }

  // Nothing to show: no eligible questions, no active chat, no incoming request.
  if (!loadingEligible && eligible.length === 0 && !activeDiscussion && !incomingRequest) return null

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '16px',
      padding: '24px',
      boxShadow: 'var(--card-shadow)',
      border: '1px solid var(--border-color)',
      marginBottom: '24px'
    }}>
      <h2 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
        🤝 Peer Discussion
      </h2>
      <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
        For questions the class found tricky, connect with someone who got it right and compare reasoning.
      </p>

      {notice && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '13px', marginBottom: '14px' }}>
          {notice}
        </div>
      )}

      {/* Incoming request modal */}
      {incomingRequest && (
        <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', marginBottom: '16px' }}>
          <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text-primary)' }}>
            <strong>{incomingRequest.requesterName}</strong> wants to discuss a question with you.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => respondToIncoming(true)} style={btnStyle('#059669')}>Accept</button>
            <button onClick={() => respondToIncoming(false)} style={btnStyle('transparent', true)}>Decline</button>
          </div>
        </div>
      )}

      {/* Active chat */}
      {activeDiscussion ? (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              💬 Discussing with {activeDiscussion.partnerName}
            </span>
            <button onClick={endDiscussion} style={{ ...btnStyle('transparent', true), padding: '4px 12px', fontSize: '12px' }}>
              End
            </button>
          </div>
          <div style={{ maxHeight: '260px', overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {messages.length === 0 && (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', margin: '20px 0' }}>
                Say hi and compare how you each approached it.
              </p>
            )}
            {messages.map((m, i) => {
              const mine = m.senderId === user._id
              return (
                <div key={i} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: '12px',
                    background: mine ? '#3b82f6' : 'var(--bg-primary)',
                    color: mine ? 'white' : 'var(--text-primary)',
                    border: mine ? 'none' : '1px solid var(--border-color)',
                    fontSize: '14px'
                  }}>
                    {m.text}
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
          <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderTop: '1px solid var(--border-color)' }}>
            {dictation.isSupported && (
              <button
                onClick={dictation.status === 'listening' ? dictation.stop : dictation.start}
                title="Dictate a message"
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: dictation.status === 'listening' ? '#ef4444' : 'var(--bg-primary)',
                  color: dictation.status === 'listening' ? 'white' : 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              >
                🎙️
              </button>
            )}
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendMessage() }}
              placeholder="Type a message…"
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none'
              }}
            />
            <button onClick={sendMessage} disabled={!chatInput.trim()} style={btnStyle('#3b82f6')}>Send</button>
          </div>
        </div>
      ) : (
        <>
          {loadingEligible ? (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Checking for discussion-eligible questions…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {eligible.map((q) => (
                <div key={q.questionId} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)' }}>{q.question}</p>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Only {q.accuracyPercent}% of the class got this right
                      </p>
                    </div>
                    {pendingQuestionId === q.questionId ? (
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Waiting for reply…</span>
                    ) : (
                      <button onClick={() => openCandidates(q.questionId)} style={{ ...btnStyle('#3b82f6'), whiteSpace: 'nowrap' }}>
                        Discuss
                      </button>
                    )}
                  </div>

                  {openQuestionId === q.questionId && pendingQuestionId !== q.questionId && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                      {loadingCandidates ? (
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Looking for online students…</p>
                      ) : candidates.length === 0 ? (
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          No one who got this right is online right now — check back later.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {candidates.map((c) => (
                            <button
                              key={c.studentId}
                              onClick={() => sendRequest(q.questionId, c.studentId)}
                              style={{ ...btnStyle('transparent', true), fontSize: '13px' }}
                            >
                              🟢 {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function btnStyle(bg, outline = false) {
  return {
    padding: '8px 16px',
    borderRadius: '8px',
    border: outline ? '1px solid var(--border-color)' : 'none',
    background: bg,
    color: outline ? 'var(--text-primary)' : 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  }
}

export default PeerDiscussionPanel