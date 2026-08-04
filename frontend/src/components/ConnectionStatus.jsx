// frontend/src/components/ConnectionStatus.jsx
import React from 'react'

const ConnectionStatus = ({ 
  isConnected, 
  hasAnsweredPoll, 
  onLeaveSession, 
  leaveSessionDisabled 
}) => {
  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '16px',
      padding: '16px 24px',
      boxShadow: 'var(--card-shadow)',
      border: '1px solid var(--border-color)',
      marginBottom: '24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: isConnected ? '#10b981' : '#ef4444'
        }} />
        <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500' }}>
          {isConnected ? 'Connected' : 'Reconnecting...'}
        </span>
      </div>
      <button
        onClick={onLeaveSession}
        disabled={leaveSessionDisabled}
        title={hasAnsweredPoll ? 'You cannot leave after answering a question' : 'Leave the session'}
        style={{
          padding: '8px 16px',
          background: hasAnsweredPoll ? 'var(--border-color)' : '#ef4444',
          color: hasAnsweredPoll ? 'var(--text-secondary)' : 'white',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: '600',
          cursor: hasAnsweredPoll ? 'not-allowed' : 'pointer',
          opacity: hasAnsweredPoll ? 0.6 : 1
        }}
      >
        Leave
      </button>
    </div>
  )
}

export default ConnectionStatus