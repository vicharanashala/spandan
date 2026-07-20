import React from 'react'

// Full-screen "Quiz Countdown" overlay shown to everyone in a room (teacher + students).
// Reused by RoomDetailPage (teacher) and StudentRoomPage (student) — do not duplicate this UI.
// Parent owns the countdown timer; this component is purely a controlled renderer.
//
// Props:
//   show       — whether the overlay is visible
//   value      — current seconds remaining (number)
//   onDismiss  — handler for the Dismiss button (parent decides whether to also stop the timer)
function QuizCountdownPopup({ show, value, onDismiss }) {
  if (!show) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        background: 'white',
        borderRadius: '24px',
        padding: '48px',
        textAlign: 'center',
        maxWidth: '400px',
        width: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <h2 style={{
          fontSize: '28px',
          fontWeight: '700',
          color: '#1f2937',
          margin: '0 0 24px 0'
        }}>
          Quiz Countdown
        </h2>
        <div style={{
          width: '160px',
          height: '160px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px'
        }}>
          <span style={{
            fontSize: '64px',
            fontWeight: '700',
            color: 'white'
          }}>
            {value}
          </span>
        </div>
        <p style={{
          fontSize: '18px',
          color: '#6b7280',
          margin: '0 0 24px 0'
        }}>
          Quiz starts in
        </p>
        <button
          onClick={onDismiss}
          style={{
            padding: '10px 28px',
            background: '#7c3aed',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

export default QuizCountdownPopup
