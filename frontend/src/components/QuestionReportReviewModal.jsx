import React, { useState } from 'react'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'

function QuestionReportReviewModal({ report, question, onClose, onResolved, roomCode, socket }) {
  const token = useAuthStore(s => s.token)
  const [editMode, setEditMode] = useState(false)
  const [editedQuestion, setEditedQuestion] = useState(question?.question || '')
  const [editedOptions, setEditedOptions] = useState(question?.options || [])
  const [editedExplanation, setEditedExplanation] = useState(question?.explanation || '')
  const [editedPoints, setEditedPoints] = useState(question?.points || 100)
  const [editedTime, setEditedTime] = useState(question?.timeToAnswer || 30)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  if (!report || !question) return null

  const handleNoMistake = async () => {
    setIsSaving(true)
    try {
      const response = await fetch(`${API_URL}/reports/${report.reportId || report._id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'Rejected' })
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update report')
      }
      onResolved?.('rejected', report)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveCorrection = async () => {
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/reports/${report.reportId || report._id}/correct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          question: editedQuestion,
          options: editedOptions,
          explanation: editedExplanation,
          points: editedPoints,
          timeToAnswer: editedTime,
          roomCode
        })
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save correction')
      }

      if (socket && data.question) {
        socket.emit('new_question', { roomCode, question: data.question })
      }

      onResolved?.('accepted', report, data.question)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const toggleCorrect = (index) => {
    setEditedOptions(prev => prev.map((opt, i) => ({
      ...opt,
      isCorrect: i === index
    })))
  }

  const ai = report.aiAnalysis

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.75)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 4000
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: '16px', padding: '24px',
        width: '640px', maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)' }}>Review Question Report</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ background: 'var(--bg-primary)', borderRadius: '10px', padding: '12px', marginBottom: '16px', fontSize: '13px' }}>
          <p style={{ margin: '0 0 4px' }}><strong>Student:</strong> {report.studentName}</p>
          <p style={{ margin: '0 0 4px' }}><strong>Reason:</strong> {report.reportType}</p>
          <p style={{ margin: 0 }}><strong>Message:</strong> {report.message}</p>
        </div>

        {ai && (
          <div style={{
            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '10px', padding: '12px', marginBottom: '16px', fontSize: '13px'
          }}>
            <p style={{ margin: '0 0 6px', fontWeight: '600', color: '#6366f1' }}>🤖 AI Analysis (Confidence: {ai.confidenceScore}%)</p>
            <p style={{ margin: '0 0 4px' }}><strong>Suggestion:</strong> {ai.suggestedCorrection}</p>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{ai.reasoning}</p>
          </div>
        )}

        {!editMode ? (
          <>
            <p style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>{question.question}</p>
            {(question.options || []).map((opt, idx) => (
              <div key={idx} style={{
                padding: '8px 12px', marginBottom: '6px', borderRadius: '8px',
                background: opt.isCorrect ? '#d1fae5' : 'var(--bg-primary)',
                border: `1px solid ${opt.isCorrect ? '#059669' : 'var(--border-color)'}`,
                fontSize: '13px'
              }}>
                {String.fromCharCode(65 + idx)}. {opt.text} {opt.isCorrect && '✓'}
              </div>
            ))}
          </>
        ) : (
          <>
            <textarea
              value={editedQuestion}
              onChange={(e) => setEditedQuestion(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', marginBottom: '12px', boxSizing: 'border-box' }}
            />
            {editedOptions.map((opt, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                <input
                  type="radio"
                  checked={opt.isCorrect}
                  onChange={() => toggleCorrect(idx)}
                  name="correctOption"
                />
                <input
                  value={opt.text}
                  onChange={(e) => setEditedOptions(prev => prev.map((o, i) => i === idx ? { ...o, text: e.target.value } : o))}
                  style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
            ))}
            <textarea
              value={editedExplanation}
              onChange={(e) => setEditedExplanation(e.target.value)}
              placeholder="Explanation"
              rows={2}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', marginBottom: '12px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '12px' }}>
              <input type="number" value={editedPoints} onChange={(e) => setEditedPoints(Number(e.target.value))} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} placeholder="Points" />
              <input type="number" value={editedTime} onChange={(e) => setEditedTime(Number(e.target.value))} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} placeholder="Time (s)" />
            </div>
          </>
        )}

        {error && <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '12px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
          <button
            onClick={handleNoMistake}
            disabled={isSaving}
            style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#6b7280', color: 'white', fontWeight: '600', cursor: 'pointer', minWidth: '120px' }}
          >
            ✔ No Mistake
          </button>
          {!editMode ? (
            <button
              onClick={() => setEditMode(true)}
              style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#3b82f6', color: 'white', fontWeight: '600', cursor: 'pointer', minWidth: '120px' }}
            >
              ✏ Edit Question
            </button>
          ) : (
            <button
              onClick={handleSaveCorrection}
              disabled={isSaving}
              style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#10b981', color: 'white', fontWeight: '600', cursor: isSaving ? 'not-allowed' : 'pointer', minWidth: '120px' }}
            >
              {isSaving ? 'Saving...' : 'Save & Relaunch'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default QuestionReportReviewModal
