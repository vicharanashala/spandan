import React, { useEffect, useRef } from 'react'

/**
 * ConfettiEffect – lightweight canvas-based confetti
 * Usage: <ConfettiEffect trigger={boolean} duration={ms} />
 */
export default function ConfettiEffect({ trigger, duration = 2800 }) {
  const canvasRef = useRef(null)
  const animRef   = useRef(null)
  const startRef  = useRef(null)

  useEffect(() => {
    if (!trigger) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight

    const COLORS = ['#7c3aed','#a855f7','#ffd700','#10b981','#3b82f6','#ec4899','#f59e0b','#ef4444']
    const particles = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: 8 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      speed: 2 + Math.random() * 4,
      angle: Math.random() * 360,
      spin: (Math.random() - 0.5) * 6,
      drift: (Math.random() - 0.5) * 2,
    }))

    const draw = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp
      const elapsed = timestamp - startRef.current

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      let alive = false
      for (const p of particles) {
        p.y     += p.speed
        p.x     += p.drift
        p.angle += p.spin
        if (p.y < canvas.height + 20) alive = true

        ctx.save()
        ctx.translate(p.x + p.w / 2, p.y + p.h / 2)
        ctx.rotate((p.angle * Math.PI) / 180)
        ctx.globalAlpha = elapsed < duration - 600
          ? 1
          : Math.max(0, (duration - elapsed) / 600)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }

      if (elapsed < duration && alive) {
        animRef.current = requestAnimationFrame(draw)
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }

    startRef.current = null
    animRef.current = requestAnimationFrame(draw)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [trigger, duration])

  if (!trigger) return null

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100vw', height: '100vh',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  )
}
