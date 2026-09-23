import React, { useState, useEffect } from 'react'
import { getOS, supportsSystemAudioCapture } from '../utils/browserDetect'

function AudioSetupWizard({ onComplete, onSkip }) {
  const [step, setStep] = useState(1)
  const [os, setOs] = useState('windows')
  const [isVerifying, setIsVerifying] = useState(false)
  const [detectedDevice, setDetectedDevice] = useState(null)
  const [verificationError, setVerificationError] = useState('')

  const isChromium = supportsSystemAudioCapture()

  useEffect(() => {
    setOs(getOS())
  }, [])

  const handleVerifyDevice = async () => {
    setIsVerifying(true)
    setVerificationError('')
    setDetectedDevice(null)

    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error('Media devices API not supported in this browser')
      }

      // Request permission briefly if needed
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
        setDetectedDevice(found)
      } else {
        setVerificationError('No virtual audio device detected yet. Make sure you installed VB-Cable / BlackHole and restarted your browser.')
      }
    } catch (err) {
      setVerificationError('Error checking devices: ' + err.message)
    }

    setIsVerifying(false)
  }

  const handleFinish = () => {
    localStorage.setItem('spandan-audio-setup-complete', 'true')
    if (detectedDevice?.deviceId) {
      localStorage.setItem('spandan-secondary-audio-device', detectedDevice.deviceId)
    }
    onComplete(detectedDevice?.deviceId || null)
  }

  const handleSkipChrome = () => {
    localStorage.setItem('spandan-audio-setup-complete', 'true')
    onComplete(null)
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-lg)',
        width: '540px',
        maxWidth: '100%',
        padding: '28px',
        color: 'var(--text-primary)',
        boxSizing: 'border-box'
      }}>
        {/* Stepper Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '1px' }}>
              First-Time Teacher Setup
            </span>
            <h2 style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: '700' }}>
              🎙️ Class & System Audio Capture
            </h2>
          </div>
          {/* Step dots */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {[1, 2, 3].map(s => (
              <div
                key={s}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: step === s ? '#3b82f6' : (step > s ? '#10b981' : 'var(--bg-primary)'),
                  color: step >= s ? 'white' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: '700',
                  border: step < s ? '1px solid var(--border-color)' : 'none'
                }}
              >
                {step > s ? '✓' : s}
              </div>
            ))}
          </div>
        </div>

        {/* STEP 1: Welcome */}
        {step === 1 && (
          <div>
            <p style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              Spandan transcribes your lecture audio to auto-generate questions. To ensure questions cover <strong>everyone speaking</strong> (students, online participants, and videos), we recommend capturing classroom/system audio alongside your microphone.
            </p>

            {isChromium && (
              <div style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid #3b82f6',
                borderRadius: '10px',
                padding: '14px',
                marginBottom: '20px'
              }}>
                <div style={{ fontWeight: '600', color: '#3b82f6', fontSize: '14px', marginBottom: '4px' }}>
                  💡 Chrome / Edge Detected!
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.5' }}>
                  Your browser supports native system audio capture with <strong>zero installation required</strong>. You can use the "Mic + System Audio" toggle on the recording card.
                </p>
                <button
                  onClick={handleSkipChrome}
                  style={{
                    marginTop: '10px',
                    padding: '8px 14px',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  ⚡ Use One-Click System Audio (No Install Needed)
                </button>
              </div>
            )}

            <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', margin: '0 0 12px' }}>
              Or setup a Virtual Audio Cable (works on all browsers including Firefox & Safari):
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                onClick={onSkip}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Skip for Now
              </button>
              <button
                onClick={() => setStep(2)}
                style={{
                  padding: '8px 20px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Start Virtual Device Setup →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Download & Install */}
        {step === 2 && (
          <div>
            {/* OS Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <button
                onClick={() => setOs('windows')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: os === 'windows' ? '#3b82f6' : 'transparent',
                  color: os === 'windows' ? 'white' : 'var(--text-primary)',
                  fontWeight: '600',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                🪟 Windows (VB-Cable)
              </button>
              <button
                onClick={() => setOs('mac')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: os === 'mac' ? '#3b82f6' : 'transparent',
                  color: os === 'mac' ? 'white' : 'var(--text-primary)',
                  fontWeight: '600',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                🍎 macOS (BlackHole)
              </button>
            </div>

            {/* Windows Instructions */}
            {os === 'windows' && (
              <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                <ol style={{ paddingLeft: '20px', margin: '0 0 16px' }}>
                  <li>
                    Download <strong>VB-Cable Driver</strong> from{' '}
                    <a href="https://vb-audio.com/Cable/" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
                      vb-audio.com/Cable
                    </a>
                  </li>
                  <li>Extract the ZIP file and right-click <code>VBCABLE_Setup_x64.exe</code> → <em>Run as Administrator</em></li>
                  <li>Click <strong>Install Driver</strong> and reboot if prompted</li>
                  <li>In Windows Sound Settings, set <strong>CABLE Input</strong> as your default speaker output</li>
                </ol>
              </div>
            )}

            {/* Mac Instructions */}
            {os === 'mac' && (
              <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                <ol style={{ paddingLeft: '20px', margin: '0 0 16px' }}>
                  <li>
                    Download <strong>BlackHole 2ch</strong> from{' '}
                    <a href="https://existential.audio/blackhole/" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
                      existential.audio/blackhole
                    </a>
                  </li>
                  <li>Run the downloaded <code>.pkg</code> installer</li>
                  <li>Open <strong>Audio MIDI Setup</strong> (macOS app)</li>
                  <li>Click <strong>+</strong> → <em>Create Multi-Output Device</em> → Check both <strong>Built-in Output</strong> & <strong>BlackHole 2ch</strong></li>
                  <li>Set Multi-Output Device as your System Output</li>
                </ol>
              </div>
            )}

            {/* Linux Instructions */}
            {os === 'linux' && (
              <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                <p>PulseAudio supports monitor sources natively. Use <code>pavucontrol</code> to select <em>Monitor of Built-in Audio</em> in Spandan.</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', marginTop: '20px' }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                ← Back
              </button>
              <button
                onClick={() => {
                  setStep(3)
                  handleVerifyDevice()
                }}
                style={{
                  padding: '8px 20px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Verify Installation →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Verify */}
        {step === 3 && (
          <div>
            <p style={{ fontSize: '14px', margin: '0 0 16px' }}>
              Checking your system for virtual audio devices...
            </p>

            {isVerifying ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                ⏳ Scanning audio input devices...
              </div>
            ) : detectedDevice ? (
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid #10b981',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '20px'
              }}>
                <div style={{ fontWeight: '600', color: '#10b981', fontSize: '15px', marginBottom: '4px' }}>
                  🎉 Virtual Device Detected!
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                  Found: <strong>{detectedDevice.label}</strong>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '8px 0 0' }}>
                  This device will be automatically selected as your secondary classroom audio source.
                </p>
              </div>
            ) : (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '20px'
              }}>
                <div style={{ fontWeight: '600', color: '#ef4444', fontSize: '14px', marginBottom: '4px' }}>
                  ⚠️ Device Not Detected
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-primary)', margin: 0 }}>
                  {verificationError}
                </p>
                <button
                  onClick={handleVerifyDevice}
                  style={{
                    marginTop: '12px',
                    padding: '6px 12px',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  🔄 Re-Scan Devices
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', marginTop: '24px' }}>
              <button
                onClick={() => setStep(2)}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                ← Back to Guide
              </button>
              <button
                onClick={handleFinish}
                style={{
                  padding: '8px 24px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {detectedDevice ? 'Complete Setup ✓' : 'Finish Setup'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AudioSetupWizard
