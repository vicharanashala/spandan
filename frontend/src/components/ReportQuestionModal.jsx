import React, { useState } from 'react'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'

const REPORT_TYPES = [
  'Incorrect Answer',
  'Wrong Question',
  'Typographical Error',
  'Duplicate Question',
  'Ambiguous Question',
  'Missing Option',
  'Other'
]

function ReportQuestionModal({ isOpen, onClose, question, roomId, onSubmitted }) {
  const token = useAuthStore(s => s.token)
  const [reportType, setReportType] = useState(REPORT_TYPES[0])
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  if (!isOpen || !question) return null

  const questionId = question._id

  const handleSubmit = async () => {
    if (!message.trim()) {
      setError('Please describe the issue.')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch(`${API_URL}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId,
          questionId,
          reportType,
          message: message.trim()
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit report')
      }

      setSuccess(true)
      onSubmitted?.(questionId)
      setTimeout(() => {
        onClose()
        setSuccess(false)
        setMessage('')
        setReportType(REPORT_TYPES[0])
      }, 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 3000
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: '16px', padding: '24px',
        width: '480px', maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)' }}>Report Question</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
            <p style={{ color: '#10b981', fontWeight: '600', fontSize: '16px' }}>
              Your report has been sent to the teacher.
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {question.question}
            </p>

            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
              Report Type
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              style={{
                width: '100%', padding: '10px', borderRadius: '8px',
                border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', marginBottom: '16px', fontSize: '14px'
              }}
            >
              {REPORT_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>

            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
              Report Description (Required)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the issue with this question..."
              rows={4}
              style={{
                width: '100%', padding: '10px', borderRadius: '8px',
                border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', marginBottom: '16px', fontSize: '14px',
                resize: 'vertical', boxSizing: 'border-box'
              }}
            />

            {error && (
              <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>{error}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !message.trim()}
              style={{
                width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
                background: message.trim() && !isSubmitting ? '#ef4444' : 'var(--border-color)',
                color: message.trim() && !isSubmitting ? 'white' : 'var(--text-secondary)',
                fontSize: '14px', fontWeight: '600',
                cursor: message.trim() && !isSubmitting ? 'pointer' : 'not-allowed'
              }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default ReportQuestionModal
