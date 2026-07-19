import React, { useState, useEffect } from 'react'
import { API_URL } from '../config.js'

/**
 * RevisionSuggestions — Teacher-facing component shown on the results page.
 */
function RevisionSuggestions({ roomId, token }) {
  const [data, setData] = useState(null)
  const [notes, setNotes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reviewNote, setReviewNote] = useState(null)
  const [reviewDraft, setReviewDraft] = useState({ topic: '', title: '', content: '' })
  const [reviewSaving, setReviewSaving] = useState(false)

  const openReview = (note) => {
    setReviewNote(note)
    setReviewDraft({ topic: note.topic || '', title: note.title || '', content: note.content || '' })
  }

  const refreshNotes = async () => {
    const notesRes = await fetch(`${API_URL}/notes/room/${roomId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (notesRes.ok) {
      const notesJson = await notesRes.json()
      setNotes(notesJson.notes || [])
    }
  }

  const handleSaveDraft = async () => {
    if (!reviewNote) return
    setReviewSaving(true)
    try {
      const res = await fetch(`${API_URL}/notes/${reviewNote._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(reviewDraft)
      })
      if (!res.ok) throw new Error('Failed to save draft')
      await refreshNotes()
      setReviewNote(null)
    } catch (err) {
      alert(err.message)
    } finally {
      setReviewSaving(false)
    }
  }

  const handleRelease = async () => {
    if (!reviewNote) return
    setReviewSaving(true)
    try {
      const patchRes = await fetch(`${API_URL}/notes/${reviewNote._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(reviewDraft)
      })
      if (!patchRes.ok) throw new Error('Failed to save before releasing')

      const res = await fetch(`${API_URL}/notes/${reviewNote._id}/release`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to release note')
      await refreshNotes()
      setReviewNote(null)
    } catch (err) {
      alert(err.message)
    } finally {
      setReviewSaving(false)
    }
  }

  const handleDiscard = async () => {
    if (!reviewNote) return
    setReviewSaving(true)
    try {
      const res = await fetch(`${API_URL}/notes/${reviewNote._id}/discard`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to discard note')
      await refreshNotes()
      setReviewNote(null)
    } catch (err) {
      alert(err.message)
    } finally {
      setReviewSaving(false)
    }
  }

  useEffect(() => {
    if (!roomId || !token) return

    const fetchSuggestions = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const [res, notesRes] = await Promise.all([
          fetch(`${API_URL}/revision-suggestions/${roomId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`${API_URL}/notes/room/${roomId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ])
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to fetch suggestions')
        setData(json)

        if (notesRes.ok) {
          const notesJson = await notesRes.json()
          setNotes(notesJson.notes || [])
        }
      } catch (err) {
        console.error('RevisionSuggestions fetch error:', err)
        setError(err.message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSuggestions()
  }, [roomId, token])

  if (isLoading) {
    return (
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: 'var(--card-shadow)',
          border: '1px solid var(--border-color)'
        }}>
          <div style={{
            height: '20px',
            width: '220px',
            background: 'var(--border-color)',
            borderRadius: '6px',
            marginBottom: '16px',
            animation: 'pulse 1.5s ease-in-out infinite'
          }} />
          <div style={{
            height: '60px',
            background: 'var(--border-color)',
            borderRadius: '10px',
            animation: 'pulse 1.5s ease-in-out infinite'
          }} />
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          background: '#fef2f2',
          borderRadius: '14px',
          padding: '16px 20px',
          border: '1px solid #fecaca',
          color: '#991b1b',
          fontSize: '14px'
        }}>
          Could not load revision suggestions: {error}
        </div>
      </div>
    )
  }

  if (!data) return null

  const {
    reviseInClass,
    provideNotes,
    hardestQuestion,
    mostWrongTopic,
    recommendation,
    threshold
  } = data

  const noIssues = reviseInClass.length === 0 && provideNotes.length === 0

  const badgeColor = (pct) => {
    if (pct >= 70) return { bg: '#fee2e2', text: '#dc2626' }
    if (pct >= 40) return { bg: '#fef3c7', text: '#d97706' }
    return { bg: '#d1fae5', text: '#059669' }
  }

  const QuestionRow = ({ item, isHardest }) => {
    const [isGenerating, setIsGenerating] = useState(false)
    const badge = badgeColor(item.wrongPercentage)
    const displayLabel = item.topic && item.topic !== item.question ? item.topic : null

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '14px 16px',
        background: 'var(--bg-primary)',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            {isHardest && (
              <span style={{
                padding: '2px 8px',
                background: '#fef3c7',
                color: '#92400e',
                borderRadius: '6px',
                fontSize: '10px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Hardest
              </span>
            )}
            <span style={{
              padding: '2px 8px',
              background: '#eff6ff',
              color: '#3b82f6',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: '600'
            }}>
              {item.type}
            </span>
          </div>
          {displayLabel && (
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '2px' }}>
              {displayLabel}
            </div>
          )}
          <p style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: '500',
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical'
          }}>
            {item.question}
          </p>
        </div>

        <div style={{ textAlign: 'center', minWidth: '90px', flexShrink: 0 }}>
          <div style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '20px',
            background: badge.bg,
            color: badge.text,
            fontSize: '15px',
            fontWeight: '700'
          }}>
            {item.wrongPercentage}% wrong
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {item.wrongCount}/{item.totalResponses} got it wrong
          </div>
        </div>

        {/* Note Linkage Section */}
        <div style={{ flexShrink: 0, minWidth: '150px', textAlign: 'right' }}>
          {(() => {
            const relatedNote = notes.find(n => n.questionId && item.questionId && n.questionId.toString() === item.questionId.toString())
            if (relatedNote) {
              if (relatedNote.status === 'released') {
                return <span style={{ fontSize: '12px', color: '#059669', background: '#d1fae5', padding: '4px 8px', borderRadius: '4px' }}>📘 Note released</span>
              } else if (relatedNote.status === 'pending_review') {
                return (
                  <button
                    onClick={() => openReview(relatedNote)}
                    style={{ fontSize: '12px', color: '#d97706', background: '#fef3c7', padding: '4px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                  >
                    📝 Draft ready (Review)
                  </button>
                )
              } else {
                return <span style={{ fontSize: '12px', color: '#6b7280' }}>Note discarded</span>
              }
            } else {
              return (
                <button
                  onClick={async () => {
                    setIsGenerating(true)
                    try {
                      const res = await fetch(`${API_URL}/notes/generate-for-question`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ roomId, questionId: item.questionId })
                      })
                      if (!res.ok) {
                        const json = await res.json()
                        throw new Error(json.error || 'Failed to generate note')
                      }
                      const json = await res.json()
                      // Refresh notes to show draft status
                      await refreshNotes()
                      // Immediately open the review/release popup for this note
                      openReview(json.note)
                    } catch (err) {
                      alert(err.message)
                    } finally {
                      setIsGenerating(false)
                    }
                  }}
                  disabled={isGenerating}
                  style={{
                    fontSize: '12px',
                    color: isGenerating ? '#9ca3af' : '#3b82f6',
                    textDecoration: isGenerating ? 'none' : 'underline',
                    background: 'none',
                    border: 'none',
                    cursor: isGenerating ? 'wait' : 'pointer',
                    padding: 0
                  }}
                >
                  {isGenerating ? '⏳ Generating...' : '➕ Generate Note'}
                </button>
              )
            }
          })()}
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '24px' }} id="revision-suggestions">
      <h2 style={{
        margin: '0 0 16px',
        fontSize: '18px',
        fontWeight: '600',
        color: 'var(--text-primary)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        Revision Suggestions
      </h2>

      {/* Recommendation banner */}
      <div style={{
        background: noIssues
          ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)'
          : 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
        borderRadius: '14px',
        padding: '20px 24px',
        marginBottom: '16px',
        border: noIssues ? '1px solid #6ee7b7' : '1px solid #93c5fd',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '14px'
      }}>
        <span style={{ fontSize: '28px', lineHeight: 1 }}>
          {noIssues ? '🎉' : '💡'}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: '14px',
            fontWeight: '700',
            color: noIssues ? '#065f46' : '#1e40af',
            marginBottom: '4px'
          }}>
            Teacher Recommendation
          </div>
          <p style={{
            margin: 0,
            fontSize: '14px',
            color: noIssues ? '#047857' : '#1d4ed8',
            lineHeight: 1.6
          }}>
            {recommendation}
          </p>
          {!noIssues && (
            <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Classification threshold: {threshold}% wrong or above → revise in class
            </p>
          )}
        </div>
      </div>

      {/* Quick insights */}
      {!noIssues && (hardestQuestion || mostWrongTopic) && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '16px'
        }}>
          {hardestQuestion && (
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '12px',
              padding: '14px 16px',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--card-shadow)'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Hardest Question
              </div>
              <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                {hardestQuestion.wrongPercentage}% wrong
              </div>
            </div>
          )}
          {mostWrongTopic && (
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '12px',
              padding: '14px 16px',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--card-shadow)'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Most Wrong Topic
              </div>
              <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                {mostWrongTopic.topic} ({mostWrongTopic.totalWrong} mistakes)
              </div>
            </div>
          )}
        </div>
      )}

      {noIssues && (
        <div style={{
          textAlign: 'center',
          padding: '24px',
          background: 'var(--bg-card)',
          borderRadius: '14px',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--card-shadow)'
        }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>✨</div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
            No revision needed — every answered question was handled well!
          </p>
        </div>
      )}

      {/* Revise in Class */}
      {reviseInClass.length > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '14px',
          padding: '20px 24px',
          boxShadow: 'var(--card-shadow)',
          border: '1px solid var(--border-color)',
          borderLeft: '4px solid #ef4444',
          marginBottom: '16px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '16px'
          }}>
            <span style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px'
            }}>
              🔴
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                Revise in Class
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                {reviseInClass.length} question{reviseInClass.length !== 1 ? 's' : ''} — most students struggled with these
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {reviseInClass.map((item) => (
              <QuestionRow
                key={item.questionId}
                item={item}
                isHardest={hardestQuestion && item.questionId === hardestQuestion.questionId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Provide Notes */}
      {provideNotes.length > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '14px',
          padding: '20px 24px',
          boxShadow: 'var(--card-shadow)',
          border: '1px solid var(--border-color)',
          borderLeft: '4px solid #3b82f6'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '16px'
          }}>
            <span style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: '#dbeafe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px'
            }}>
              📝
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                Provide Notes
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                {provideNotes.length} question{provideNotes.length !== 1 ? 's' : ''} — only a few students got these wrong
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {provideNotes.map((item) => (
              <QuestionRow
                key={item.questionId}
                item={item}
                isHardest={hardestQuestion && item.questionId === hardestQuestion.questionId}
              />
            ))}
          </div>
        </div>
      )}

      {reviewNote && (
        <div
          onClick={() => !reviewSaving && setReviewNote(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', maxWidth: '700px', width: '90%', maxHeight: '85vh', overflowY: 'auto' }}
          >
            <h2 style={{ margin: '0 0 20px', color: 'var(--text-primary)' }}>Review Note</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>Topic</label>
                <input
                  value={reviewDraft.topic}
                  onChange={(e) => setReviewDraft(d => ({ ...d, topic: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>Title</label>
                <input
                  value={reviewDraft.title}
                  onChange={(e) => setReviewDraft(d => ({ ...d, title: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>Content (Markdown Supported)</label>
            <textarea
              value={reviewDraft.content}
              onChange={(e) => setReviewDraft(d => ({ ...d, content: e.target.value }))}
              rows={14}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '13px', resize: 'vertical' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button
                onClick={handleDiscard}
                disabled={reviewSaving}
                style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: reviewSaving ? 'not-allowed' : 'pointer', fontWeight: '600' }}
              >
                Discard
              </button>
              <button
                onClick={handleSaveDraft}
                disabled={reviewSaving}
                style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: reviewSaving ? 'not-allowed' : 'pointer', fontWeight: '600' }}
              >
                Save Draft
              </button>
              <button
                onClick={handleRelease}
                disabled={reviewSaving}
                style={{ padding: '10px 18px', borderRadius: '8px', border: 'none', background: '#059669', color: 'white', cursor: reviewSaving ? 'not-allowed' : 'pointer', fontWeight: '600' }}
              >
                {reviewSaving ? 'Working...' : 'Release to Students'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RevisionSuggestions
