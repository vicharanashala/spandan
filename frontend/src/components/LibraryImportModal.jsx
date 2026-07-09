import React, { useState, useEffect } from 'react'
import { API_URL } from '../config.js'

export default function LibraryImportModal({ token, roomId, onClose, onImport }) {
  const [questions, setQuestions] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isImporting, setIsImporting] = useState(false)

  useEffect(() => {
    fetchLibrary()
  }, [])

  const fetchLibrary = async () => {
    try {
      const res = await fetch(`${API_URL}/library`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) {
        setQuestions(data.questions || [])
      }
    } catch (err) {
      console.error('Failed to fetch library:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleSelection = (id) => {
    const newSel = new Set(selectedIds)
    if (newSel.has(id)) newSel.delete(id)
    else newSel.add(id)
    setSelectedIds(newSel)
  }

  const handleImport = async () => {
    if (selectedIds.size === 0) return
    setIsImporting(true)
    try {
      const res = await fetch(`${API_URL}/library/import-to-room`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId,
          savedQuestionIds: Array.from(selectedIds)
        })
      })
      
      const data = await res.json()
      if (res.ok) {
        onImport(data.questions)
      } else {
        alert('Import failed: ' + data.error)
      }
    } catch (err) {
      console.error('Failed to import:', err)
      alert('Import failed.')
    } finally {
      setIsImporting(false)
      onClose()
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: '16px', padding: '24px', width: '90%', maxWidth: '600px',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)', color: 'var(--text-primary)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>📚 Import from Library</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>Loading...</div>
          ) : questions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
              Your library is empty.
            </div>
          ) : (
            questions.map(q => (
              <div key={q._id} onClick={() => toggleSelection(q._id)} style={{
                padding: '16px', border: `2px solid ${selectedIds.has(q._id) ? '#3b82f6' : 'var(--border-color)'}`,
                borderRadius: '12px', cursor: 'pointer', background: selectedIds.has(q._id) ? 'rgba(59,130,246,0.1)' : 'var(--bg-primary)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#3b82f6', background: '#eff6ff', padding: '2px 8px', borderRadius: '4px' }}>{q.type}</span>
                  {selectedIds.has(q._id) && <span style={{ color: '#3b82f6' }}>✓ Selected</span>}
                </div>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>{q.question}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '10px 16px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontWeight: '600'
          }}>
            Cancel
          </button>
          <button onClick={handleImport} disabled={selectedIds.size === 0 || isImporting} style={{
            padding: '10px 20px', background: 'linear-gradient(135deg, #4c1d95, #7c3aed)', color: 'white', border: 'none', borderRadius: '8px', cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: selectedIds.size === 0 ? 0.5 : 1
          }}>
            {isImporting ? 'Importing...' : `Import ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
