// Modal form to create / edit an EvaluationProfile. Criteria list is pulled from the
// registry (services/evaluationCriteria.js → GET /criteria), so this component is a
// pure renderer over that data — it never hardcodes criterion names.
//
// Weights are entered as percentages and stored as fractions (0..1). The "Save" button
// stays disabled until the user picks ≥1 criterion AND the weights sum to exactly 100%
// (with a 0.1% tolerance — mirrors the server's tolerance).
//
// No external scripting / expression builders — just a checkbox + numeric weight per
// criterion, and a single shared weighted linear combination is enforced server-side.

import React, { useEffect, useMemo, useState } from 'react'
import { fetchCriteria } from '../services/evaluationProfileService'

const TOLERANCE = 0.001 // mirror server-side

export default function EvaluationProfileFormModal({ open, onClose, onSubmit, initialProfile, busy }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [criteriaMeta, setCriteriaMeta] = useState([])
  const [criteria, setCriteria] = useState([]) // [{ key, weight }]
  const [loadError, setLoadError] = useState('')

  // Load criteria registry on first open
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetchCriteria()
      .then((data) => { if (!cancelled) setCriteriaMeta(data.criteria || []) })
      .catch((e) => { if (!cancelled) setLoadError(e.message) })
    return () => { cancelled = true }
  }, [open])

  // Initialize / reset form when opening
  useEffect(() => {
    if (!open) return
    if (initialProfile) {
      setName(initialProfile.name || '')
      setDescription(initialProfile.description || '')
      setCriteria((initialProfile.criteria || []).map((c) => ({ key: c.key, weight: Number(c.weight) || 0 })))
    } else {
      setName('')
      setDescription('')
      setCriteria([])
    }
  }, [open, initialProfile])

  const totalWeight = useMemo(() => criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0), [criteria])
  const valid = name.trim().length > 0
    && criteria.length > 0
    && Math.abs(totalWeight - 1) <= TOLERANCE

  const toggleCriterion = (key) => {
    setCriteria((cur) => {
      if (cur.some((c) => c.key === key)) return cur.filter((c) => c.key !== key)
      // Default equal split across currently selected + the new one — auto-balance.
      const next = [...cur, { key, weight: 0 }]
      const share = Math.floor((100 / (next.length)) * 10) / 1000 // round to 1 decimal %
      const filled = next.map((c) => ({ key: c.key, weight: share }))
      // Adjust last entry to make sum exactly 1 (avoid 0.001 drift).
      const sum = filled.reduce((s, c) => s + c.weight, 0)
      filled[filled.length - 1] = { ...filled[filled.length - 1], weight: Number((1 - (sum - filled[filled.length - 1].weight)).toFixed(4)) }
      return filled
    })
  }

  const setWeight = (key, pct) => {
    const frac = Math.max(0, Math.min(1, Number(pct) / 100))
    setCriteria((cur) => cur.map((c) => c.key === key ? { ...c, weight: Number(frac.toFixed(4)) } : c))
  }

  const distributeEvenly = () => {
    if (criteria.length === 0) return
    const each = Number((1 / criteria.length).toFixed(4))
    const sum = each * criteria.length
    setCriteria((cur) => cur.map((c, i) => ({
      ...c,
      weight: i === cur.length - 1 ? Number((1 - sum + each).toFixed(4)) : each
    })))
  }

  const submit = () => {
    if (!valid) return
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      criteria
    })
  }

  if (!open) return null

  // Group criteria by their declared group for the UI
  const grouped = criteriaMeta.reduce((acc, c) => {
    (acc[c.group] = acc[c.group] || []).push(c); return acc
  }, {})

  const remaining = 1 - totalWeight
  const totalPct = (totalWeight * 100).toFixed(1)

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
          background: 'white', borderRadius: '16px', padding: '32px',
          width: '90%', maxWidth: '640px', maxHeight: '90vh',
          overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: '20px', fontWeight: '700', color: '#1f2937' }}>
          {initialProfile ? 'Edit Evaluation Profile' : 'Create Evaluation Profile'}
        </h3>

        {loadError && (
          <div style={{ padding: '10px', background: '#fef2f2', color: '#dc2626', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>
            {loadError}
          </div>
        )}

        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
          Profile name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="e.g. Final exam weighted — accuracy focused"
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', marginBottom: '16px', color: '#1f2937' }}
        />

        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
          Description (optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="What this profile is for…"
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', marginBottom: '16px', resize: 'vertical', fontFamily: 'inherit', color: '#1f2937' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
            Criteria &amp; weightages
          </label>
          <button
            type="button"
            onClick={distributeEvenly}
            disabled={criteria.length === 0}
            style={{
              padding: '6px 12px', background: 'transparent', color: '#7c3aed',
              border: '1px solid #7c3aed', borderRadius: '6px', fontSize: '12px',
              fontWeight: '600', cursor: criteria.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            Distribute evenly
          </button>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', background: '#f9fafb' }}>
          {Object.entries(grouped).map(([group, list]) => (
            <div key={group} style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {group}
              </div>
              {list.map((c) => {
                const sel = criteria.find((x) => x.key === c.key)
                const isOn = !!sel
                const pct = sel ? (sel.weight * 100) : 0
                return (
                  <div key={c.key} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '6px 0', borderBottom: '1px solid #eef0f3'
                  }}>
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => toggleCriterion(c.key)}
                      style={{ cursor: 'pointer' }}
                      aria-label={`Include ${c.label}`}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', color: '#1f2937', fontWeight: isOn ? '600' : '400' }}>
                        {c.label}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>{c.description}</div>
                    </div>
                    {isOn && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={pct}
                          onChange={(e) => setWeight(c.key, e.target.value)}
                          style={{
                            width: '70px', padding: '6px 8px', borderRadius: '6px',
                            border: '1px solid #d1d5db', fontSize: '13px',
                            textAlign: 'right', background: 'white', color: '#1f2937'
                          }}
                          aria-label={`Weight percent for ${c.label}`}
                        />
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>%</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 12px', borderRadius: '8px',
          background: valid ? '#d1fae5' : '#fef3c7',
          color: valid ? '#065f46' : '#92400e',
          fontSize: '13px', fontWeight: '600', marginBottom: '16px'
        }}>
          <span>Total weight: {totalPct}%</span>
          <span>{valid ? '✓ valid — ready to save' : remaining > 0 ? `add ${(remaining * 100).toFixed(1)}% to reach 100%` : `remove ${(-remaining * 100).toFixed(1)}% to reach 100%`}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '10px 20px', background: '#e5e7eb', color: '#374151',
              border: 'none', borderRadius: '8px', fontSize: '14px',
              fontWeight: '600', cursor: busy ? 'not-allowed' : 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || busy}
            style={{
              padding: '10px 20px',
              background: (!valid || busy) ? '#9ca3af' : '#7c3aed',
              color: 'white', border: 'none', borderRadius: '8px',
              fontSize: '14px', fontWeight: '600',
              cursor: (!valid || busy) ? 'not-allowed' : 'pointer'
            }}
          >
            {busy ? 'Saving…' : (initialProfile ? 'Save changes' : 'Create profile')}
          </button>
        </div>
      </div>
    </div>
  )
}