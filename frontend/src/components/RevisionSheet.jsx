import React, { useState, useEffect } from 'react'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'
import RevisionPreview from './RevisionPreview'

function RevisionSheet({ roomId, refreshTrigger = 0 }) {
  const token = useAuthStore(s => s.token)
  const user = useAuthStore(s => s.user)
  const [sheets, setSheets] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [previewSheetId, setPreviewSheetId] = useState(null)

  useEffect(() => {
    if (roomId && token) fetchSheets()
  }, [roomId, token, refreshTrigger])

  const fetchSheets = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/insights/revision/${roomId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.success) {
        setSheets(data.sheets || [])
      } else {
        setError(data.error || 'Failed to load revision sheets')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    setSuccess('')

    console.log({
      roomId,
      questionId: undefined,
      sessionId: roomId,
      currentQuestion: undefined,
      selectedQuestion: undefined
    })

    if (!roomId) {
      setError('Please complete or select a classroom session before generating a revision sheet.')
      setGenerating(false)
      return
    }

    try {
      const response = await fetch(`${API_URL}/insights/revision/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roomId })
      })
      const data = await response.json()
      if (data.success) {
        setSuccess('Revision sheet generated!')
        fetchSheets()
      } else {
        setError(data.message || data.error || 'Generation failed')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const previewSheet = sheets.find(s => s._id === previewSheetId)

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
        Loading revision sheets...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {error && (
        <div style={{ padding: '12px', borderRadius: '8px', background: '#fee2e2', color: '#dc2626', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Teacher Generate Button */}
      {user?.role === 'teacher' && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: '16px', padding: '20px',
          border: '1px solid var(--border-color)'
        }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
            📄 AI Revision Sheet
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
            Generate a comprehensive revision sheet based on all questions answered in this session. Includes definitions, common mistakes, and practice questions.
          </p>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                padding: '12px 24px', borderRadius: '10px', border: 'none',
                background: generating ? 'var(--border-color)' : 'linear-gradient(135deg, #059669, #047857)',
                color: generating ? 'var(--text-secondary)' : 'white',
                fontSize: '14px', fontWeight: '600', cursor: generating ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}
            >
              {generating ? '⏳ Generating...' : '🚀 Generate Revision Sheet'}
            </button>
            {success && (
              <span style={{ fontSize: '13px', color: '#059669' }}>✓ {success}</span>
            )}
          </div>
        </div>
      )}

      {/* Student View */}
      {user?.role === 'student' && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: '16px', padding: '20px',
          border: '1px solid var(--border-color)'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
            📄 Revision Sheets
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '8px 0 0' }}>
            Review AI-generated revision materials created by your teacher.
          </p>
        </div>
      )}

      {/* Sheet List */}
      {sheets.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '32px', color: 'var(--text-secondary)',
          background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)'
        }}>
          <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>📄</span>
          <p style={{ margin: 0, fontSize: '14px' }}>No revision sheets yet.</p>
          <p style={{ margin: '4px 0 0', fontSize: '13px' }}>Complete polls to generate revision material.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sheets.map((sheet, idx) => {
            const isLatest = idx === 0
            return (
              <div
                key={sheet._id}
                onClick={() => setPreviewSheetId(sheet._id)}
                style={{
                  padding: '16px', borderRadius: '12px', cursor: 'pointer',
                  background: 'var(--bg-card)', border: `1px solid ${isLatest ? '#3b82f6' : 'var(--border-color)'}`,
                  transition: 'transform 0.2s'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    {sheet.title || `Revision Sheet #${sheets.length - idx}`}
                  </h4>
                  {isLatest && (
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px', fontSize: '11px',
                      background: '#dbeafe', color: '#1e40af', fontWeight: '600'
                    }}>
                      Latest
                    </span>
                  )}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {new Date(sheet.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  {sheet.keyConcepts?.length || 0} concepts · {sheet.practiceQuestions?.length || 0} practice Qs
                  · {sheet.mcqs?.length || 0} MCQs
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Preview Modal */}
      {previewSheet && (
        <RevisionPreview sheet={previewSheet} onClose={() => setPreviewSheetId(null)} />
      )}
    </div>
  )
}

export default RevisionSheet
