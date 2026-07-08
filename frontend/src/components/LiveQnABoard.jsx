import React, { useState, useEffect } from 'react'

export default function LiveQnABoard({ socket, roomCode, isTeacher, userName }) {
  const [questions, setQuestions] = useState([])
  const [newQuestion, setNewQuestion] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!socket) return

    const handleNew = (q) => {
      setQuestions(prev => {
        if (prev.find(x => x.id === q.id)) return prev
        return [...prev, q]
      })
      if (!isOpen) setUnreadCount(prev => prev + 1)
    }

    const handleUpvoted = ({ qnaId }) => {
      setQuestions(prev => prev.map(q => 
        q.id === qnaId ? { ...q, upvotes: q.upvotes + 1 } : q
      ))
    }

    const handleAnswered = ({ qnaId }) => {
      setQuestions(prev => prev.map(q => 
        q.id === qnaId ? { ...q, answered: true } : q
      ))
    }

    socket.on('qna:new', handleNew)
    socket.on('qna:upvoted', handleUpvoted)
    socket.on('qna:answered', handleAnswered)

    return () => {
      socket.off('qna:new', handleNew)
      socket.off('qna:upvoted', handleUpvoted)
      socket.off('qna:answered', handleAnswered)
    }
  }, [socket, isOpen])

  const submitQuestion = (e) => {
    e.preventDefault()
    if (!newQuestion.trim()) return
    const qnaId = Math.random().toString(36).substr(2, 9)
    socket.emit('qna:submit', { roomCode, qnaId, text: newQuestion.trim(), authorName: userName })
    setNewQuestion('')
  }

  const toggleOpen = () => {
    setIsOpen(!isOpen)
    if (!isOpen) setUnreadCount(0)
  }

  // Sort: unanswered first, then by upvotes
  const sortedQuestions = [...questions].sort((a, b) => {
    if (a.answered === b.answered) return b.upvotes - a.upvotes
    return a.answered ? 1 : -1
  })

  return (
    <>
      <button 
        onClick={toggleOpen}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: isTeacher ? 'auto' : '90px',
          left: isTeacher ? '24px' : 'auto',
          zIndex: 900,
          background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
          color: 'white',
          border: 'none',
          borderRadius: '50px',
          padding: '12px 20px',
          fontSize: '14px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: '0 8px 20px rgba(59, 130, 246, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'transform 0.2s',
          transform: isOpen ? 'scale(0.95)' : 'scale(1)'
        }}
      >
        <span>💬 Q&A Board</span>
        {unreadCount > 0 && (
          <span style={{
            background: '#ef4444',
            color: 'white',
            borderRadius: '10px',
            padding: '2px 6px',
            fontSize: '11px',
            fontWeight: '800'
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '80px',
          right: isTeacher ? 'auto' : '90px',
          left: isTeacher ? '24px' : 'auto',
          width: '320px',
          height: '450px',
          background: 'var(--bg-card)',
          borderRadius: '16px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 900,
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px', background: 'var(--header-bg)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700' }}>Live Q&A Board</h3>
            <button onClick={toggleOpen} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '18px' }}>×</button>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sortedQuestions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🤔</div>
                No questions yet. Be the first to ask!
              </div>
            ) : (
              sortedQuestions.map(q => (
                <div key={q.id} style={{ 
                  background: 'var(--bg-primary)', 
                  padding: '12px', 
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  opacity: q.answered ? 0.6 : 1
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>{q.authorName}</span>
                    {q.answered && <span style={{ fontSize: '10px', background: '#d1fae5', color: '#059669', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>Answered</span>}
                  </div>
                  <p style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    {q.text}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button 
                      onClick={() => !q.answered && socket.emit('qna:upvote', { roomCode, qnaId: q.id })}
                      disabled={q.answered}
                      style={{
                        background: 'rgba(59,130,246,0.1)',
                        color: '#3b82f6',
                        border: 'none',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: q.answered ? 'default' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      ▲ {q.upvotes}
                    </button>
                    {isTeacher && !q.answered && (
                      <button 
                        onClick={() => socket.emit('qna:answer', { roomCode, qnaId: q.id })}
                        style={{ background: '#10b981', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
                      >
                        Mark Answered
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {!isTeacher && (
            <form onSubmit={submitQuestion} style={{ padding: '12px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
              <input
                type="text"
                value={newQuestion}
                onChange={e => setNewQuestion(e.target.value)}
                placeholder="Ask a question..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                  fontSize: '13px'
                }}
              />
            </form>
          )}
        </div>
      )}
    </>
  )
}
