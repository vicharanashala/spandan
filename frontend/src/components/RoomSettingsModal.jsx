import React, { useState, useEffect } from 'react'
import { getAIProviders } from '../services/questionService'
import { Settings, X } from 'lucide-react'
import { Ico } from './icons'

const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard']
// Segment Time is a free whole-minute input, 1–15 min (was a fixed 1/2/3/5/10/15/20/30 button list).
const SEGMENT_MIN = 1
const SEGMENT_MAX = 15
const SEGMENT_DEFAULT = 2
const clampSegmentTime = (v) => {
  const n = parseInt(v, 10)
  if (Number.isNaN(n)) return SEGMENT_DEFAULT // empty / non-numeric → default (0 must clamp to 1, not fall back)
  return Math.min(SEGMENT_MAX, Math.max(SEGMENT_MIN, n))
}

// Waiting room / attendance input bounds — must match backend/src/middleware/validation.js.
const GRACE_MIN = 0, GRACE_MAX = 120, GRACE_DEFAULT = 5
const LATE_WINDOW_MIN = 0, LATE_WINDOW_MAX = 240, LATE_WINDOW_DEFAULT = 15
const LATE_PENALTY_MIN = 0, LATE_PENALTY_MAX = 1000, LATE_PENALTY_DEFAULT = 0
const clampIntInRange = (v, min, max, fallback) => {
  const n = parseInt(v, 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
// Grace / late window support both minutes and seconds. Minutes remain the canonical stored unit
// (fractional when seconds are chosen, e.g. 30s = 0.5), so the backend only needs one field.
const toUnitValue = (minutes, unit) => {
  const m = Number(minutes)
  if (!Number.isFinite(m)) return 0
  return unit === 'sec' ? Math.round(m * 60) : Number(m.toFixed(4))
}
const fromUnitValue = (raw, unit, maxMinutes, fallback) => {
  if (raw === '' || raw === null || raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  const minutes = unit === 'sec' ? n / 60 : n
  return Math.min(maxMinutes, Math.max(0, Math.round(minutes * 1e6) / 1e6))
}
const unitForValue = (minutes) => {
  const m = Number(minutes)
  // Reopen in seconds mode when the stored value isn't a whole number of minutes.
  return Number.isFinite(m) && m > 0 && Math.abs((m * 60) % 60) > 0.000001 ? 'sec' : 'min'
}

// Number input that keeps the raw text while the field is focused, so it can be fully cleared or hold
// a partial value like "0." without snapping back. Valid numbers are pushed through onCommit as you
// type; on blur the text is committed once more (empty → onCommit's fallback) and the field resyncs.
function DraftNumberInput({ value, onCommit, ...props }) {
  const [draft, setDraft] = useState(null) // null = not editing, show the committed value
  return (
    <input
      {...props}
      type="number"
      value={draft ?? value}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        if (raw !== '' && Number.isFinite(Number(raw))) onCommit(raw)
      }}
      onBlur={() => {
        if (draft !== null) onCommit(draft)
        setDraft(null)
      }}
    />
  )
}

function UnitToggle({ value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
      {['min', 'sec'].map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => onChange(u)}
          style={{
            padding: '3px 8px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer',
            background: value === u ? 'var(--accent)' : 'transparent',
            color: value === u ? '#fff' : 'var(--text-secondary)'
          }}
        >
          {u === 'min' ? 'Min' : 'Sec'}
        </button>
      ))}
    </div>
  )
}
// <input type="datetime-local"> wants 'YYYY-MM-DDTHH:mm' in LOCAL time; the API stores ISO/UTC.
const isoToLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const localInputToIso = (v) => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function RoomSettingsModal({ isOpen, onClose, settings, onSave }) {
  const [localSettings, setLocalSettings] = useState(settings)
  const [providers, setProviders] = useState([])
  const [loadingProviders, setLoadingProviders] = useState(false)
  const [graceUnit, setGraceUnit] = useState('min')
  const [lateWindowUnit, setLateWindowUnit] = useState('min')

  useEffect(() => {
    if (isOpen) {
      // Clamp on open so a room saved under the old list (e.g. 20 or 30 min) shows an in-range value.
      setLocalSettings({ ...settings, segmentTime: clampSegmentTime(settings?.segmentTime) })
      setGraceUnit(unitForValue(settings?.graceMinutes ?? GRACE_DEFAULT))
      setLateWindowUnit(unitForValue(settings?.lateWindowMinutes ?? LATE_WINDOW_DEFAULT))
      loadProviders()
    }
  }, [isOpen, settings])

  const loadProviders = async () => {
    setLoadingProviders(true)
    try {
      const data = await getAIProviders()
      if (data.success) {
        setProviders(data.providers)
      }
    } catch (error) {
      console.error('Failed to load AI providers:', error)
    }
    setLoadingProviders(false)
  }

  const handleSave = () => {
    onSave(localSettings)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          padding: '24px',
          width: '480px',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          border: '1px solid var(--border-color)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
            <Ico as={Settings} style={{ color: 'var(--accent)' }} /> Room Settings
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'inline-flex'
            }}
            aria-label="Close settings"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Segment Time */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'var(--text-primary)'
          }}>
            Segment Time (t)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="number"
              min={SEGMENT_MIN}
              max={SEGMENT_MAX}
              step="1"
              value={localSettings.segmentTime || SEGMENT_DEFAULT}
              onChange={(e) => setLocalSettings(prev => ({
                ...prev,
                segmentTime: clampSegmentTime(e.target.value)
              }))}
              style={{
                width: '100px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '18px',
                fontWeight: '600',
                textAlign: 'center'
              }}
            />
            <span style={{
              fontSize: '16px',
              color: 'var(--text-secondary)'
            }}>
              minutes ({SEGMENT_MIN}-{SEGMENT_MAX})
            </span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Whole minutes only. After this time, a new segment starts and questions are auto-generated
          </p>
        </div>

        {/* Questions per Segment */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'var(--text-primary)'
          }}>
            Questions / Segment
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setLocalSettings(prev => ({ 
                ...prev, 
                questionsPerSegment: Math.max(1, (prev.questionsPerSegment || 2) - 1)
              }))}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '18px',
                fontWeight: '600'
              }}
            >
              −
            </button>
            <span style={{
              fontSize: '24px',
              fontWeight: '600',
              color: 'var(--text-primary)',
              minWidth: '40px',
              textAlign: 'center'
            }}>
              {localSettings.questionsPerSegment || 2}
            </span>
            <button
              onClick={() => setLocalSettings(prev => ({ 
                ...prev, 
                questionsPerSegment: Math.min(10, (prev.questionsPerSegment || 2) + 1)
              }))}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '18px',
                fontWeight: '600'
              }}
            >
              +
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Number of questions to generate per segment
          </p>
        </div>

        {/* Difficulty Level */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'var(--text-primary)'
          }}>
            Difficulty Level
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {DIFFICULTY_LEVELS.map(level => (
              <button
                key={level}
                onClick={() => setLocalSettings(prev => ({ ...prev, difficulty: level }))}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: localSettings.difficulty === level 
                    ? '2px solid var(--accent)' 
                    : '1px solid var(--border-color)',
                  background: localSettings.difficulty === level ? '#dbeafe' : 'transparent',
                  color: localSettings.difficulty === level ? 'var(--accent)' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: localSettings.difficulty === level ? '600' : '400',
                  textTransform: 'capitalize'
                }}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Question Generator Model */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'var(--text-primary)'
          }}>
            Question Generator
          </label>
          <select
            value={localSettings.questionProvider || 'minimax'}
            onChange={(e) => setLocalSettings(prev => ({ ...prev, questionProvider: e.target.value }))}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            {loadingProviders ? (
              <option value="">Loading providers...</option>
            ) : (
              providers.map(p => (
                <option key={p.id} value={p.id} disabled={!p.enabled}>
                  {p.icon} {p.name} {!p.enabled && '(No API Key)'}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Question Type Distribution */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'var(--text-primary)'
          }}>
            Question Type Distribution
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            {['MCQ', 'TF', 'MSQ'].map(type => (
              <div key={type} style={{ flex: 1 }}>
                <p style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {type}
                </p>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={localSettings.questionTypeMix?.[type] ??
                    (type === 'MCQ' ? 0 : type === 'TF' ? 100 : 0)}
                  onChange={(e) => setLocalSettings(prev => ({
                    ...prev,
                    questionTypeMix: {
                      ...(prev.questionTypeMix || { MCQ: 0, TF: 100, MSQ: 0 }),
                      [type]: parseInt(e.target.value) || 0
                    }
                  }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '14px'
                  }}
                />
              </div>
            ))}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Percentages for question types when generating 4+ questions
          </p>
        </div>

        {/* Time to Answer (TTA) */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'var(--text-primary)'
          }}>
            Time to Answer (TTA)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="number"
              min="0"
              max="300"
              value={localSettings.timeToAnswer || 30}
              onChange={(e) => setLocalSettings(prev => ({ 
                ...prev, 
                timeToAnswer: Math.min(300, Math.max(0, parseInt(e.target.value) || 30))
              }))}
              style={{
                width: '100px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '18px',
                fontWeight: '600',
                textAlign: 'center'
              }}
            />
            <span style={{
              fontSize: '16px',
              color: 'var(--text-secondary)'
            }}>
              seconds (0-300)
            </span>
          </div>
        </div>

        {/* Points */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'var(--text-primary)'
          }}>
            Points per Question
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="number"
              min="1"
              max="500"
              value={localSettings.points || 10}
              onChange={(e) => setLocalSettings(prev => ({ 
                ...prev, 
                points: Math.min(500, Math.max(1, parseInt(e.target.value) || 10))
              }))}
              style={{
                width: '100px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '18px',
                fontWeight: '600',
                textAlign: 'center'
              }}
            />
            <span style={{
              fontSize: '16px',
              color: 'var(--text-secondary)'
            }}>
              points (1-500)
            </span>
          </div>
        </div>

        {/* Anonymous Leaderboard */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'var(--text-primary)'
          }}>
            Anonymous Leaderboard
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[{ label: 'Off', value: false }, { label: 'On', value: true }].map(opt => {
              const active = !!localSettings.anonymousLeaderboard === opt.value
              return (
                <button
                  key={opt.label}
                  onClick={() => setLocalSettings(prev => ({
                    ...prev,
                    anonymousLeaderboard: opt.value,
                    // Seed a sensible default the first time it's switched on.
                    anonymityPercent: opt.value ? (prev.anonymityPercent ?? 20) : prev.anonymityPercent
                  }))}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: active ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                    background: active ? '#dbeafe' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: active ? '600' : '400'
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>

          {localSettings.anonymousLeaderboard && (
            <div style={{ marginTop: '12px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '13px',
                fontWeight: '500',
                color: 'var(--text-primary)'
              }}>
                Anonymity Percentage
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={localSettings.anonymityPercent ?? 20}
                  onChange={(e) => setLocalSettings(prev => ({
                    ...prev,
                    anonymityPercent: Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                  }))}
                  style={{
                    width: '100px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '18px',
                    fontWeight: '600',
                    textAlign: 'center'
                  }}
                />
                <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
                  % (0-100)
                </span>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                You see real names for the bottom {localSettings.anonymityPercent ?? 20}% (lowest scorers);
                everyone else is anonymised. Students always see an anonymised board.
              </p>

              {/* Reveal bottom names to students — only meaningful while anonymous mode is on. */}
              <div style={{ marginTop: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: 'var(--text-primary)'
                }}>
                  Show bottom names to students
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[{ label: 'Off', value: false }, { label: 'On', value: true }].map(opt => {
                    const active = !!localSettings.revealBottomToStudents === opt.value
                    return (
                      <button
                        key={opt.label}
                        onClick={() => setLocalSettings(prev => ({ ...prev, revealBottomToStudents: opt.value }))}
                        style={{
                          flex: 1,
                          padding: '10px 16px',
                          borderRadius: '8px',
                          border: active ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                          background: active ? '#dbeafe' : 'transparent',
                          color: active ? 'var(--accent)' : 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: active ? '600' : '400'
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  When On, students also see the real names of the bottom {localSettings.anonymityPercent ?? 20}%
                  (lowest scorers); the rest of the board stays anonymised for them.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Waiting Room & Attendance */}
        <div style={{ marginBottom: '24px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 650, color: 'var(--text-primary)' }}>
            Waiting Room &amp; Attendance
          </h3>
          <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Record late arrivals in the attendance ledger. On-time and late students join straight
            away; in Manual mode only very-late arrivals wait for your approval.
          </p>

          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' }}>
            Enable Waiting Room
          </label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {[{ label: 'Off', value: false }, { label: 'On', value: true }].map(opt => {
              const active = !!localSettings.waitingRoomEnabled === opt.value
              return (
                <button
                  key={opt.label}
                  onClick={() => setLocalSettings(prev => ({ ...prev, waitingRoomEnabled: opt.value }))}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: '8px',
                    border: active ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                    background: active ? '#dbeafe' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text-primary)',
                    cursor: 'pointer', fontSize: '14px', fontWeight: active ? '600' : '400'
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>

          {localSettings.waitingRoomEnabled && (
            <>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                Admission Policy
              </label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {[{ label: 'Automatic', value: 'automatic' }, { label: 'Manual', value: 'manual' }].map(opt => {
                  const active = (localSettings.waitingRoomPolicy || 'automatic') === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setLocalSettings(prev => ({ ...prev, waitingRoomPolicy: opt.value }))}
                      style={{
                        flex: 1, padding: '10px 16px', borderRadius: '8px',
                        border: active ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                        background: active ? '#dbeafe' : 'transparent',
                        color: active ? 'var(--accent)' : 'var(--text-primary)',
                        cursor: 'pointer', fontSize: '14px', fontWeight: active ? '600' : '400'
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              <p style={{ margin: '-8px 0 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Automatic admits students on join; Manual admits on-time and late students
                automatically and only asks you to approve very-late arrivals.
              </p>

              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                Waiting Room Chime
              </label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                {[{ label: 'Off', value: false }, { label: 'On', value: true }].map(opt => {
                  const active = (localSettings.waitingRoomChime !== false) === opt.value
                  return (
                    <button
                      key={opt.label}
                      onClick={() => setLocalSettings(prev => ({ ...prev, waitingRoomChime: opt.value }))}
                      style={{
                        flex: 1, padding: '10px 16px', borderRadius: '8px',
                        border: active ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                        background: active ? '#dbeafe' : 'transparent',
                        color: active ? 'var(--accent)' : 'var(--text-primary)',
                        cursor: 'pointer', fontSize: '14px', fontWeight: active ? '600' : '400'
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              <p style={{ margin: '0 0 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Play a soft chime on your device when a student enters the waiting room. The global
                sound toggle still mutes all sounds.
              </p>

              {/* Schedule + penalty inputs only make sense when the waiting room / attendance
                  tracking is on — hide them entirely when it is off. */}
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                Scheduled Start (optional)
              </label>
          <input
            type="datetime-local"
            value={isoToLocalInput(localSettings.scheduledStartAt)}
            onChange={(e) => setLocalSettings(prev => ({ ...prev, scheduledStartAt: localInputToIso(e.target.value) }))}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box',
              marginBottom: '16px'
            }}
          />
          <p style={{ margin: '-8px 0 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Used to classify on-time / late / very-late. Leave empty to mark everyone on time.
          </p>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 140px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                  Grace ({graceUnit})
                </label>
                <UnitToggle value={graceUnit} onChange={setGraceUnit} />
              </div>
              <DraftNumberInput
                min={GRACE_MIN}
                max={graceUnit === 'sec' ? GRACE_MAX * 60 : GRACE_MAX}
                step={graceUnit === 'sec' ? 1 : 'any'}
                value={toUnitValue(localSettings.graceMinutes ?? GRACE_DEFAULT, graceUnit)}
                onCommit={(raw) => setLocalSettings(prev => ({ ...prev, graceMinutes: fromUnitValue(raw, graceUnit, GRACE_MAX, GRACE_DEFAULT) }))}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', textAlign: 'center', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                  Late window ({lateWindowUnit})
                </label>
                <UnitToggle value={lateWindowUnit} onChange={setLateWindowUnit} />
              </div>
              <DraftNumberInput
                min={LATE_WINDOW_MIN}
                max={lateWindowUnit === 'sec' ? LATE_WINDOW_MAX * 60 : LATE_WINDOW_MAX}
                step={lateWindowUnit === 'sec' ? 1 : 'any'}
                value={toUnitValue(localSettings.lateWindowMinutes ?? LATE_WINDOW_DEFAULT, lateWindowUnit)}
                onCommit={(raw) => setLocalSettings(prev => ({ ...prev, lateWindowMinutes: fromUnitValue(raw, lateWindowUnit, LATE_WINDOW_MAX, LATE_WINDOW_DEFAULT) }))}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', textAlign: 'center', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                Late penalty (SP)
              </label>
              <DraftNumberInput
                min={LATE_PENALTY_MIN} max={LATE_PENALTY_MAX} step="1"
                value={localSettings.latePenaltySp ?? LATE_PENALTY_DEFAULT}
                onCommit={(raw) => setLocalSettings(prev => ({ ...prev, latePenaltySp: clampIntInRange(raw, LATE_PENALTY_MIN, LATE_PENALTY_MAX, LATE_PENALTY_DEFAULT) }))}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', textAlign: 'center', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Late costs 1×, very late 2×, absent 3× this SP. Every 3rd consecutive late also triggers a strike.
          </p>
            </>
          )}
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '10px',
            border: 'none',
            background: 'var(--accent-gradient)',
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Save Settings
        </button>
      </div>
    </div>
  )
}

export default RoomSettingsModal