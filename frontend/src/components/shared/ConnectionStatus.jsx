import React from 'react';
import useSocketStore from '../../stores/socketStore';

export default function ConnectionStatus() {
  const { status, retryCount, connect } = useSocketStore();

  if (status === 'connected') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.7 }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
        <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Live</span>
      </div>
    );
  }

  if (status === 'reconnecting') {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        padding: '6px 12px', 
        background: '#fef9c3', 
        borderRadius: '8px',
        border: '1px solid #fde047'
      }}>
        <div style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          border: '2px solid #ca8a04',
          borderTopColor: 'transparent',
          animation: 'spin 1s linear infinite'
        }} />
        <span style={{ fontSize: '13px', fontWeight: '600', color: '#854d0e' }}>
          Reconnecting... ({retryCount}/5)
        </span>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Disconnected state
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '12px',
      padding: '6px 12px', 
      background: '#fee2e2', 
      borderRadius: '8px',
      border: '1px solid #f87171'
    }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: '13px', fontWeight: '600', color: '#991b1b' }}>Disconnected</span>
        <span style={{ fontSize: '11px', color: '#b91c1c' }}>Answers saved, will sync on reconnect</span>
      </div>
      <button 
        onClick={() => connect()} 
        style={{
          padding: '4px 8px',
          background: '#ef4444',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: '600',
          cursor: 'pointer'
        }}
      >
        Retry
      </button>
    </div>
  );
}
