import React, { useState, useEffect } from 'react'

function MicDeviceSelector({
  primaryDeviceId,
  secondaryDeviceId,
  onPrimaryChange,
  onSecondaryChange,
  onShowSetupGuide,
  disabled = false
}) {
  const [devices, setDevices] = useState([])

  const loadDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return

      // Request permission once if labels are empty so device list has real names
      let deviceList = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = deviceList.filter(d => d.kind === 'audioinput')

      // If device labels are empty strings, asking getUserMedia brief permission resolves labels
      if (audioInputs.length > 0 && !audioInputs[0].label) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          tempStream.getTracks().forEach(track => track.stop())
          deviceList = await navigator.mediaDevices.enumerateDevices()
        } catch (e) {
          console.warn('[MIC SELECTOR] Could not request permission for device names:', e)
        }
      }

      const formattedDevices = deviceList
        .filter(d => d.kind === 'audioinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${index + 1}`
        }))

      setDevices(formattedDevices)
    } catch (err) {
      console.error('[MIC SELECTOR] Failed to enumerate audio devices:', err)
    }
  }

  useEffect(() => {
    loadDevices()

    const handleDeviceChange = () => {
      loadDevices()
    }

    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
      }
    }
  }, [])

  return (
    <div style={{
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      fontSize: '12px'
    }}>
      {/* Primary Microphone Selector */}
      <div>
        <label style={{
          display: 'block',
          marginBottom: '4px',
          fontWeight: '600',
          color: 'var(--text-primary)'
        }}>
          🎤 Primary Microphone
        </label>
        <select
          value={primaryDeviceId || ''}
          onChange={(e) => onPrimaryChange(e.target.value || null)}
          disabled={disabled}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            cursor: disabled ? 'not-allowed' : 'pointer'
          }}
        >
          <option value="">Default Microphone</option>
          {devices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      {/* Secondary Audio Source Selector (VB-Cable / BlackHole) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <label style={{
            fontWeight: '600',
            color: 'var(--text-primary)'
          }}>
            🔊 Secondary Source (Classroom Audio)
          </label>
          {onShowSetupGuide && (
            <button
              onClick={onShowSetupGuide}
              type="button"
              style={{
                background: 'none',
                border: 'none',
                color: '#3b82f6',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: '500',
                padding: 0,
                textDecoration: 'underline'
              }}
            >
              📋 Setup Guide
            </button>
          )}
        </div>
        <select
          value={secondaryDeviceId || ''}
          onChange={(e) => onSecondaryChange(e.target.value || null)}
          disabled={disabled}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: '6px',
            border: secondaryDeviceId ? '1px solid #10b981' : '1px solid var(--border-color)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            cursor: disabled ? 'not-allowed' : 'pointer'
          }}
        >
          <option value="">None (Mic only)</option>
          {devices.map(d => (
            <option key={`sec-${d.deviceId}`} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
        {secondaryDeviceId && (
          <p style={{ margin: '2px 0 0', fontSize: '10px', color: '#10b981', fontWeight: '500' }}>
            ✓ Dual-device audio mixing active
          </p>
        )}
      </div>
    </div>
  )
}

export default MicDeviceSelector
