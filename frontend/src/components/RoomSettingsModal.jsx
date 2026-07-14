import React, { useState, useEffect } from 'react'
import { getAIProviders, getGrokApiKey, setGrokApiKey, getGeminiApiKey, setGeminiApiKey, getGroqApiKey, setGroqApiKey } from '../services/questionService'

const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard']
const SEGMENT_TIMES = [1, 2, 3, 5, 10, 15, 20, 30]
const GROK_MODELS = ['grok-4', 'grok-4-fast', 'grok-3', 'grok-3-mini']
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it']

// Client-side providers that show API key input in the UI
const CLIENT_KEY_PROVIDERS = ['grok', 'google', 'groq']

function ApiKeySection({ providerId, label, keySaved, keyInput, onKeyChange, onKeySave, onKeyRemove, modelValue, modelList, onModelChange }) {
  return (
    <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
          {label} API Key
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => onKeyChange(e.target.value)}
            placeholder={`Enter your ${label} API key`}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '13px'
            }}
          />
          <button
            onClick={() => onKeySave(keyInput)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: keyInput ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'var(--border-color)',
              color: keyInput ? 'white' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: '600',
              cursor: keyInput ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap'
            }}
            disabled={!keyInput}
          >
            Save Key
          </button>
        </div>
        {keySaved && (
          <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#10b981' }}>✓ API key saved</span>
            <button
              onClick={onKeyRemove}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ef4444',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Remove
            </button>
          </div>
        )}
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
          {label} Model
        </label>
        <select
          value={modelValue}
          onChange={onModelChange}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          {modelList.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

function RoomSettingsModal({ isOpen, onClose, settings, onSave }) {
  const [localSettings, setLocalSettings] = useState(settings)
  const [providers, setProviders] = useState([])
  const [loadingProviders, setLoadingProviders] = useState(false)

  // Client-side key states
  const [grokKeyInput, setGrokKeyInput] = useState(getGrokApiKey())
  const [grokKeySaved, setGrokKeySaved] = useState(!!getGrokApiKey())
  const [geminiKeyInput, setGeminiKeyInput] = useState(getGeminiApiKey())
  const [geminiKeySaved, setGeminiKeySaved] = useState(!!getGeminiApiKey())
  const [groqKeyInput, setGroqKeyInput] = useState(getGroqApiKey())
  const [groqKeySaved, setGroqKeySaved] = useState(!!getGroqApiKey())

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings)
      setGrokKeyInput(getGrokApiKey())
      setGrokKeySaved(!!getGrokApiKey())
      setGeminiKeyInput(getGeminiApiKey())
      setGeminiKeySaved(!!getGeminiApiKey())
      setGroqKeyInput(getGroqApiKey())
      setGroqKeySaved(!!getGroqApiKey())
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

  const keySavedMap = {
    grok: grokKeySaved,
    google: geminiKeySaved,
    groq: groqKeySaved
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
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' }}>
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
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' }}>
            Questions / Segment
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setLocalSettings(prev => ({ 
                ...prev, 
                questionsPerSegment: Math.max(1, (prev.questionsPerSegment || 2) - 1)
              }))}
              style={{
                width: '36px', height: '36px', borderRadius: '8px',
                border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', cursor: 'pointer', fontSize: '18px', fontWeight: '600'
              }}
            >−</button>
            <span style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', minWidth: '40px', textAlign: 'center' }}>
              {localSettings.questionsPerSegment || 2}
            </span>
            <button
              onClick={() => setLocalSettings(prev => ({ 
                ...prev, 
                questionsPerSegment: Math.min(10, (prev.questionsPerSegment || 2) + 1)
              }))}
              style={{
                width: '36px', height: '36px', borderRadius: '8px',
                border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', cursor: 'pointer', fontSize: '18px', fontWeight: '600'
              }}
            >+</button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Number of questions to generate per segment
          </p>
        </div>

        {/* Difficulty Level */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' }}>
            Difficulty Level
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {DIFFICULTY_LEVELS.map(level => (
              <button
                key={level}
                onClick={() => setLocalSettings(prev => ({ ...prev, difficulty: level }))}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: '8px',
                  border: localSettings.difficulty === level ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                  background: localSettings.difficulty === level ? '#dbeafe' : 'transparent',
                  color: localSettings.difficulty === level ? '#1e40af' : 'var(--text-primary)',
                  cursor: 'pointer', fontSize: '14px',
                  fontWeight: localSettings.difficulty === level ? '600' : '400',
                  textTransform: 'capitalize'
                }}
              >{level}</button>
            ))}
          </div>
        </div>

        {/* Question Generator Model */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' }}>
            Question Generator
          </label>
          <select
            value={localSettings.questionProvider || 'minimax'}
            onChange={(e) => setLocalSettings(prev => ({ ...prev, questionProvider: e.target.value }))}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '8px',
              border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
              color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer'
            }}
          >
            {loadingProviders ? (
              <option value="">Loading providers...</option>
            ) : (
              providers.map(p => {
                let label = `${p.icon} ${p.name}`
                if (CLIENT_KEY_PROVIDERS.includes(p.id)) {
                  if (!keySavedMap[p.id]) label += ' (No API Key)'
                } else if (!p.enabled) {
                  label += ' (No API Key)'
                }
                return (
                  <option key={p.id} value={p.id} disabled={CLIENT_KEY_PROVIDERS.includes(p.id) ? false : !p.enabled}>
                    {label}
                  </option>
                )
              })
            )}
          </select>

          {/* Grok section */}
          {localSettings.questionProvider === 'grok' && (
            <ApiKeySection
              providerId="grok" label="Grok"
              keySaved={grokKeySaved} keyInput={grokKeyInput}
              onKeyChange={setGrokKeyInput}
              onKeySave={(val) => { setGrokApiKey(val); setGrokKeySaved(!!val) }}
              onKeyRemove={() => { setGrokApiKey(''); setGrokKeyInput(''); setGrokKeySaved(false) }}
              modelValue={localSettings.grokModel || 'grok-4'}
              modelList={GROK_MODELS}
              onModelChange={(e) => {
                const model = e.target.value
                setLocalSettings(prev => ({ ...prev, grokModel: model }))
                localStorage.setItem('grok_model', model)
              }}
            />
          )}

          {/* Gemini section */}
          {localSettings.questionProvider === 'google' && (
            <ApiKeySection
              providerId="google" label="Gemini"
              keySaved={geminiKeySaved} keyInput={geminiKeyInput}
              onKeyChange={setGeminiKeyInput}
              onKeySave={(val) => { setGeminiApiKey(val); setGeminiKeySaved(!!val) }}
              onKeyRemove={() => { setGeminiApiKey(''); setGeminiKeyInput(''); setGeminiKeySaved(false) }}
              modelValue={localSettings.geminiModel || 'gemini-2.0-flash'}
              modelList={GEMINI_MODELS}
              onModelChange={(e) => {
                const model = e.target.value
                setLocalSettings(prev => ({ ...prev, geminiModel: model }))
                localStorage.setItem('gemini_model', model)
              }}
            />
          )}

          {/* Groq section */}
          {localSettings.questionProvider === 'groq' && (
            <ApiKeySection
              providerId="groq" label="Groq"
              keySaved={groqKeySaved} keyInput={groqKeyInput}
              onKeyChange={setGroqKeyInput}
              onKeySave={(val) => { setGroqApiKey(val); setGroqKeySaved(!!val) }}
              onKeyRemove={() => { setGroqApiKey(''); setGroqKeyInput(''); setGroqKeySaved(false) }}
              modelValue={localSettings.groqModel || 'llama-3.3-70b-versatile'}
              modelList={GROQ_MODELS}
              onModelChange={(e) => {
                const model = e.target.value
                setLocalSettings(prev => ({ ...prev, groqModel: model }))
                localStorage.setItem('groq_model', model)
              }}
            />
          )}
        </div>

        {/* Question Type Distribution */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' }}>
            Question Type Distribution
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            {['MCQ', 'TF', 'MSQ'].map(type => (
              <div key={type} style={{ flex: 1 }}>
                <p style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--text-secondary)' }}>{type}</p>
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
                    width: '100%', padding: '8px 12px', borderRadius: '8px',
                    border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                    color: 'var(--text-primary)', fontSize: '14px'
                  }}
                />
              </div>
            ))}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Percentages for question types when generating 4+ questions
          </p>
        </div>

        {/* Time to Answer */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' }}>
            Time to Answer (TTA)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="number" min="0" max="300"
              value={localSettings.timeToAnswer || 30}
              onChange={(e) => setLocalSettings(prev => ({ 
                ...prev, 
                timeToAnswer: Math.min(300, Math.max(0, parseInt(e.target.value) || 30))
              }))}
              style={{
                width: '100px', padding: '10px 12px', borderRadius: '8px',
                border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600', textAlign: 'center'
              }}
            />
            <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>seconds (0-300)</span>
          </div>
        </div>

        {/* Points */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' }}>
            Points per Question
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="number" min="1" max="500"
              value={localSettings.points || 10}
              onChange={(e) => setLocalSettings(prev => ({ 
                ...prev, 
                points: Math.min(500, Math.max(1, parseInt(e.target.value) || 10))
              }))}
              style={{
                width: '100px', padding: '10px 12px', borderRadius: '8px',
                border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600', textAlign: 'center'
              }}
            />
            <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>points (1-500)</span>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          style={{
            width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer'
          }}
        >
          Save Settings
        </button>
      </div>
    </div>
  )
}

export default RoomSettingsModal
