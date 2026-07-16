import React, { useState, useEffect, useRef } from 'react'
import { getAIProviders } from '../services/questionService'
import { playNotificationSound } from '../utils/sounds'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'

const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard']
const SEGMENT_TIMES = [1, 2, 3, 5, 10, 15, 20, 30]

const NOTIFICATION_SOUNDS = [
  { id: 'beep', label: 'Beep', icon: '🔔', desc: 'Classic notification beep' },
  { id: 'chime', label: 'Chime', icon: '🎵', desc: 'Soft two-tone chime' },
  { id: 'bell', label: 'Bell', icon: '🛎️', desc: 'Quick bell ring' },
  { id: 'ding', label: 'Ding', icon: '✨', desc: 'Short crisp ding' },
  { id: 'pop', label: 'Pop', icon: '🫧', desc: 'Fun pop sound' },
  { id: 'none', label: 'Silent', icon: '🔇', desc: 'No sound' }
]

function RoomSettingsModal({ isOpen, onClose, settings, onSave }) {
  const [localSettings, setLocalSettings] = useState(settings)
  const [providers, setProviders] = useState([])
  const [loadingProviders, setLoadingProviders] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const { token } = useAuthStore()

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings)
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

  const handleUploadSound = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('sound', file)
      const res = await fetch(`${API_URL}/sounds/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setLocalSettings(prev => ({
          ...prev,
          notificationSound: 'custom',
          customSoundUrl: data.url
        }))
      } else {
        alert(data.error || 'Upload failed')
      }
    } catch (err) {
      alert('Upload failed: ' + err.message)
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
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
            ⚙️ Room Settings
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--text-secondary)'
            }}
          >
            ✕
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
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {SEGMENT_TIMES.map(time => (
              <button
                key={time}
                onClick={() => setLocalSettings(prev => ({ ...prev, segmentTime: time }))}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: localSettings.segmentTime === time 
                    ? '2px solid #3b82f6' 
                    : '1px solid var(--border-color)',
                  background: localSettings.segmentTime === time ? '#dbeafe' : 'transparent',
                  color: localSettings.segmentTime === time ? '#1e40af' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: localSettings.segmentTime === time ? '600' : '400'
                }}
              >
                {time} min
              </button>
            ))}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            After this time, a new segment starts and questions are auto-generated
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
                    ? '2px solid #3b82f6' 
                    : '1px solid var(--border-color)',
                  background: localSettings.difficulty === level ? '#dbeafe' : 'transparent',
                  color: localSettings.difficulty === level ? '#1e40af' : 'var(--text-primary)',
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

        {/* Notification Sound */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'var(--text-primary)'
          }}>
            🔔 Notification Sound
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {NOTIFICATION_SOUNDS.map(sound => (
              <button
                key={sound.id}
                onClick={() => {
                  setLocalSettings(prev => ({ ...prev, notificationSound: sound.id }))
                  playNotificationSound(sound.id)
                }}
                style={{
                  padding: '10px 8px',
                  borderRadius: '8px',
                  border: localSettings.notificationSound === sound.id
                    ? '2px solid #3b82f6'
                    : '1px solid var(--border-color)',
                  background: localSettings.notificationSound === sound.id ? '#dbeafe' : 'transparent',
                  color: localSettings.notificationSound === sound.id ? '#1e40af' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: localSettings.notificationSound === sound.id ? '600' : '400',
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: '20px', marginBottom: '2px' }}>{sound.icon}</div>
                <div>{sound.label}</div>
              </button>
            ))}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Sound students hear when a new question appears (click to preview)
          </p>
          <div style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.ogg,.m4a,.aac,.webm"
              onChange={handleUploadSound}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: uploading ? '#f3f4f6' : 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                cursor: uploading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {uploading ? '⏳ Uploading...' : '📁 Upload Custom Sound'}
            </button>
            {localSettings.notificationSound === 'custom' && localSettings.customSoundUrl && (
              <button
                onClick={() => {
                  const audio = new Audio(localSettings.customSoundUrl)
                  audio.play().catch(() => alert('Failed to play sound'))
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #3b82f6',
                  background: '#dbeafe',
                  color: '#1e40af',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                ▶ Preview
              </button>
            )}
          </div>
          {localSettings.notificationSound === 'custom' && (
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#1d4ed8' }}>
              ✅ Custom sound uploaded — students will hear this instead of a preset
            </p>
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
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
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