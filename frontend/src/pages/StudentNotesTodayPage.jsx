import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import NoteViewerModal from '../components/NoteViewerModal'
import { API_URL } from '../config.js'

export default function StudentNotesTodayPage() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedNote, setSelectedNote] = useState(null)

  useEffect(() => {
    fetchTodayNotes()
  }, [])

  const fetchTodayNotes = async () => {
    setLoading(true)
    setError('')
    try {
      const today = new Date().toISOString().split('T')[0]
      const response = await fetch(`${API_URL}/notes?date=${today}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch notes')
      
      setNotes(data.notes || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
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
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Notes of the Day</h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>Today's class notes released by teachers</p>
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
            <div style={{ color: 'var(--text-secondary)' }}>Loading today's notes...</div>
          ) : notes.length === 0 ? (
            <div style={{ background: 'var(--bg-card)', padding: '40px', borderRadius: '16px', textAlign: 'center', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
              No notes have been released today yet.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
              {notes.map(note => (
                <div 
                  key={note._id}
                  onClick={() => setSelectedNote(note)}
                  style={{
                    background: 'var(--bg-card)',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: 'var(--card-shadow)',
                    border: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)', fontWeight: '600' }}>{note.title}</h3>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
                    By {note.teacher?.name || 'Teacher'}
                  </p>
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
