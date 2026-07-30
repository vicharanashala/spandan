import React from 'react'

export default function NoteViewerModal({ note, onClose }) {
  if (!note) return null

  const handleDownload = () => {
    const element = document.createElement("a")
    const file = new Blob([note.content], { type: 'text/plain' })
    element.href = URL.createObjectURL(file)
    element.download = `${note.title || 'note'}.txt`
    document.body.appendChild(element) // Required for this to work in FireFox
    element.click()
    document.body.removeChild(element)
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '800px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--card-shadow)',
        border: '1px solid var(--border-color)',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text-primary)' }}>{note.title}</h2>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {new Date(note.date).toLocaleDateString()}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleDownload}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '14px'
              }}
            >
              Download (.txt)
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '14px'
              }}
            >
              Close
            </button>
          </div>
        </div>
        
        <div style={{
          padding: '24px',
          overflowY: 'auto',
          flex: 1,
          color: 'var(--text-primary)',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          {note.content}
        </div>
      </div>
    </div>
  )
}
