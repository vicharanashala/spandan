// Reusable SVG bar chart for consecutive-day risk-score trend.
// One bar per calendar day; bar height = avg score of the day; bar color =
// worst zone of the day (so a single bad event in an otherwise great day
// still tints the bar appropriately).
//
// Props:
//   points: [{ date: 'YYYY-MM-DD', avgScore|null, minScore|null,
//              maxScore|null, endingScore|null, worstZone|null,
//              answered, skipped }]
//   onSelectDay: optional (date: string) => void  — invoked on bar click
//   height, width: optional dimensions

import React, { useMemo, useState } from 'react'

const ZONE_FILL = {
  safe: 'fill-emerald-500',
  warning: 'fill-amber-500',
  risk: 'fill-rose-500'
}

const ZONE_STROKE = {
  safe: 'stroke-emerald-600',
  warning: 'stroke-amber-600',
  risk: 'stroke-rose-600'
}

export default function RiskScoreDailyChart({ points = [], onSelectDay, height = 180, width = 720 }) {
  const [hoverIdx, setHoverIdx] = useState(null)

  const data = useMemo(() => points.map((p) => ({
    ...p,
    hasData: typeof p.avgScore === 'number'
  })), [points])

  const padding = { top: 18, right: 12, bottom: 28, left: 30 }
  const innerW = Math.max(50, width - padding.left - padding.right)
  const innerH = Math.max(50, height - padding.top - padding.bottom)
  const barGap = data.length > 30 ? 1 : 4
  const barW = Math.max(2, innerW / Math.max(1, data.length) - barGap)

  // Map score [0..100] → y top
  const yFor = (score) => padding.top + innerH - (Math.max(0, Math.min(100, score)) / 100) * innerH

  // Threshold lines for safe (70) and warning (40).
  const safeY = yFor(70)
  const warnY = yFor(40)

  // Tick labels for first/middle/last day (so the chart shows date anchors).
  const tickIdx = useMemo(() => {
    if (data.length === 0) return []
    if (data.length === 1) return [0]
    if (data.length <= 7) return data.map((_, i) => i)
    return [0, Math.floor(data.length / 2), data.length - 1]
  }, [data])

  return (
    <div className="w-full overflow-x-auto">
      <svg width={width} height={height} role="img" aria-label="Risk score trend by day" className="block">
        {/* Threshold dashed lines */}
        <line x1={padding.left} y1={safeY} x2={padding.left + innerW} y2={safeY}
              stroke="#10b981" strokeOpacity="0.35" strokeDasharray="4 4" strokeWidth="1" />
        <line x1={padding.left} y1={warnY} x2={padding.left + innerW} y2={warnY}
              stroke="#f59e0b" strokeOpacity="0.35" strokeDasharray="4 4" strokeWidth="1" />
        <text x={padding.left + 4} y={safeY - 2} fontSize="10" fill="#10b981">safe ≥70</text>
        <text x={padding.left + 4} y={warnY - 2} fontSize="10" fill="#f59e0b">warn ≥40</text>

        {/* Y axis ticks at 0, 50, 100 */}
        {[0, 50, 100].forEach((s) => (
          <g key={s}>
            <line x1={padding.left} y1={yFor(s)} x2={padding.left + innerW} y2={yFor(s)}
                  stroke="#9ca3af" strokeOpacity="0.15" strokeWidth="1" />
            <text x={padding.left - 6} y={yFor(s) + 3} fontSize="10" fill="currentColor" textAnchor="end" opacity="0.6">{s}</text>
          </g>
        ))}

        {/* Bars */}
        {data.map((p, i) => {
          const x = padding.left + i * (barW + barGap)
          const top = p.hasData ? yFor(p.avgScore) : yFor(0)
          const h = p.hasData ? padding.top + innerH - top : 0
          const zone = p.worstZone || 'safe'
          const isEmpty = !p.hasData
          const fill = isEmpty ? 'fill-gray-300 dark:fill-gray-700' : (ZONE_FILL[zone] || 'fill-gray-400')
          const stroke = isEmpty ? '' : (ZONE_STROKE[zone] || '')
          const isHover = hoverIdx === i
          return (
            <g key={p.date}
               onMouseEnter={() => setHoverIdx(i)}
               onMouseLeave={() => setHoverIdx(null)}
               onClick={() => onSelectDay && onSelectDay(p.date)}
               className={onSelectDay ? 'cursor-pointer' : ''}>
              {isEmpty ? (
                <rect x={x} y={padding.top + innerH - 2} width={barW} height={2}
                      fill="currentColor" opacity="0.2" />
              ) : (
                <rect x={x} y={top} width={barW} height={Math.max(1, h)}
                      className={fill + ' ' + stroke}
                      strokeWidth={isHover ? 1.5 : 0.5}
                      opacity={isHover ? 1 : 0.85}
                      rx="1" />
              )}
              {tickIdx.includes(i) && (
                <text x={x + barW / 2} y={padding.top + innerH + 14}
                      fontSize="10" fill="currentColor" textAnchor="middle" opacity="0.7">
                  {shortDate(p.date)}
                </text>
              )}
            </g>
          )
        })}

        {/* Hover tooltip */}
        {hoverIdx != null && data[hoverIdx]?.hasData && (
          <g>
            <rect x={padding.left + 4} y={padding.top - 4} width={220} height={56}
                  fill="rgba(17,24,39,0.92)" rx="6" />
            <text x={padding.left + 14} y={padding.top + 12} fontSize="11" fill="#fff" fontWeight="bold">
              {data[hoverIdx].date}
            </text>
            <text x={padding.left + 14} y={padding.top + 28} fontSize="11" fill="#fff">
              avg {data[hoverIdx].avgScore}  ·  ending {data[hoverIdx].endingScore ?? '–'}
            </text>
            <text x={padding.left + 14} y={padding.top + 44} fontSize="11" fill="#fff">
              {data[hoverIdx].answered} answered · {data[hoverIdx].skipped} skipped · worst {data[hoverIdx].worstZone}
            </text>
          </g>
        )}
      </svg>

      {/* Empty-day legend */}
      {data.some((d) => !d.hasData) && (
        <p className="text-xs text-gray-500 mt-2">
          Empty days show no engagement activity (no questions answered or skipped that day).
        </p>
      )}
    </div>
  )
}

function shortDate(iso) {
  // YYYY-MM-DD → M/D (drop leading zeros for compactness)
  const [y, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}