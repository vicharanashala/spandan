// Lightweight, high-performance canvas confetti celebration with zero dependencies.
export function triggerConfetti(options = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return

  // Respect user preference for reduced motion (accessibility)
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return
  }

  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    position: 'fixed',
    top: '0px',
    left: '0px',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '99999'
  })
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }

  canvas.width = window.innerWidth
  canvas.height = window.innerHeight

  const colors = options.colors || [
    '#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#facc15'
  ]
  const count = options.particleCount || 70
  const particles = []

  for (let i = 0; i < count; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 160,
      y: canvas.height * 0.45 + (Math.random() - 0.5) * 80,
      r: Math.random() * 5 + 3,
      d: Math.random() * count,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 14,
      vy: Math.random() * -12 - 4,
      tilt: Math.random() * 10 - 10,
      tiltAngleIncremental: (Math.random() * 0.08) + 0.04,
      tiltAngle: 0
    })
  }

  let animationFrame
  const startTime = Date.now()
  const duration = options.duration || 2400

  function render() {
    const elapsed = Date.now() - startTime
    if (elapsed > duration) {
      cancelAnimationFrame(animationFrame)
      canvas.remove()
      return
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const fadeStart = duration - 500
    const opacity = elapsed > fadeStart ? Math.max(0, (duration - elapsed) / 500) : 1
    ctx.globalAlpha = opacity

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      p.tiltAngle += p.tiltAngleIncremental
      p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2
      p.x += Math.sin(p.d) + p.vx
      p.y += p.vy
      p.vy += 0.38 // gravity
      p.vx *= 0.98

      ctx.beginPath()
      ctx.lineWidth = p.r
      ctx.strokeStyle = p.color
      ctx.moveTo(p.x + p.tilt + p.r / 4, p.y)
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4)
      ctx.stroke()
    }

    animationFrame = requestAnimationFrame(render)
  }

  animationFrame = requestAnimationFrame(render)
}
