import React, { useState, useEffect } from 'react'
import { getOS } from '../utils/browserDetect'

function SystemAudioSetupModal({ onClose, onDeviceDetected }) {
  const [activeTab, setActiveTab] = useState('windows')
  const [isScanning, setIsScanning] = useState(false)
  const [detectedName, setDetectedName] = useState('')
  const [scanMessage, setScanMessage] = useState('')

  useEffect(() => {
    setActiveTab(getOS())
  }, [])

  const handleScan = async () => {
    setIsScanning(true)
    setScanMessage('')
    setDetectedName('')

    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error('Media devices API not supported')
      }

      let deviceList = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = deviceList.filter(d => d.kind === 'audioinput')

      if (audioInputs.length > 0 && !audioInputs[0].label) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          tempStream.getTracks().forEach(t => t.stop())
          deviceList = await navigator.mediaDevices.enumerateDevices()
        } catch (e) {
          console.warn('Permission request for device names failed:', e)
        }
      }

      const virtualDeviceRegex = /cable|vb-audio|virtual|blackhole|multi-output/i
      const found = deviceList.find(d => d.kind === 'audioinput' && virtualDeviceRegex.test(d.label))

      if (found) {
        setDetectedName(found.label)
        setScanMessage('Success! Virtual device detected.')
        if (onDeviceDetected) {
          onDeviceDetected(found.deviceId)
        }
      } else {
        setScanMessage('No virtual device detected. Follow the instructions below and retry.')
      }
    } catch (err) {
      setScanMessage('Error: ' + err.message)
    }

    setIsScanning(false)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-lg)',
          width: '520px',
          maxWidth: '100%',
          padding: '24px',
          color: 'var(--text-primary)',
          boxSizing: 'border-box'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>
            📋 System Audio Setup Guide
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Selection */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          {['windows', 'mac', 'linux'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === tab ? '#3b82f6' : 'transparent',
                color: activeTab === tab ? 'white' : 'var(--text-primary)',
                fontWeight: '600',
                fontSize: '12px',
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {tab === 'windows' ? '🪟 Windows' : (tab === 'mac' ? '🍎 macOS' : '🐧 Linux')}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ fontSize: '13px', lineHeight: '1.6', marginBottom: '20px' }}>
          {activeTab === 'windows' && (
            <ol style={{ paddingLeft: '20px', margin: 0 }}>
              <li>
                Download <strong>VB-Audio Virtual Cable</strong> from{' '}
                <a href="https://vb-audio.com/Cable/" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
                  vb-audio.com/Cable
                </a>
              </li>
              <li>Extract the ZIP and run <code>VBCABLE_Setup_x64.exe</code> as Administrator</li>
              <li>Reboot your computer if prompted</li>
              <li>Set Windows sound output to <em>CABLE Input</em></li>
              <li>In Spandan, select <strong>CABLE Output</strong> as Secondary Source</li>
            </ol>
          )}

          {activeTab === 'mac' && (
            <ol style={{ paddingLeft: '20px', margin: 0 }}>
              <li>
                Download <strong>BlackHole 2ch</strong> from{' '}
                <a href="https://existential.audio/blackhole/" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
                  existential.audio/blackhole
                </a>
              </li>
              <li>Run the downloaded installer package</li>
              <li>Open macOS <strong>Audio MIDI Setup</strong> app</li>
              <li>Create a <em>Multi-Output Device</em> containing both <strong>Built-in Output</strong> and <strong>BlackHole 2ch</strong></li>
              <li>Set Multi-Output Device as system output</li>
              <li>In Spandan, select <strong>BlackHole 2ch</strong> as Secondary Source</li>
            </ol>
          )}

          {activeTab === 'linux' && (
            <ol style={{ paddingLeft: '20px', margin: 0 }}>
              <li>Use PulseAudio/PipeWire volume control (<code>pavucontrol</code>)</li>
              <li>Under Input Devices, locate <em>Monitor of Built-in Audio</em></li>
              <li>Select that monitor device as Secondary Source in Spandan</li>
            </ol>
          )}
        </div>

        {/* Verification Status Area */}
        <div style={{
          background: 'var(--bg-primary)',
          borderRadius: '10px',
          padding: '12px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: '600' }}>
              Device Detection:
            </div>
            {detectedName ? (
              <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '600' }}>
                ✓ {detectedName}
              </span>
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {scanMessage || 'Not scanned yet'}
              </span>
            )}
          </div>
          <button
            onClick={handleScan}
            disabled={isScanning}
            style={{
              padding: '6px 12px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: isScanning ? 'not-allowed' : 'pointer'
            }}
          >
            {isScanning ? 'Scanning...' : 'Scan Devices'}
          </button>
        </div>

        {/* Footer actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              background: 'var(--border-color)',
              color: 'var(--text-primary)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default SystemAudioSetupModal
