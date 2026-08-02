import React, { useState, useEffect, useCallback } from 'react'

const bandColor = (index) => {
  if (index === null || index === undefined) return '#9ca3af'
  if (index >= 70) return '#22c55e'
  if (index >= 40) return '#f59e0b'
  return '#ef4444'
}

function EngagementPanel({ socket }) {
  const [students, setStudents] = useState({}) // studentId -> { name, index, disengaged }
  const [alerts, setAlerts] = useState([])

  const handleUpdate = useCallback((data) => {
    setStudents(prev => ({
      ...prev,
      [data.studentId]: {
        name: data.studentName || prev[data.studentId]?.name || 'Student',
        index: data.index,
        disengaged: data.disengaged
      }
    }))
  }, [])

  const handleAlert = useCallback((data) => {
    setAlerts(prev => [...prev.slice(-4), {
      id: `${data.studentId}-${Date.now()}`,
      name: data.studentName || 'A student',
      index: data.index
    }])
  }, [])

  useEffect(() => {
    if (!socket) return
    socket.on('engagement:update', handleUpdate)
    socket.on('engagement:alert', handleAlert)
    return () => {
      socket.off('engagement:update', handleUpdate)
      socket.off('engagement:alert', handleAlert)
    }
  }, [socket, handleUpdate, handleAlert])

  const list = Object.entries(students).sort((a, b) => (a[1].index ?? 101) - (b[1].index ?? 101))
  const classAvg = list.length
    ? Math.round(list.reduce((s, [, v]) => s + (v.index || 0), 0) / list.length)
    : null

  return (
    <section aria-label="Live engagement" style={{
      background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 16, marginTop: 16
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Live Engagement</h3>
        {classAvg !== null && (
          <span style={{ fontSize: 14, color: bandColor(classAvg), fontWeight: 700 }}>
            Class avg: {classAvg}
          </span>
        )}
      </div>

      {alerts.map(a => (
        <div key={a.id} role="alert" style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 13
        }}>
          {a.name} may be drifting (index {a.index})
        </div>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
        {list.length === 0 && (
          <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>
            Engagement data appears as students answer.
          </p>
        )}
        {list.map(([id, s]) => (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.name}
            </span>
            <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
              <div style={{
                width: `${s.index ?? 0}%`, height: '100%', borderRadius: 4,
                background: bandColor(s.index), transition: 'width 300ms ease'
              }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: bandColor(s.index), minWidth: 28, textAlign: 'right' }}>
              {s.index ?? '—'}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default EngagementPanel