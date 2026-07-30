import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import NoteViewerModal from '../components/NoteViewerModal'
import { API_URL } from '../config.js'

export default function StudentNotesPage() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  
  const [groupedNotes, setGroupedNotes] = useState({})
  const [todayNotes, setTodayNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedNote, setSelectedNote] = useState(null)
  const [expandedRooms, setExpandedRooms] = useState({})
  const [weakTopics, setWeakTopics] = useState({}) // roomId -> [topics]

  useEffect(() => {
    fetchNotesHistory()
  }, [])

  const fetchNotesHistory = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/notes/student/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch notes history')
      
      const now = new Date()
      const isToday = (dateString) => {
        if (!dateString) return false
        const d = new Date(dateString)
        return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      }

      const grouped = {}
      const today = {}

      ;(data.notes || []).forEach(note => {
        const key = note.roomName || 'Unknown Room'
        const isNoteToday = isToday(note.roomDate)
        
        const targetGroup = isNoteToday ? today : grouped
        
        if (!targetGroup[key]) {
          targetGroup[key] = {
            roomId: note.roomId?._id || note.roomId,
            roomCode: note.roomCode,
            roomDate: note.roomDate,
            notes: []
          }
        }
        targetGroup[key].notes.push(note)
      })
      
      setTodayNotes(today)
      setGroupedNotes(grouped)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadWeakTopics = async (roomId) => {
    if (weakTopics[roomId]) return // already loaded
    try {
      const response = await fetch(`${API_URL}/revision-suggestions/${roomId}/student/${user._id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok && data.weakTopics) {
        setWeakTopics(prev => ({
          ...prev,
          [roomId]: data.weakTopics
        }))
      }
    } catch (err) {
      console.error('Failed to load weak topics for room:', roomId, err)
    }
  }

  const toggleRoom = (roomName, roomId) => {
    setExpandedRooms(prev => {
      const isExpanding = !prev[roomName]
      if (isExpanding && roomId) {
        loadWeakTopics(roomId)
      }
      return {
        ...prev,
        [roomName]: isExpanding
      }
    })
  }

  const isWeakTopicNote = (note) => {
    const roomId = note.roomId?._id || note.roomId
    const roomTopics = weakTopics[roomId]
    if (!roomTopics) return false
    return roomTopics.some(t => t.segmentIndex === note.segmentIndex)
  }

  const renderRoomGroup = ([roomName, roomData]) => (
    <div key={roomName} style={{ 
      background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)',
      overflow: 'hidden', boxShadow: 'var(--card-shadow)'
    }}>
      <div 
        onClick={() => toggleRoom(roomName, roomData.roomId)}
        style={{
          padding: '16px 24px', background: 'var(--input-bg)', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontWeight: '600', color: 'var(--text-primary)'
        }}
      >
        <div>
          <span>{roomName}</span>
          {roomData.roomDate && (
            <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
              — {new Date(roomData.roomDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          )}
        </div>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: '4px 8px', borderRadius: '12px' }}>
          {roomData.notes.length} Note{roomData.notes.length !== 1 ? 's' : ''}
        </span>
      </div>
      
      {expandedRooms[roomName] && (
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {roomData.notes.map(note => {
            const showWeakTag = isWeakTopicNote(note)
            return (
              <div 
                key={note._id}
                onClick={() => setSelectedNote(note)}
                style={{
                  padding: '16px', border: showWeakTag ? '2px solid #ef4444' : '1px solid var(--border-color)',
                  borderRadius: '8px', cursor: 'pointer', display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.2s',
                  background: showWeakTag ? '#fef2f2' : 'transparent'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = showWeakTag ? '#fee2e2' : 'var(--nav-hover)'}
                onMouseOut={(e) => e.currentTarget.style.background = showWeakTag ? '#fef2f2' : 'transparent'}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{note.title}</div>
                    {showWeakTag && (
                      <span style={{ fontSize: '10px', background: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                        ⚠️ Struggled with
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {note.topic} • By {note.teacherId?.name || 'Teacher'}
                  </div>
                </div>
                <span style={{ color: '#3b82f6', fontSize: '14px', fontWeight: '500' }}>Read &rarr;</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' }}>
      <Sidebar user={user} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px' }}>
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Notes & Revision</h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>Your class notes and personalized revision topics</p>
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
            <div style={{ color: 'var(--text-secondary)' }}>Loading notes history...</div>
          ) : Object.keys(groupedNotes).length === 0 && Object.keys(todayNotes).length === 0 ? (
            <div style={{ background: 'var(--bg-card)', padding: '40px', borderRadius: '16px', textAlign: 'center', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
              No notes are available yet. Check back after your teacher releases some!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px', margin: '0 auto' }}>
              {Object.keys(todayNotes).length > 0 && (
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: 'var(--text-primary)' }}>Today's Classes</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {Object.entries(todayNotes).map(renderRoomGroup)}
                  </div>
                </div>
              )}
              
              {Object.keys(groupedNotes).length > 0 && (
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: 'var(--text-primary)' }}>Past Classes</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {Object.entries(groupedNotes).map(renderRoomGroup)}
                  </div>
                </div>
              )}
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
