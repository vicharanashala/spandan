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

import React from 'react'

function labelFor(key, meta) {
  return (meta || []).find((c) => c.key === key)?.label || key
}

export default function EvaluationScoresModal({ open, onClose, title, subtitle, loading, error, result, criteriaMeta }) {
  if (!open) return null
  const scores = result?.scores || []
  const keys = result?.criterionKeys || []

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

        {result && (
          <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#6b7280' }}>
            Scored {result.totalScored} joined student{result.totalScored === 1 ? '' : 's'} using{' '}
            {keys.length} criterion{keys.length === 1 ? '' : 'a'} · {result.totalQuestions} approved question{result.totalQuestions === 1 ? '' : 's'}.
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
                  <th style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', color: '#374151' }}>Overall</th>
                  {keys.map((k) => (
                    <th key={k} style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', color: '#374151' }} title={labelFor(k, criteriaMeta)}>
                      {labelFor(k, criteriaMeta)}
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