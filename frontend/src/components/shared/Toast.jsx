import React, { useState, useEffect } from 'react';

// Simple event emitter for toasts
const toastEmitter = new EventTarget();

export const toast = {
  success: (message) => {
    toastEmitter.dispatchEvent(new CustomEvent('add_toast', { detail: { message, type: 'success' } }));
  }
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleAddToast = (e) => {
      const id = Date.now() + Math.random();
      const newToast = { id, ...e.detail };
      
      setToasts(prev => [...prev, newToast]);

      // Auto dismiss after 3 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 3000);
    };

    toastEmitter.addEventListener('add_toast', handleAddToast);
    return () => toastEmitter.removeEventListener('add_toast', handleAddToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      zIndex: 9999,
      pointerEvents: 'none'
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: 'auto'
        }}>
          {t.type === 'success' && (
            <span style={{ 
              color: '#10b981', 
              fontSize: '14px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: '#d1fae5'
            }}>✓</span>
          )}
          <span style={{ fontSize: '14px', fontWeight: '500' }}>{t.message}</span>
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
