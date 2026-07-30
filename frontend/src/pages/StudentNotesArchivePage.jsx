import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import NoteViewerModal from '../components/NoteViewerModal'
import { API_URL } from '../config.js'

export default function StudentNotesArchivePage() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  
  const [groupedNotes, setGroupedNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedNote, setSelectedNote] = useState(null)
  const [expandedDates, setExpandedDates] = useState({})

  useEffect(() => {
    fetchAllNotes()
  }, [])

  const fetchAllNotes = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/notes`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch notes')
      
      // Group by date string
      const grouped = (data.notes || []).reduce((acc, note) => {
        const dateStr = new Date(note.date).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
        if (!acc[dateStr]) acc[dateStr] = []
        acc[dateStr].push(note)
        return acc
      }, {})
      
      setGroupedNotes(grouped)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleDate = (dateStr) => {
    setExpandedDates(prev => ({
      ...prev,
      [dateStr]: !prev[dateStr]
    }))
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <Sidebar user={user} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px' }}>
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Class Notes Archive</h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>Browse all released notes by date</p>
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

          {loading ? (
            <div style={{ color: 'var(--text-secondary)' }}>Loading archive...</div>
          ) : Object.keys(groupedNotes).length === 0 ? (
            <div style={{ background: 'var(--bg-card)', padding: '40px', borderRadius: '16px', textAlign: 'center', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
              No notes are available in the archive yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '800px', margin: '0 auto' }}>
              {Object.entries(groupedNotes).map(([dateStr, dayNotes]) => (
                <div key={dateStr} style={{ 
                  background: 'var(--bg-card)', 
                  borderRadius: '12px', 
                  border: '1px solid var(--border-color)',
                  overflow: 'hidden',
                  boxShadow: 'var(--card-shadow)'
                }}>
                  <div 
                    onClick={() => toggleDate(dateStr)}
                    style={{
                      padding: '16px 24px',
                      background: 'var(--input-bg)',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontWeight: '600',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <span>{dateStr}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: '4px 8px', borderRadius: '12px' }}>
                      {dayNotes.length} Note{dayNotes.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  
                  {expandedDates[dateStr] && (
                    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {dayNotes.map(note => (
                        <div 
                          key={note._id}
                          onClick={() => setSelectedNote(note)}
                          style={{
                            padding: '16px',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'background 0.2s'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.background = 'var(--nav-hover)'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <div>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>{note.title}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>By {note.teacher?.name || 'Teacher'}</div>
                          </div>
                          <span style={{ color: '#3b82f6', fontSize: '14px', fontWeight: '500' }}>Read &rarr;</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {selectedNote && (
        <NoteViewerModal note={selectedNote} onClose={() => setSelectedNote(null)} />
      )}
    </div>
  )
}
