import React from 'react'

/**
 * PerformanceChart — an SVG bar chart for session history / student performance
 */
export default function PerformanceChart({ data = [], height = 200 }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        No performance data yet.
      </div>
    )
  }

  // Find max value for scaling
  const maxValue = Math.max(...data.map(d => d.value), 10) // min scale of 10
  
  return (
    <div style={{ height, display: 'flex', alignItems: 'flex-end', gap: '12px', paddingTop: '20px' }}>
      {data.map((item, idx) => {
        const hPct = (item.value / maxValue) * 100
        
        return (
          <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            {/* Bar wrapper for absolute positioning of tooltip/label */}
            <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              
              {/* Value label */}
              <div style={{ 
                position: 'absolute', bottom: `calc(${hPct}% + 4px)`, 
                fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)'
              }}>
                {item.value}
              </div>

              {/* Bar */}
              <div
                className="progress-fill"
                style={{
                  width: '100%',
                  maxWidth: '32px',
                  height: `${hPct}%`,
                  minHeight: '4px',
                  background: item.color || 'var(--accent-gradient)',
                  borderRadius: '6px 6px 0 0',
                  boxShadow: '0 4px 12px rgba(124,58,237,.2)',
                  transition: 'height 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)'
                }}
              />
            </div>
            
            {/* X-axis label */}
            <div style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              {item.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}
