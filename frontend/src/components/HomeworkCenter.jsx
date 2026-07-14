import React, { useState, useEffect } from 'react'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'
import HomeworkCard from './HomeworkCard'

function HomeworkCenter({ roomId }) {
  const token = useAuthStore(s => s.token)
  const user = useAuthStore(s => s.user)
  const [homeworks, setHomeworks] = useState([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [selectedStudent, setSelectedStudent] = useState('all')
  const [students, setStudents] = useState([])
  const [success, setSuccess] = useState('')
  const [previewHomework, setPreviewHomework] = useState(null)

  useEffect(() => {
    if (roomId && token) {
      fetchHomeworks()
      if (user?.role === 'teacher') {
        fetchStudents()
      }
    }
  }, [roomId, token])

  const fetchHomeworks = async () => {
    setLoading(true)
    try {
      const url = user?.role === 'teacher'
        ? `${API_URL}/insights/homework/${roomId}`
        : `${API_URL}/insights/homework/student/${user?._id}/${roomId}`

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.success) {
        setHomeworks(data.homework || [])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchStudents = async () => {
    try {
      const response = await fetch(`${API_URL}/rooms/${roomId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      // Students would ideally come from a dedicated endpoint
    } catch (_) { }
  }

  const handleGenerateAll = async () => {
    setGenerating(true)
    setError('')
    setSuccess('')
    try {
      const response = await fetch(`${API_URL}/insights/homework/generate-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roomId })
      })
      const data = await response.json()
      if (data.success) {
        setSuccess(`Generated homework for ${data.count} student(s)!`)
        fetchHomeworks()
      } else {
        setError(data.error || 'Generation failed')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const preview = (hw) => setPreviewHomework(hw)

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
        Loading homework...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Teacher Actions */}
      {user?.role === 'teacher' && (
        <>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '16px', padding: '20px',
            border: '1px solid var(--border-color)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
              📝 Homework Center
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              Generate personalized AI homework for students based on their individual weak areas and poll performance.
            </p>
            <button
              onClick={handleGenerateAll}
              disabled={generating}
              style={{
                padding: '12px 24px', borderRadius: '10px', border: 'none',
                background: generating ? 'var(--border-color)' : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                color: generating ? 'var(--text-secondary)' : 'white',
                fontSize: '14px', fontWeight: '600', cursor: generating ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}
            >
              {generating ? '⏳ Generating...' : '✨ Generate for All Students'}
            </button>
          </div>

          {success && (
            <div style={{
              padding: '12px', borderRadius: '8px',
              background: '#d1fae5', border: '1px solid #a7f3d0',
              color: '#065f46', fontSize: '13px'
            }}>
              {success}
            </div>
          )}
        </>
      )}

      {error && (
        <div style={{
          padding: '12px', borderRadius: '8px',
          background: '#fee2e2', color: '#dc2626', fontSize: '13px'
        }}>
          {error}
        </div>
      )}

      {/* Homework List */}
      {homeworks.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '32px', color: 'var(--text-secondary)',
          background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)'
        }}>
          <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>📚</span>
          <p style={{ margin: 0, fontSize: '14px' }}>No homework assigned yet.</p>
          <p style={{ margin: '4px 0 0', fontSize: '13px' }}>Complete a poll and generate homework for your students.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {homeworks.map((hw, idx) => (
            <div key={idx} onClick={() => preview(hw)} style={{ cursor: 'pointer' }}>
              <HomeworkCard homework={hw} />
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewHomework && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '20px', padding: '24px',
            width: '600px', maxWidth: '95vw', maxHeight: '85vh', overflow: 'auto',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)' }}>
                📝 {previewHomework.topic || 'Homework Preview'}
              </h2>
              <button onClick={() => setPreviewHomework(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                ✕
              </button>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              <strong>Difficulty:</strong> {previewHomework.difficulty} · {previewHomework.items?.length || 0} questions
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(previewHomework.items || []).map((item, idx) => (
                <div key={idx} style={{
                  padding: '16px', borderRadius: '12px',
                  background: 'var(--bg-primary)', border: '1px solid var(--border-color)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{
                      width: '24px', height: '24px', borderRadius: '50%',
                      background: '#3b82f6', color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: '700'
                    }}>
                      {idx + 1}
                    </span>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                      background: '#dbeafe', color: '#1e40af'
                    }}>
                      {item.type?.replace(/_/g, ' ')}
                    </span>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                      background: item.difficulty === 'easy' ? '#dcfce7' : item.difficulty === 'hard' ? '#fee2e2' : '#fef3c7',
                      color: item.difficulty === 'easy' ? '#166534' : item.difficulty === 'hard' ? '#991b1b' : '#92400e'
                    }}>
                      {item.difficulty}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                    {item.question}
                  </p>
                  {item.options?.length > 0 && (
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {item.options.map((opt, oi) => (
                        <div key={oi} style={{
                          padding: '6px 10px', borderRadius: '6px', fontSize: '13px',
                          background: opt.isCorrect ? '#d1fae5' : 'var(--bg-secondary)',
                          border: `1px solid ${opt.isCorrect ? '#059669' : 'var(--border-color)'}`,
                          color: opt.isCorrect ? '#065f46' : 'var(--text-primary)'
                        }}>
                          {String.fromCharCode(65 + oi)}. {opt.text}
                          {opt.isCorrect && <span style={{ float: 'right', fontSize: '12px' }}>✓</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {user?.role === 'teacher' && (
              <button
                onClick={() => setPreviewHomework(null)}
                style={{
                  width: '100%', marginTop: '16px', padding: '12px',
                  borderRadius: '10px', border: 'none',
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  color: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer'
                }}
              >
                Close Preview
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default HomeworkCenter
