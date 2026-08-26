import React, { useState, useEffect } from 'react';
import { soundNotificationService } from '../services/soundNotificationService';

export default function SoundAlertToggle() {
  // Read initial state from service
  const [isMuted, setIsMuted] = useState(soundNotificationService.muted);
  const [showTest, setShowTest] = useState(false);

  const toggleMute = () => {
    const newMuted = soundNotificationService.toggleMute();
    setIsMuted(newMuted);
  };

  const testSound = () => {
    if (!isMuted) {
      soundNotificationService.playChime();
    }
  };

  return (
    <div className="relative" onMouseEnter={() => setShowTest(true)} onMouseLeave={() => setShowTest(false)}>
      <button
        onClick={toggleMute}
        style={{
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.2)',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: '8px' // Space from ThemeToggle
        }}
        title={isMuted ? 'Unmute Alerts' : 'Mute Alerts'}
      >
        {isMuted ? '🔇' : '🔊'}
      </button>
      
      {showTest && !isMuted && (
        <div 
          className="absolute top-full right-0 mt-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-lg p-2 z-50 whitespace-nowrap"
          style={{ 
            background: 'var(--bg-card, #2d3748)', 
            borderColor: 'var(--border-color, #4a5568)',
            color: 'var(--text-primary, #fff)'
          }}
        >
          <button 
            onClick={testSound}
            className="text-sm px-3 py-1 rounded hover:bg-white/10 transition-colors"
          >
            Test Chime
          </button>
        </div>
      )}
    </div>
  );
}
