import { useEffect, useState } from 'react'
import { API_URL } from '../config.js'

const cellStyle = (cell) => ({
  width: 36, height: 32, borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 14,
  background: !cell ? '#e5e7eb' : cell.isCorrect ? '#bbf7d0' : '#fecaca',
  color: !cell ? '#64748b' : cell.isCorrect ? '#166534' : '#991b1b'
})

export default function ParticipationHeatmap({ roomId, token, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch(`${API_URL}/responses/room/${roomId}/participation`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Could not load participation data')))
      .then(setData).catch(e => setError(e.message))
  }, [roomId, token])
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 3000, display: 'grid', placeItems: 'center' }}>
    <div style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', width: 'min(90vw, 1000px)', maxHeight: '82vh', overflow: 'auto', padding: 24, borderRadius: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><h2 style={{ margin: 0 }}>Participation heatmap</h2><small>✓ correct · × incorrect · — not answered</small></div><button onClick={onClose}>Close</button></div>
      {error && <p>{error}</p>}
      {!data && !error && <p>Loading analytics…</p>}
      {data && <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${data.questions.length}, 40px)`, gap: 6, alignItems: 'center', marginTop: 20 }}>
        <strong>Student</strong>{data.questions.map((q, i) => <strong key={q._id} title={q.question} style={{ textAlign: 'center' }}>Q{i + 1}</strong>)}
        {data.students.flatMap(student => [<span key={`${student._id}-name`} title={student.email}>{student.name}</span>, ...data.questions.map(q => {
          const cell = data.cells[`${student._id}_${q._id}`]
          return <div key={`${student._id}-${q._id}`} title={cell?.confidence ? `Confidence: ${cell.confidence}` : 'No response'} style={cellStyle(cell)}>{!cell ? '—' : cell.isCorrect ? '✓' : '×'}</div>
        })])}
      </div>}
    </div>
  </div>
}
