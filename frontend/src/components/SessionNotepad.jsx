import React, { useState, useEffect, useRef } from 'react'

/**
 * SessionNotepad — a floating, draggable notepad for students during a session.
 * Saves notes locally per room so they persist if the user refreshes.
 */
export default function SessionNotepad({ roomCode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [position, setPosition] = useState({ x: window.innerWidth - 340, y: window.innerHeight - 400 })
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 })

  // Load saved notes
  useEffect(() => {
    if (!roomCode) return
    const saved = localStorage.getItem(`spandan_notes_${roomCode}`)
    if (saved) setNotes(saved)
  }, [roomCode])

  // Save notes
  const handleNotesChange = (e) => {
    const val = e.target.value
    setNotes(val)
    if (roomCode) {
      localStorage.setItem(`spandan_notes_${roomCode}`, val)
    }
  }

  // Drag logic
  const handlePointerDown = (e) => {
    e.preventDefault() // prevent text selection while dragging
    setIsDragging(true)
    dragRef.current = {
      startX: e.clientX || (e.touches && e.touches[0].clientX),
      startY: e.clientY || (e.touches && e.touches[0].clientY),
      initialX: position.x,
      initialY: position.y
    }
  }

  useEffect(() => {
    if (!isDragging) return
    const handlePointerMove = (e) => {
      const clientX = e.clientX || (e.touches && e.touches[0].clientX)
      const clientY = e.clientY || (e.touches && e.touches[0].clientY)
      if (!clientX || !clientY) return

      const dx = clientX - dragRef.current.startX
      const dy = clientY - dragRef.current.startY
      
      let newX = dragRef.current.initialX + dx
      let newY = dragRef.current.initialY + dy
      
      // Boundaries
      newX = Math.max(0, Math.min(newX, window.innerWidth - 300))
      newY = Math.max(0, Math.min(newY, window.innerHeight - 40))

      setPosition({ x: newX, y: newY })
    }

    const handlePointerUp = () => setIsDragging(false)

    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
    window.addEventListener('touchmove', handlePointerMove, { passive: false })
    window.addEventListener('touchend', handlePointerUp)

    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
      window.removeEventListener('touchmove', handlePointerMove)
      window.removeEventListener('touchend', handlePointerUp)
    }
  }, [isDragging])

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-primary"
        style={{
          position: 'fixed', right: '24px', bottom: '24px',
          borderRadius: '50%', width: '56px', height: '56px',
          padding: 0, zIndex: 90,
          boxShadow: '0 8px 24px rgba(124,58,237,.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '24px'
        }}
      >
        📝
      </button>

      {/* Notepad Window */}
      {isOpen && (
        <div style={{
          position: 'fixed', left: position.x, top: position.y,
          width: '300px', height: '340px',
          background: 'var(--bg-glass)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(167,139,250,.3)', borderRadius: '16px',
          boxShadow: '0 12px 40px rgba(0,0,0,.2)',
          display: 'flex', flexDirection: 'column',
          zIndex: 95, overflow: 'hidden',
          transition: isDragging ? 'none' : 'transform 0.2s',
          transform: isOpen ? 'scale(1)' : 'scale(0.9)',
        }}>
          {/* Header (Drag Handle) */}
          <div
            className="drag-handle"
            onMouseDown={handlePointerDown}
            onTouchStart={handlePointerDown}
            style={{
              padding: '12px 16px', background: 'rgba(0,0,0,.03)',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              userSelect: 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px' }}>📝</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>My Notes</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: .5, fontSize: '18px' }}
            >
              ×
            </button>
          </div>
          
          {/* Text Area */}
          <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column' }}>
            <textarea
              className="notepad-textarea"
              value={notes}
              onChange={handleNotesChange}
              placeholder="Jot down formulas, thoughts, or questions here..."
              spellCheck="false"
            />
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'right', marginTop: '8px' }}>
              Saved locally
            </div>
          </div>
        </div>
      )}
    </>
  )
}
