import React from 'react';

/**
 * LpsDonut renders a circular progress indicator (donut) for a percentage value.
 * It uses pure SVG and CSS for a sleek, premium look with a gradient stroke.
 *
 * Props:
 *   - percentage (number): value between 0 and 100.
 *   - size (number, optional): width and height of the SVG in pixels (default 120).
 *   - strokeWidth (number, optional): thickness of the donut stroke (default 12).
 *   - label (string, optional): optional text label displayed below the donut.
 */
function LpsDonut({
  percentage = 0,
  size = 120,
  strokeWidth = 12,
  label = 'Learning Progress Score',
}) {
  const clamped = Math.min(100, Math.max(0, percentage));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const gradientId = `gradient-${Math.random().toString(36).substr(2, 9)}`;

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    fontFamily: "'Inter', 'Roboto', 'Arial', sans-serif",
  };

  const textStyle = {
    fontSize: size * 0.2,
    fontWeight: 600,
    fill: 'var(--text-primary)',
  };

  return (
    <div style={containerStyle}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-color)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        {/* Center text */}
        <text
          x="50%"
          y="50%"
          dy="0.3em"
          textAnchor="middle"
          style={textStyle}
        >
          {`${clamped.toFixed(0)}%`}
        </text>
      </svg>
      {label && (
        <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: size * 0.1, textAlign: 'center' }}>
          {label}
        </div>
      )}
    </div>
  );
}

export default LpsDonut;
