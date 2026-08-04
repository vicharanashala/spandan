import React, { useState, useEffect } from 'react'
import { API_URL } from '../config.js'

function QuestionTemplateBrowser({ isOpen, onClose, roomId, token, socket, onQuestionCreated }) {
  const [templates, setTemplates] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [importingId, setImportingId] = useState(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!isOpen || !token) return
    setIsLoading(true)
    fetch(`${API_URL}/questions/templates?limit=100`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        setTemplates(data.templates || [])
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))
  }, [isOpen, token])

  const handleImport = async (tpl) => {
    setImportingId(tpl._id)
    try {
      const res = await fetch(`${API_URL}/questions/templates/${tpl._id}/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ roomId })
      })
      const data = await res.json()
      if (data.success && data.question) {
        onQuestionCreated?.(data.question)
        if (socket) {
          socket.emit('new_question', { roomCode: null, question: data.question })
        }
      }
    } catch (err) {
      console.error('Failed to import template:', err)
    }
    setImportingId(null)
  }

  if (!isOpen) return null

  const filtered = filter
    ? templates.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()) || t.question.toLowerCase().includes(filter.toLowerCase()))
    : templates

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 2000
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: '16px', padding: '24px',
        width: '90%', maxWidth: '600px', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', border: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)' }}>Question Templates</h2>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', fontSize: '20px',
            cursor: 'pointer', color: 'var(--text-secondary)'
          }}>✕</button>
        </div>

        <input
          type="text"
          placeholder="Search templates..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)',
            background: 'var(--bg-primary)', color: 'var(--text-primary)',
            fontSize: '14px', marginBottom: '12px', outline: 'none'
          }}
        />

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>Loading templates...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
              {templates.length === 0 ? 'No templates yet. Save a question as template from the session.' : 'No matching templates.'}
            </div>
          ) : filtered.map(tpl => (
            <div key={tpl._id} style={{
              padding: '12px', borderRadius: '10px',
              background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px'
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{
                    padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: '600',
                    background: tpl.type === 'MCQ' ? '#3b82f620' : tpl.type === 'TF' ? '#10b98120' : '#8b5cf620',
                    color: tpl.type === 'MCQ' ? '#3b82f6' : tpl.type === 'TF' ? '#10b981' : '#8b5cf6',
                  }}>{tpl.type}</span>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-primary)' }}>{tpl.name}</span>
                  {tpl.usageCount > 0 && (
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>used {tpl.usageCount}x</span>
                  )}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tpl.question}
                </p>
                {(tpl.tags || []).length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                    {tpl.tags.map((tag, i) => (
                      <span key={i} style={{
                        padding: '1px 6px', borderRadius: '4px', fontSize: '9px',
                        background: '#e2e8f0', color: '#475569'
                      }}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleImport(tpl)}
                disabled={importingId === tpl._id}
                style={{
                  padding: '6px 14px', borderRadius: '6px',
                  background: importingId === tpl._id ? '#9ca3af' : '#3b82f6',
                  color: 'white', border: 'none', fontSize: '12px', fontWeight: '500',
                  cursor: importingId === tpl._id ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap', flexShrink: 0
                }}
              >
                {importingId === tpl._id ? '...' : 'Use'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default QuestionTemplateBrowser
