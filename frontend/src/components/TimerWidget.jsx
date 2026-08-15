// frontend/src/components/TimerWidget.jsx
import React, { useEffect, useState } from 'react'
import { playTimerWarningSound } from '../services/soundService'

const TimerWidget = ({ 
  timeLeft, 
  maxTime, 
  isActive, 
  onTimerExpire,
  warningThreshold = 5
}) => {
  const [warning, setWarning] = useState(false)
  
  useEffect(() => {
    if (timeLeft === warningThreshold && isActive) {
      setWarning(true)
      playTimerWarningSound()
    } else if (timeLeft > warningThreshold) {
      setWarning(false)
    }
  }, [timeLeft, isActive, warningThreshold])
  
  const getTimeColor = () => {
    if (timeLeft <= 0) return '#ef4444'
    if (warning) return '#ef4444'
    if (timeLeft <= 5) return '#f59e0b'
    return '#10b981'
  }
  
  const getTimeDisplay = () => {
    const minutes = Math.floor(timeLeft / 60)
    const seconds = timeLeft % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }
  
  return (
    <div style={{ textAlign: 'center', marginBottom: '24px' }}>
      <div style={{
        width: '100px',
        height: '100px',
        borderRadius: '50%',
        border: `4px solid ${getTimeColor()}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 16px',
        background: warning ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
        animation: warning ? 'pulse 0.5s infinite' : 'none'
      }}>
        <span style={{ fontSize: '24px', fontWeight: '700', color: getTimeColor() }}>
          {timeLeft > 0 ? getTimeDisplay() : '0:00'}
        </span>
      </div>
      <p style={{ fontSize: '14px', color: getTimeColor(), fontWeight: '600' }}>
        {timeLeft > 0 ? 'Time remaining' : 'Time expired'}
      </p>
      {warning && (
        <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '8px', fontWeight: '600' }}>
          ⚠️ Warning: 5 seconds left!
        </p>
      )}
      {timeLeft <= 0 && (
        <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '8px', fontStyle: 'italic' }}>
          ⏱️ Time&apos;s up!
        </p>
      )}
    </div>
  )
}

export default TimerWidget