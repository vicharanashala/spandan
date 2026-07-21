import React, { useState, useEffect, useRef } from 'react'
import useTeamStore from '../stores/teamStore'
import useSocketStore from '../stores/socketStore'

export default function TeamDiscussionCanvas({ question, team, student, roomId, onSubmit, hasSubmitted }) {
  const [inputText, setInputText] = useState('')
  const [myChoice, setMyChoice] = useState(null)
  const chatEndRef = useRef(null)
  const { teamMessages, partnerChoices, consensusCelebration } = useTeamStore()
  const { joinTeamChannel, sendTeamMessage, sendTeamOptionSelect, checkTeamConsensus } = useSocketStore()

  useEffect(() => {
    if (team?._id) {
      joinTeamChannel(team._id)
    }
  }, [team?._id])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [teamMessages])

  // Clear partner choices when question changes
  useEffect(() => {
    useTeamStore.getState().clearPartnerChoices()
    setMyChoice(null)
  }, [question?._id])

  const handleOptionClick = (idx) => {
    if (hasSubmitted) return
    setMyChoice(idx)
    sendTeamOptionSelect(team._id, idx)
  }

  const handleSubmit = () => {
    if (myChoice === null || hasSubmitted) return
    onSubmit(myChoice)
    // Trigger consensus check after a brief delay for DB write
    setTimeout(() => {
      checkTeamConsensus(roomId, question._id)
    }, 1000)
  }

  const handleSendMessage = () => {
    if (!inputText.trim()) return
    sendTeamMessage(team._id, inputText.trim())
    setInputText('')
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  if (!question || !team) return null

  return (
    <div style={{ position: 'relative' }}>
      {/* Consensus Celebration Overlay */}
      {consensusCelebration && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(16,185,129,0.15)', borderRadius: '16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeInOut 3s ease forwards',
          pointerEvents: 'none'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎉</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#10b981' }}>CONSENSUS BONUS!</div>
            <div style={{ fontSize: '16px', color: '#34d399' }}>1.5x Points Multiplier</div>
          </div>
        </div>
      )}

      {/* Team Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(6,182,212,0.1))',
        padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.2)'
      }}>
        <span style={{ fontSize: '28px' }}>{team.avatar}</span>
        <div>
          <div style={{ fontWeight: '700', color: 'var(--text-primary, #f1f5f9)', fontSize: '16px' }}>{team.name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
            {team.members?.map(m => m.name || 'Student').join(' • ')}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: '20px', fontWeight: '800', color: '#34d399' }}>{team.points || 0}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>pts</div>
        </div>
      </div>

      {/* Main Split Layout */}
      <div style={{ display: 'flex', gap: '16px', minHeight: '400px' }}>
        {/* LEFT: Question + Options */}
        <div style={{
          flex: '0 0 62%', background: 'var(--bg-card, #1e293b)', borderRadius: '14px',
          padding: '20px', border: '1px solid var(--border-color, #334155)'
        }}>
          <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary, #f1f5f9)', fontSize: '17px', lineHeight: 1.5 }}>
            {question.question || question.text}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(question.options || []).map((opt, idx) => {
              const isMyChoice = myChoice === idx
              const partnerIds = Object.entries(partnerChoices).filter(([, v]) => v === idx).map(([k]) => k)
              const partnerNames = partnerIds.map(pid => {
                const member = team.members?.find(m => (m._id || m) === pid)
                return member?.name || 'Partner'
              })

              return (
                <button
                  key={idx}
                  onClick={() => handleOptionClick(idx)}
                  disabled={hasSubmitted}
                  style={{
                    padding: '14px 16px', borderRadius: '10px', border: 'none',
                    background: isMyChoice
                      ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                      : hasSubmitted ? '#1e293b' : '#0f172a',
                    color: 'var(--text-primary, #e2e8f0)',
                    fontSize: '15px', cursor: hasSubmitted ? 'not-allowed' : 'pointer',
                    textAlign: 'left', transition: 'all 0.2s ease',
                    boxShadow: isMyChoice ? '0 0 20px rgba(99,102,241,0.3)' : 'none',
                    opacity: hasSubmitted && !isMyChoice ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}
                >
                  <span>{opt.text || opt}</span>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {partnerNames.map((name, i) => (
                      <span key={i} style={{
                        background: '#10b981', padding: '2px 8px', borderRadius: '10px',
                        fontSize: '11px', color: '#fff', fontWeight: '600',
                        animation: 'fadeIn 0.3s ease'
                      }}>
                        👤 {name}
                      </span>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={myChoice === null || hasSubmitted}
            style={{
              marginTop: '16px', width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
              background: hasSubmitted
                ? 'linear-gradient(135deg, #059669, #10b981)'
                : myChoice === null ? '#334155' : 'linear-gradient(135deg, #6366f1, #06b6d4)',
              color: '#fff', fontSize: '16px', fontWeight: '700',
              cursor: hasSubmitted || myChoice === null ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
            {hasSubmitted ? '✓ Submitted — Waiting for Team' : 'Submit Answer'}
          </button>
        </div>

        {/* RIGHT: Team Chat */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          background: 'var(--bg-card, #1e293b)', borderRadius: '14px',
          border: '1px solid var(--border-color, #334155)', overflow: 'hidden'
        }}>
          {/* Chat Header */}
          <div style={{
            padding: '12px 16px', background: 'rgba(99,102,241,0.1)',
            borderBottom: '1px solid var(--border-color, #334155)',
            fontWeight: '700', fontSize: '14px', color: 'var(--text-primary, #e2e8f0)'
          }}>
            💬 Team Chat
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, padding: '12px', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: '8px'
          }}>
            {teamMessages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', padding: '20px 0' }}>
                Discuss with your team! 💬
              </div>
            )}
            {teamMessages.map((m, idx) => {
              const isMe = m.studentId === student?._id
              return (
                <div key={idx} style={{
                  alignSelf: isMe ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  background: isMe ? 'rgba(99,102,241,0.2)' : 'rgba(51,65,85,0.5)',
                  padding: '8px 12px', borderRadius: '10px',
                  borderBottomRightRadius: isMe ? '2px' : '10px',
                  borderBottomLeftRadius: isMe ? '10px' : '2px'
                }}>
                  {!isMe && (
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#6366f1', marginBottom: '2px' }}>
                      {m.studentName}
                    </div>
                  )}
                  <div style={{ fontSize: '13px', color: 'var(--text-primary, #e2e8f0)', wordBreak: 'break-word' }}>
                    {m.text}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', textAlign: 'right' }}>
                    {m.timestamp}
                  </div>
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{
            display: 'flex', borderTop: '1px solid var(--border-color, #334155)'
          }}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value.slice(0, 200))}
              onKeyDown={handleKeyPress}
              placeholder="Type a message..."
              maxLength={200}
              style={{
                flex: 1, border: 'none', padding: '12px 14px',
                background: 'transparent', color: 'var(--text-primary, #e2e8f0)',
                fontSize: '14px', outline: 'none'
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim()}
              style={{
                background: inputText.trim() ? '#6366f1' : 'transparent',
                border: 'none', color: '#fff', padding: '12px 18px',
                cursor: inputText.trim() ? 'pointer' : 'default',
                fontSize: '14px', fontWeight: '600', transition: 'background 0.2s'
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Inline keyframe styles */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        @keyframes fadeInOut { 0% { opacity: 0; } 10% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>
    </div>
  )
}
