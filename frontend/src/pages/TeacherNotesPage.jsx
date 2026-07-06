import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import { API_URL } from '../config.js'

export default function TeacherNotesPage() {
  const navigate = useNavigate()
  const { roomId: urlRoomId } = useParams()
  const { user, token } = useAuthStore()
  const { rooms, fetchRooms } = useRoomStore()
  
  const [selectedRoomId, setSelectedRoomId] = useState(urlRoomId || '')
  const [topic, setTopic] = useState('')
  const [transcript, setTranscript] = useState('') // manual transcript input
  const [pendingNotes, setPendingNotes] = useState([])
  
  const [selectedNote, setSelectedNote] = useState(null) // note currently being reviewed
  const [editTitle, setEditTitle] = useState('')
  const [editTopic, setEditTopic] = useState('')
  const [editContent, setEditContent] = useState('')

  const [isGenerating, setIsGenerating] = useState(false)
  const [isActioning, setIsActioning] = useState(false)
  const [error, setError] = useState('')
  const [toastMessage, setToastMessage] = useState('')

  useEffect(() => {
    fetchRooms()
  }, [])

  useEffect(() => {
    if (!selectedRoomId && rooms?.length > 0) {
      const active = rooms.filter(r => !r.endedAt)
      setSelectedRoomId(active.length > 0 ? active[0]._id : rooms[0]._id)
    }
  }, [rooms, selectedRoomId])

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(''), 3000)
      return () => clearTimeout(timer)
    }
  }, [toastMessage])

  const fetchPendingNotes = async () => {
    if (!selectedRoomId) return
    try {
      const res = await fetch(`${API_URL}/notes/room/${selectedRoomId}?status=pending_review`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setPendingNotes(data.notes || [])
      }
    } catch (err) {
      console.error('Failed to fetch pending notes', err)
    }
  }

  useEffect(() => {
    fetchPendingNotes()
  }, [selectedRoomId, token])

  const handleManualGenerate = async () => {
    if (!transcript.trim()) {
      setError('Please provide a transcript to generate notes from.')
      return
    }
    setIsGenerating(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/notes/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          roomId: selectedRoomId,
          topic, 
          transcript,
          provider: 'minimax' 
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to generate notes')
      
      setToastMessage('Note generated and added to review queue!')
      setTopic('')
      setTranscript('')
      fetchPendingNotes()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const openReview = (note) => {
    setSelectedNote(note)
    setEditTitle(note.title)
    setEditTopic(note.topic)
    setEditContent(note.content)
  }

  const closeReview = () => {
    setSelectedNote(null)
  }

  const handleSaveDraft = async () => {
    setIsActioning(true)
    try {
      const response = await fetch(`${API_URL}/notes/${selectedNote._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: editTitle, topic: editTopic, content: editContent })
      })
      if (!response.ok) throw new Error('Failed to save draft')
      setToastMessage('Draft saved.')
      fetchPendingNotes()
      closeReview()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsActioning(false)
    }
  }

  const handleRelease = async () => {
    setIsActioning(true)
    try {
      // First save any edits
      await fetch(`${API_URL}/notes/${selectedNote._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: editTitle, topic: editTopic, content: editContent })
      })
      
      // Then release
      const response = await fetch(`${API_URL}/notes/${selectedNote._id}/release`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) throw new Error('Failed to release notes')
      
      setToastMessage('Notes released successfully!')
      fetchPendingNotes()
      closeReview()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsActioning(false)
    }
  }

  const handleDiscard = async () => {
    setIsActioning(true)
    try {
      const response = await fetch(`${API_URL}/notes/${selectedNote._id}/discard`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) throw new Error('Failed to discard notes')
      
      setToastMessage('Notes discarded.')
      fetchPendingNotes()
      closeReview()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsActioning(false)
    }
  }

  return (
    <div style={{
      display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <Sidebar user={user} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px' }}>
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Review & Generate Notes</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                <p style={{ margin: 0, opacity: 0.9, fontSize: '14px' }}>Review auto-generated segment notes or create manually for:</p>
                <select 
                  value={selectedRoomId} 
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                >
                  <option value="" disabled>Select a room...</option>
                  {rooms?.map(r => (
                    <option key={r._id} value={r._id}>{r.name} ({r.code})</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#dc2626', fontSize: '14px' }}>
              {error}
            </div>
          )}
          {toastMessage && (
            <div style={{ position: 'fixed', top: '20px', right: '20px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px', color: '#166534', fontSize: '14px', zIndex: 1000 }}>
              {toastMessage}
            </div>
          )}

          {!selectedNote ? (
            <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
              {/* Left Side: Pending Review Queue */}
              <div style={{
                flex: 1, background: 'var(--bg-card)', borderRadius: '16px', padding: '32px',
                boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)'
              }}>
                <h2 style={{ margin: '0 0 24px', fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)' }}>Review Queue</h2>
                
                {pendingNotes.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No notes pending review.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {pendingNotes.map(note => (
                      <div key={note._id} onClick={() => openReview(note)} style={{
                        padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)',
                        cursor: 'pointer', transition: 'background 0.2s', background: 'var(--input-bg)'
                      }} onMouseOver={e => e.currentTarget.style.background = 'var(--nav-hover)'} onMouseOut={e => e.currentTarget.style.background = 'var(--input-bg)'}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{note.topic || 'No Topic'}</span>
                          <span style={{ fontSize: '12px', background: note.transcriptSource === 'auto' ? '#dbeafe' : '#f3e8ff', color: note.transcriptSource === 'auto' ? '#1e40af' : '#6b21a8', padding: '2px 8px', borderRadius: '12px' }}>
                            {note.transcriptSource === 'auto' ? 'Auto-generated' : 'Manual'}
                          </span>
                        </div>
                        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{note.title}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Side: Manual Input Form */}
              <div style={{
                flex: 1, background: 'var(--bg-card)', borderRadius: '16px', padding: '32px',
                boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)'
              }}>
                <h2 style={{ margin: '0 0 24px', fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)' }}>Manual Generation</h2>
                
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '8px' }}>Topic Hint (Optional)</label>
                  <input
                    type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Data Structures Intro"
                    style={{ width: '100%', padding: '14px 16px', border: '2px solid var(--border-color)', borderRadius: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                  />
                </div>
                
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '8px' }}>Transcript (Required)</label>
                  <textarea
                    value={transcript} onChange={(e) => setTranscript(e.target.value)}
                    rows={8} placeholder="Paste or type the transcript here..."
                    style={{ width: '100%', padding: '14px 16px', border: '2px solid var(--border-color)', borderRadius: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: 'var(--input-bg)', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'monospace' }}
                  />
                </div>

                <button
                  onClick={handleManualGenerate}
                  disabled={isGenerating || !transcript.trim()}
                  style={{
                    width: '100%', padding: '14px', background: (isGenerating || !transcript.trim()) ? '#9ca3af' : '#3b82f6',
                    color: 'white', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: '600',
                    cursor: (isGenerating || !transcript.trim()) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isGenerating ? 'Generating Note...' : 'Generate Note'}
                </button>
              </div>
            </div>
          ) : (
            /* Note Review View */
            <div style={{
              background: 'var(--bg-card)', borderRadius: '16px', padding: '32px',
              boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)' }}>Review Note</h2>
                <button onClick={closeReview} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '24px' }}>&times;</button>
              </div>

              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '8px' }}>Topic</label>
                  <input type="text" value={editTopic} onChange={(e) => setEditTopic(e.target.value)} style={{ width: '100%', padding: '12px', border: '2px solid var(--border-color)', borderRadius: '8px', fontSize: '14px', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '8px' }}>Title</label>
                  <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ width: '100%', padding: '12px', border: '2px solid var(--border-color)', borderRadius: '8px', fontSize: '14px', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '8px' }}>Content (Markdown Supported)</label>
                <textarea
                  value={editContent} onChange={(e) => setEditContent(e.target.value)}
                  rows={15}
                  style={{ width: '100%', padding: '14px 16px', border: '2px solid var(--border-color)', borderRadius: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: 'var(--input-bg)', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'monospace' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
                <button onClick={handleDiscard} disabled={isActioning} style={{ padding: '12px 24px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '8px', fontWeight: '600', cursor: isActioning ? 'not-allowed' : 'pointer' }}>
                  Discard
                </button>
                <button onClick={handleSaveDraft} disabled={isActioning} style={{ padding: '12px 24px', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontWeight: '600', cursor: isActioning ? 'not-allowed' : 'pointer' }}>
                  Save Draft
                </button>
                <button onClick={handleRelease} disabled={isActioning} style={{ padding: '12px 24px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: isActioning ? 'not-allowed' : 'pointer' }}>
                  Release to Students
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
