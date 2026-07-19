// Minimal inline SVG sparkline. No chart lib dependency.
// Renders a polyline of risk scores over time, with dots colored by zone.
// Expected data: [{ currentScore, zone, at: ISO-string }, ...] sorted oldest-first.

import React from 'react'

const ZONE_COLOR = {
  safe:    '#10b981', // emerald-500
  warning: '#f59e0b', // amber-500
  risk:    '#f43f5e'  // rose-500
}

export default function RiskScoreSparkline({ points, width = 600, height = 160, padding = 24 }) {
  if (!Array.isArray(points) || points.length === 0) {
    return <p className="text-xs text-gray-500">No data yet.</p>
  }

  // X axis: index (or timestamp). Y axis: 0..100.
  const xs = points.map((_, i) => i)
  const ys = points.map((p) => Math.max(0, Math.min(100, p.currentScore ?? 0)))

  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = 0
  const yMax = 100

  const sx = (x) => padding + (xMax === xMin ? width / 2 : ((x - xMin) / (xMax - xMin)) * (width - 2 * padding))
  const sy = (y) => height - padding - ((y - yMin) / (yMax - yMin)) * (height - 2 * padding)

  // Zone threshold guides
  const guideSafe    = sy(70)
  const guideWarning = sy(40)

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sy(p.currentScore ?? 0)}`).join(' ')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      {/* guides */}
      <line x1={padding} y1={guideSafe} x2={width - padding} y2={guideSafe} stroke="#10b981" strokeOpacity="0.25" strokeDasharray="4 4" />
      <line x1={padding} y1={guideWarning} x2={width - padding} y2={guideWarning} stroke="#f59e0b" strokeOpacity="0.25" strokeDasharray="4 4" />
      <text x={padding + 4} y={guideSafe - 4} fontSize="10" fill="#10b981" fillOpacity="0.6">70 (safe)</text>
      <text x={padding + 4} y={guideWarning - 4} fontSize="10" fill="#f59e0b" fillOpacity="0.6">40 (warning)</text>

      {/* line */}
      <path d={path} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {/* dots */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={sx(i)}
          cy={sy(p.currentScore ?? 0)}
          r={3}
          fill={ZONE_COLOR[p.zone] || ZONE_COLOR.safe}
        >
          <title>{p.at ? new Date(p.at).toLocaleString() : `point ${i}`}: {Math.round(p.currentScore ?? 0)} ({p.zone})</title>
        </circle>
      ))}
    </svg>
  )
}