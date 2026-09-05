import React from 'react'

// Animated circular countdown ring that wraps around the remaining-seconds number.
// `timeLeft` ticks down each second; `total` is the question's full time budget. The ring
// sweeps from full (green) → amber (≤10s) → red (≤5s) so the color is a glanceable warning.
const TimerRing = ({ timeLeft, total = 30, size = 100 }) => {
  const pct = total > 0 ? Math.max(0, Math.min(1, timeLeft / total)) : 0

  const color = timeLeft <= 5 ? '#ef4444' : timeLeft <= 10 ? '#f59e0b' : '#10b981'

  const strokeWidth = 7
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  // SVG dashes start at 3 o'clock going clockwise; rotate -90° so we start at 12 o'clock.
  const offset = circumference * (1 - pct)

  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column'
        }}
      >
        <span style={{ fontSize: '36px', fontWeight: '700', color: 'white', lineHeight: 1 }}>
          {timeLeft}
        </span>
        {timeLeft <= 5 && (
          <span style={{ fontSize: '10px', fontWeight: '700', color, letterSpacing: '0.08em', marginTop: 2 }}>
            LEFT!
          </span>
        )}
      </div>
    </div>
  )
}

export default TimerRing
