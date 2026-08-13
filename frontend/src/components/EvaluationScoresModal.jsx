// Per-student evaluation scores table. Shared by "Preview" and "Apply" — both call the
// same backend endpoint shape, so a single component renders both.
//
// Props:
//   open           — modal visibility
//   onClose        — close handler
//   title          — heading (e.g. "Preview — Final exam weighted")
//   subtitle       — small line under the title
//   loading        — when true, shows a spinner instead of table
//   error          — error message if the request failed
//   result         — the API result: { scores: [{studentId, studentName, score, breakdown, responded}], criterionKeys, totalQuestions, totalJoined }
//   criteriaMeta   — full criteria metadata [{key,label,group,...}] for labels in the breakdown column

import React, { useState, useEffect } from 'react'

function labelFor(key, meta, roomIdsCount, activeRoomId) {
  if (key === 'session_participation' && activeRoomId === 'aggregated' && roomIdsCount > 1) {
    return `Attendance (${roomIdsCount} Rooms)`
  }
  return (meta || []).find((c) => c.key === key)?.label || key
}

export default function EvaluationScoresModal({ open, onClose, title, subtitle, loading, error, result, criteriaMeta, profile }) {
  const [activeRoomId, setActiveRoomId] = useState('')

  useEffect(() => {
    if (result?.isMulti && result?.results) {
      if (result.results.aggregated) {
        setActiveRoomId('aggregated')
      } else {
        const keys = Object.keys(result.results)
        if (keys.length > 0) {
          setActiveRoomId(keys[0])
        }
      }
    } else {
      setActiveRoomId('')
    }
  }, [result])

  if (!open) return null
  
  const activeResult = result?.isMulti && result?.results && activeRoomId
    ? result.results[activeRoomId]
    : result;

  const scores = activeResult?.scores || []
  const keys = activeResult?.criterionKeys || []

  // CSV Export helper functions
  const escapeCSV = (val) => {
    if (val === null || val === undefined) return ''
    let str = String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      str = '"' + str.replace(/"/g, '""') + '"'
    }
    return str
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    try {
      return new Date(dateStr).toLocaleString()
    } catch (e) {
      return dateStr
    }
  }

  const handleDownloadCSV = () => {
    if (!result) return

    let csvContent = []
    
    // 1. Evaluation Profile Information
    csvContent.push(`Evaluation Profile,${escapeCSV(profile?.name || title || 'Evaluation Profile')}`)
    csvContent.push(`Export Generated,${escapeCSV(new Date().toLocaleString())}`)
    csvContent.push('')

    // 2. Profile Parameters & Weightages
    csvContent.push('Profile Parameters & Weightages')
    csvContent.push('Parameter,Weightage,Penalty')
    if (profile?.criteria) {
      for (const c of profile.criteria) {
        const label = labelFor(c.key, criteriaMeta)
        const weight = `${(c.weight * 100).toFixed(1)}%`
        const penalty = c.key === 'incorrect_responses' && c.penalty > 0 ? `-${(c.penalty * 100).toFixed(0)}%` : '—'
        csvContent.push(`${escapeCSV(label)},${escapeCSV(weight)},${escapeCSV(penalty)}`)
      }
    }
    csvContent.push('')

    // 3. Room Information
    csvContent.push('Room Information')
    csvContent.push('Room Name,Room Code,Created At / Session Start,Session End')
    
    if (result.isMulti && result.results) {
      // Write info for all rooms except 'aggregated'
      Object.entries(result.results).forEach(([rid, rdata]) => {
        if (rid !== 'aggregated') {
          csvContent.push(`${escapeCSV(rdata.roomName)},${escapeCSV(rdata.roomCode)},${escapeCSV(formatDate(rdata.createdAt))},${escapeCSV(formatDate(rdata.endedAt))}`)
        }
      })
    } else {
      csvContent.push(`${escapeCSV(result.roomName)},${escapeCSV(result.roomCode)},${escapeCSV(formatDate(result.createdAt))},${escapeCSV(formatDate(result.endedAt))}`)
    }
    csvContent.push('')

    // Helper to generate score table rows for a given result payload
    const appendScoreTable = (sectionTitle, rdata, isAggregated = false) => {
      csvContent.push(sectionTitle)
      const headerRow = ['#', 'Student Name', 'Student ID']
      if (isAggregated) {
        const totalRooms = rdata.roomIdsCount || 0
        headerRow.push(`Present / Total Rooms (${totalRooms})`)
        headerRow.push('Avg Score')
      } else {
        headerRow.push('Overall Score')
      }
      
      const cKeys = rdata.criterionKeys || []
      cKeys.forEach((k) => {
        const totalRooms = rdata.roomIdsCount || 0
        headerRow.push(labelFor(k, criteriaMeta, totalRooms, isAggregated ? 'aggregated' : ''))
      })
      csvContent.push(headerRow.map(escapeCSV).join(','))

      const sc = rdata.scores || []
      sc.forEach((s, idx) => {
        const row = [idx + 1, s.studentName, s.studentId]
        if (isAggregated) {
          const totalRooms = rdata.roomIdsCount || 0
          row.push(`${s.presentCount || 0}/${totalRooms}`)
        }
        row.push(`${(s.score * 100).toFixed(1)}%`)
        cKeys.forEach((k) => {
          row.push(s.breakdown?.[k] != null ? `${(s.breakdown[k] * 100).toFixed(1)}%` : '—')
        })
        csvContent.push(row.map(escapeCSV).join(','))
      })
      csvContent.push('')
    }

    // 4. Student Results
    if (result.isMulti && result.results) {
      // Append aggregated results first
      if (result.results.aggregated) {
        appendScoreTable('Aggregated Student Results', result.results.aggregated, true)
      }
      // Append each individual room
      Object.entries(result.results).forEach(([rid, rdata]) => {
        if (rid !== 'aggregated') {
          appendScoreTable(`Individual Room Results - ${rdata.roomName} (${rdata.roomCode})`, rdata, false)
        }
      })
    } else {
      appendScoreTable('Student Results', result, false)
    }

    // Create Blob and download
    const blob = new Blob([csvContent.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    
    const filename = `${profile?.name || 'evaluation'}_export.csv`.replace(/\s+/g, '_').toLowerCase()
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 9999
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: '16px', padding: '24px',
          width: '95%', maxWidth: '900px', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: '700', color: '#1f2937' }}>{title || 'Evaluation Scores'}</h3>
            {subtitle && <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>{subtitle}</p>}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {result && !loading && !error && (
              <button
                onClick={handleDownloadCSV}
                style={{
                  padding: '6px 12px', background: '#059669', color: 'white',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                  fontWeight: '600'
                }}
              >
                Download CSV
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                padding: '6px 12px', background: 'transparent', color: '#6b7280',
                border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '13px'
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Tab selection bar for multi-room results */}
        {result?.isMulti && result?.results && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '6px', borderBottom: '1px solid #e5e7eb' }}>
            {Object.entries(result.results).map(([rid, rdata]) => {
              const isActive = rid === activeRoomId
              return (
                <button
                  key={rid}
                  onClick={() => setActiveRoomId(rid)}
                  style={{
                    padding: '6px 14px',
                    background: isActive ? '#7c3aed' : '#f3f4f6',
                    color: isActive ? 'white' : '#374151',
                    border: isActive ? '1px solid #7c3aed' : '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {rdata.roomName} {rdata.roomCode !== 'MULTI' ? `(${rdata.roomCode})` : ''}
                </button>
              )
            })}
          </div>
        )}

        {activeResult && (
          <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#6b7280' }}>
            Scored {activeResult.totalScored} joined student{activeResult.totalScored === 1 ? '' : 's'} using{' '}
            {keys.length} criterion{keys.length === 1 ? '' : 'a'} · {activeResult.totalQuestions} approved question{activeResult.totalQuestions === 1 ? '' : 's'}.
          </p>
        )}

        {loading && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Calculating…</div>
        )}

        {error && !loading && (
          <div style={{ padding: '12px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {!loading && !error && scores.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>No students have joined this room yet.</div>
        )}

        {!loading && !error && scores.length > 0 && (
          <div style={{ overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#374151' }}>#</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#374151' }}>Student</th>
                  {activeRoomId === 'aggregated' && activeResult?.roomIdsCount > 1 && (
                    <th style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', color: '#374151' }}>
                      Present / Total Rooms ({activeResult.roomIdsCount})
                    </th>
                  )}
                  <th style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', color: '#374151' }}>{activeRoomId === 'aggregated' ? 'Avg Score' : 'Overall'}</th>
                  {keys.map((k) => (
                    <th key={k} style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', color: '#374151' }} title={labelFor(k, criteriaMeta, activeResult?.roomIdsCount, activeRoomId)}>
                      {labelFor(k, criteriaMeta, activeResult?.roomIdsCount, activeRoomId)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scores.map((s, i) => {
                  const pct = (s.score * 100).toFixed(1)
                  const color = s.score >= 0.7 ? '#059669' : s.score >= 0.4 ? '#d97706' : '#dc2626'
                  return (
                    <tr key={s.studentId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 12px', color: '#6b7280' }}>{i + 1}</td>
                      <td style={{ padding: '8px 12px', color: '#1f2937' }}>
                        {s.studentName}
                        {!s.responded && (
                          <span style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' }}>(no responses)</span>
                        )}
                      </td>
                      {activeRoomId === 'aggregated' && activeResult?.roomIdsCount > 1 && (
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                          {s.presentCount || 0}/{activeResult.roomIdsCount}
                        </td>
                      )}
                      <td style={{ padding: '8px 12px', textAlign: 'right', color, fontWeight: '700' }}>{pct}%</td>
                      {keys.map((k) => (
                        <td key={k} style={{ padding: '8px 12px', textAlign: 'right', color: '#374151' }}>
                          {(s.breakdown?.[k] != null) ? `${(s.breakdown[k] * 100).toFixed(1)}%` : '—'}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}