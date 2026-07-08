import React, { useEffect, useRef } from 'react'

/**
 * QRCodeCard — zero-dependency QR code display for room joining
 * Uses the free qrserver.com API to generate the QR image
 *
 * Props:
 *   roomCode: string  — the room code to encode
 *   joinUrl?: string  — full URL to encode (falls back to room code)
 *   size?: number     — pixel size (default 160)
 *   showCode?: boolean — whether to show the text code below (default true)
 */
export default function QRCodeCard({ roomCode, joinUrl, size = 160, showCode = true, compact = false }) {
  const data = joinUrl || `${window.location.origin}/student/join-room?code=${roomCode}`
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&margin=1&color=7c3aed&bgcolor=ffffff&ecc=M`

  const handleCopy = () => {
    navigator.clipboard?.writeText(data)
      .then(() => {
        // quick visual feedback via title attr tooltip
      })
      .catch(() => {})
  }

  if (compact) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <img src={qrSrc} alt={`QR Code for room ${roomCode}`}
        width={64} height={64}
        style={{ borderRadius: '8px', border: '1px solid var(--border-color)', display: 'block' }}
      />
      <div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: '4px' }}>Room Code</div>
        <span className="room-code" style={{ fontSize: '16px' }}>{roomCode}</span>
      </div>
    </div>
  )

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '16px', padding: '20px', textAlign: 'center',
      boxShadow: 'var(--card-shadow)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', justifyContent: 'center' }}>
        <span style={{ fontSize: '16px' }}>📱</span>
        <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)' }}>Scan to Join</span>
      </div>

      {/* QR code */}
      <div style={{
        display: 'inline-block', padding: '12px',
        background: 'white', borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(124,58,237,.15)',
        border: '2px solid rgba(124,58,237,.2)',
        marginBottom: '16px',
      }}>
        <img
          src={qrSrc}
          alt={`QR code to join room ${roomCode}`}
          width={size}
          height={size}
          style={{ display: 'block', borderRadius: '6px' }}
          loading="lazy"
        />
      </div>

      {/* Room code display */}
      {showCode && (
        <div>
          <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: '8px' }}>
            Or enter code manually
          </div>
          <span className="room-code" style={{ fontSize: '22px', display: 'inline-block', marginBottom: '12px' }}>
            {roomCode}
          </span>
        </div>
      )}

      {/* Copy link button */}
      <button
        onClick={handleCopy}
        className="btn btn-ghost btn-sm"
        style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}
        data-tooltip="Copied!"
      >
        🔗 Copy Join Link
      </button>
    </div>
  )
}
