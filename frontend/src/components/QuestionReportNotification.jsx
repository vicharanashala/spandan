import React from 'react'

function QuestionReportNotification({ notification, onReview, onDismiss }) {
  if (!notification) return null

  return (
    <div style={{
      position: 'fixed',
      top: '24px',
      right: '24px',
      width: '360px',
      maxWidth: 'calc(100vw - 48px)',
      background: 'var(--bg-card)',
      borderRadius: '14px',
      padding: '20px',
      border: '2px solid #f59e0b',
      boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      zIndex: 5000,
      animation: 'slideIn 0.3s ease'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '24px' }}>⚠️</span>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Question Reported</h3>
      </div>

      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '16px' }}>
        <p style={{ margin: '0 0 4px' }}><strong style={{ color: 'var(--text-primary)' }}>Student:</strong> {notification.studentName}</p>
        <p style={{ margin: '0 0 4px' }}><strong style={{ color: 'var(--text-primary)' }}>Question:</strong> {notification.questionText?.substring(0, 80)}{(notification.questionText?.length > 80) ? '...' : ''}</p>
        <p style={{ margin: '0 0 4px' }}><strong style={{ color: 'var(--text-primary)' }}>Reason:</strong> {notification.reportType}</p>
        <p style={{ margin: 0 }}><strong style={{ color: 'var(--text-primary)' }}>Message:</strong> {notification.message}</p>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => onReview(notification)}
          style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: 'white', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}
        >
          Review
        </button>
        <button
          onClick={() => onDismiss(notification)}
          style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

export default QuestionReportNotification
