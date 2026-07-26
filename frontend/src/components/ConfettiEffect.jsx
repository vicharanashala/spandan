import React, { useEffect, useState } from 'react'

export default function ConfettiEffect({ trigger, duration = 3000 }) {
  const [pieces, setPieces] = useState([])

  useEffect(() => {
    if (!trigger) return

    const newPieces = Array.from({ length: 50 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: -10 - Math.random() * 20,
      rotation: Math.random() * 360,
      scale: Math.random() * 0.5 + 0.5,
      color: ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][Math.floor(Math.random() * 5)],
      speed: Math.random() * 2 + 1,
      delay: Math.random() * 0.5
    }))

    setPieces(newPieces)

    const timer = setTimeout(() => {
      setPieces([])
    }, duration)

    return () => clearTimeout(timer)
  }, [trigger, duration])

  if (!trigger || pieces.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 9999,
      overflow: 'hidden'
    }}>
      {pieces.map(piece => (
        <div
          key={piece.id}
          style={{
            position: 'absolute',
            left: `${piece.x}%`,
            top: `${piece.y}%`,
            width: '10px',
            height: '10px',
            backgroundColor: piece.color,
            transform: `rotate(${piece.rotation}deg) scale(${piece.scale})`,
            animation: `fall ${piece.speed}s linear ${piece.delay}s forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes fall {
          to {
            transform: translateY(100vh) rotate(720deg);
          }
        }
      `}</style>
    </div>
  )
}
