import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'

const TOUR_CSS = `
.tour-overlay {
  position: fixed; inset: 0; z-index: 1000; pointer-events: none;
  animation: tourFade .45s ease both;
}
.tour-hole {
  position: absolute;
  transition: all .55s cubic-bezier(.22,1,.36,1);
  animation: tourHoleIn .45s cubic-bezier(.22,1,.36,1) both;
  box-shadow:
    0 0 0 9999px rgba(8,14,30,0.74),
    0 0 0 3px rgba(59,130,246,0.55),
    0 0 0 6px rgba(37,99,235,0.12),
    0 0 44px 8px rgba(37,99,235,0.32),
    inset 0 0 26px rgba(37,99,235,0.16);
}
.tour-hole-shine {
  position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: linear-gradient(160deg, rgba(191,219,254,0.22), transparent 42%);
}
.tour-ring {
  position: absolute; inset: -3px; border-radius: inherit;
  border: 1.5px solid rgba(147,197,253,0.4);
  pointer-events: none;
}
.tour-corner { position: absolute; width: 12px; height: 12px; border: 2px solid rgba(191,219,254,0.9); box-shadow: 0 0 14px rgba(59,130,246,0.35); }
.tour-blob {
  position: absolute; left: 50%; top: 50%; width: 520px; height: 520px;
  transform: translate(-50%,-50%); border-radius: 50%;
  background: radial-gradient(circle, rgba(59,130,246,0.22) 0%, rgba(129,140,248,0.12) 45%, transparent 70%);
  filter: blur(6px); animation: tourFloat 6s ease-in-out infinite;
}
.tour-center-wrap {
  position: fixed; inset: 0; z-index: 1001;
  display: flex; align-items: center; justify-content: center;
  padding: 12px; box-sizing: border-box;
  pointer-events: none;
}
.tour-center-wrap .tour-frame { pointer-events: auto; width: 100%; max-width: 400px; animation: tourPop .5s cubic-bezier(.34,1.56,.64,1) both; }
.tour-frame {
  position: fixed; z-index: 1001;
  background: linear-gradient(135deg, rgba(147,197,253,0.95), rgba(96,165,250,0.55) 40%, rgba(167,139,250,0.75));
  padding: 1px; border-radius: 22px;
  box-shadow: 0 24px 60px -12px rgba(2,8,23,0.55), 0 8px 24px rgba(37,99,235,0.18);
  animation: tourPop .5s cubic-bezier(.34,1.56,.64,1) both;
  transition: top .55s cubic-bezier(.22,1,.36,1), left .55s cubic-bezier(.22,1,.36,1);
  box-sizing: border-box;
}
.tour-card {
  position: relative; border-radius: 21px; overflow: hidden;
  background: rgba(var(--bg-card-rgb), 0.82);
  backdrop-filter: blur(18px);
  color: var(--text-primary);
  box-sizing: border-box;
}
.tour-card-topline {
  height: 3px; border-radius: 3px 3px 0 0;
  background: linear-gradient(90deg, #1e40af, #3b82f6, #818cf8, #38bdf8, #1e40af);
  background-size: 300% 100%;
  animation: tourShimmer 6s linear infinite;
}
.tour-body { padding: 18px 20px 16px; animation: tourContent .38s cubic-bezier(.22,1,.36,1) both; }
.tour-chipbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.tour-chip {
  font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
  color: var(--accent-strong); line-height: 1;
  background: rgba(59,130,246,0.14); border: 1px solid rgba(59,130,246,0.22);
  padding: 5px 9px; border-radius: 999px;
}
.tour-close {
  width: 26px; height: 26px; border-radius: 50%; border: none; cursor: pointer;
  background: transparent; color: var(--text-secondary); font-size: 13px; line-height: 1;
  display: grid; place-items: center; transition: all .18s ease;
}
.tour-close:hover { background: rgba(127,127,127,0.16); color: var(--text-primary); }
.tour-head { display: flex; gap: 13px; align-items: center; flex-wrap: wrap; }
.tour-iconwrap {
  flex-shrink: 0; width: 46px; height: 46px; border-radius: 14px;
  display: grid; place-items: center; color: #fff;
  box-shadow: 0 8px 20px -6px rgba(37,99,235,0.55), inset 0 1px 0 rgba(255,255,255,0.35);
  animation: tourIconPulse 2.8s ease-in-out infinite;
}
.tour-title { margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -0.015em; line-height: 1.25; flex: 1; min-width: 0; }
.tour-desc { margin: 10px 0 18px; font-size: 13.5px; line-height: 1.6; color: var(--text-secondary); }
.tour-progress { height: 6px; border-radius: 999px; background: var(--border-color); overflow: hidden; margin-bottom: 14px; }
.tour-progress-fill {
  position: relative; height: 100%; border-radius: 999px;
  background: var(--accent-gradient);
  transition: width .55s cubic-bezier(.22,1,.36,1);
  overflow: hidden;
}
.tour-progress-fill::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent);
  transform: translateX(-100%);
  animation: tourSheen 1.7s ease-in-out infinite;
}
.tour-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.tour-dots { display: flex; gap: 4px; align-items: center; }
.tour-dot {
  width: 6px; height: 6px; border-radius: 999px;
  background: var(--border-color); transition: all .3s ease;
}
.tour-dot.on { width: 20px; background: var(--accent-gradient); }
.tour-count { font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-left: 6px; font-variant-numeric: tabular-nums; }
.tour-btns { display: flex; gap: 8px; align-items: center; }
.tour-btn {
  padding: 9px 16px; font-size: 12.5px; font-weight: 700; border-radius: 10px;
  cursor: pointer; border: none; transition: all .18s ease; line-height: 1;
}
.tour-btn:active { transform: translateY(1px); }
.tour-btn.primary { background: var(--accent-gradient); color: #fff; box-shadow: 0 8px 18px -6px rgba(37,99,235,0.55); }
.tour-btn.primary:hover { filter: brightness(1.08); }
.tour-btn.ghost { background: transparent; color: var(--text-secondary); border: 1px solid var(--border-color); }
.tour-btn.ghost:hover { color: var(--text-primary); border-color: var(--accent); }
.tour-skip { background: none; border: none; cursor: pointer; color: var(--text-secondary); font-size: 11.5px; text-decoration: underline; text-underline-offset: 3px; }
.tour-skip:hover { color: var(--text-primary); }
.tour-hint {
  margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border-color);
  display: flex; gap: 12px; align-items: center; justify-content: center;
  font-size: 10.5px; color: var(--text-secondary); opacity: .75;
}
.tour-kbd {
  font-family: inherit; font-size: 10px; border: 1px solid var(--border-color);
  border-bottom-width: 2px; border-radius: 4px; padding: 1px 5px; background: rgba(127,127,127,0.08);
}
.tour-arrow {
  position: absolute; width: 14px; height: 14px; transform: rotate(45deg);
  background: var(--bg-card); box-shadow: 0 -2px 8px rgba(2,8,23,0.18);
}
.tour-confetti { position: fixed; inset: 0; z-index: 1002; pointer-events: none; overflow: hidden; }
.tour-piece {
  position: absolute; top: -16px; border-radius: 2px;
  animation: tourFall linear both;
}
@keyframes tourFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes tourHoleIn { from { opacity: 0; transform: scale(.85) } to { opacity: 1; transform: scale(1) } }
@keyframes tourContent { 0% { opacity: 0; transform: translateY(8px) } 100% { opacity: 1; transform: translateY(0) } }
@keyframes tourPop { 0% { opacity: 0; transform: scale(.82) translateY(14px) } 100% { opacity: 1; transform: scale(1) translateY(0) } }
@keyframes tourFloat { 0%,100% { transform: translate(-50%,-50%) translateY(0) scale(1) } 50% { transform: translate(-50%,-50%) translateY(-16px) scale(1.06) } }
@keyframes tourIconPulse { 0%,100% { box-shadow: 0 8px 20px -6px rgba(37,99,235,0.55), inset 0 1px 0 rgba(255,255,255,0.35); } 50% { box-shadow: 0 8px 26px -4px rgba(99,102,241,0.7), inset 0 1px 0 rgba(255,255,255,0.35); } }
@keyframes tourShimmer { to { background-position: 300% 0 } }
@keyframes tourSheen { 0% { transform: translateX(-100%) } 60%,100% { transform: translateX(220%) } }
@keyframes tourFall { 0% { transform: translateY(0) rotate(0deg) translateX(0); opacity: 1 } 100% { transform: translateY(110vh) rotate(var(--rot)) translateX(var(--drift)); opacity: .9 } }
`

const GLYPHS = {
  sparkle: (<path d="M12 2l1.9 5.7a2 2 0 0 0 1.3 1.3L21 11l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 20l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 11l5.8-1.9a2 2 0 0 0 1.3-1.3L12 2z" />),
  zap: (<><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" /></>),
  grid: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  chart: (<><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></>),
  history: (<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>),
  help: (<><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.6-2.3 2-2.3 3.5" /><path d="M12 17h.01" /></>),
  done: (<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.6 2.6L16 9.5" /></>),
  trophy: (<><path d="M8 3h8v4a4 4 0 0 1-8 0V3z" /><path d="M8 5H4a1 1 0 0 0 0 3 3 3 0 0 0 4 2.6M16 5h4a1 1 0 0 1 0 3 3 3 0 0 1-4 2.6" /><path d="M12 11v4M9 20h6M10 20v-2a2 2 0 0 1 4 0v2" /></>)
}

const GRADIENTS = {
  sparkle: ['#6366f1', '#818cf8'],
  zap: ['#2563eb', '#3b82f6'],
  grid: ['#0ea5e9', '#22d3ee'],
  chart: ['#8b5cf6', '#a78bfa'],
  history: ['#0ea5e9', '#6366f1'],
  help: ['#f59e0b', '#fbbf24'],
  done: ['#10b981', '#34d399'],
  trophy: ['#f59e0b', '#f472b6']
}

const CONFETTI_COLORS = ['#3b82f6', '#818cf8', '#22d3ee', '#34d399', '#f59e0b', '#f472b6', '#a78bfa', '#60a5fa']

export default function OnboardingTour({ steps, onFinish }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState(null)
  const [cardH, setCardH] = useState(220)
  const cardRef = useRef(null)
  const step = steps[stepIndex]
  const isLast = stepIndex === steps.length - 1

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight || 220)
  }, [stepIndex, step?.title, step?.description])

  const measure = useCallback(() => {
    if (!step?.target) {
      setRect(null)
      return
    }
    const el = document.querySelector(step.target)
    if (!el) {
      setStepIndex((i) => (i < steps.length - 1 ? i + 1 : i))
      return
    }
    const r = el.getBoundingClientRect()
    setRect({ top: Math.round(r.top), left: Math.round(r.left), width: r.width, height: r.height })
  }, [step, steps.length])

  useLayoutEffect(() => {
    const el = step?.target ? document.querySelector(step.target) : null
    if (el) el.scrollIntoView({ block: 'center' })
    measure()
  }, [stepIndex, step?.target, measure])

  useEffect(() => {
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  const finish = useCallback((reason) => onFinish?.(reason), [onFinish])
  const next = useCallback(() => {
    if (isLast) finish('completed')
    else setStepIndex((i) => i + 1)
  }, [isLast, finish])
  const back = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') finish('skipped')
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish, next, back])

  const layout = useMemo(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const cardW = Math.min(344, vw - 24)
    if (!rect) return { center: true, cardW, top: null, left: null, placement: null, arrow: null }

    const gap = 18
    const tryPlacement = (p) => {
      let x, y, arrowSide
      if (p === 'bottom') { x = rect.left + rect.width / 2 - cardW / 2; y = rect.top + rect.height + gap; arrowSide = 'top' }
      else if (p === 'top') { x = rect.left + rect.width / 2 - cardW / 2; y = rect.top - gap - cardH; arrowSide = 'bottom' }
      else if (p === 'left') { x = rect.left - gap - cardW; y = rect.top; arrowSide = 'right' }
      else { x = rect.left + rect.width + gap; y = rect.top; arrowSide = 'left' }
      x = Math.max(12, Math.min(x, vw - cardW - 12))
      y = Math.max(12, Math.min(y, Math.max(12, vh - cardH - 12)))
      const overflowY = y + cardH > vh - 4
      const overlapX = Math.max(0, Math.min(x + cardW, rect.left + rect.width) - Math.max(x, rect.left))
      const overlapY = Math.max(0, Math.min(y + cardH, rect.top + rect.height) - Math.max(y, rect.top))
      const overlapRatio = (overlapX * overlapY) / (cardW * cardH)
      const coversTarget = overlapRatio > 0.35
      return { x, y, arrowSide, coversTarget, overflowY }
    }

    let p = step.placement || 'bottom'
    const opposite = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' }
    let pos = tryPlacement(p)
    if (pos.coversTarget && step.placement) pos = tryPlacement(opposite[p])
    if (pos.coversTarget || pos.overflowY) return { center: true, cardW, top: null, left: null, placement: null, arrow: null }

    const arrow = {
      top: { left: '50%', marginLeft: -7, top: -7, bottom: 'auto' },
      bottom: { left: '50%', marginLeft: -7, bottom: -7, top: 'auto' },
      left: { top: 14, marginTop: -7, left: -7, right: 'auto' },
      right: { top: 14, marginTop: -7, right: -7, left: 'auto' }
    }[pos.arrowSide]

    return { center: false, cardW, top: pos.y, left: pos.x, placement: pos.arrowSide, arrow }
  }, [rect, step, cardH])

  const progress = ((stepIndex + 1) / steps.length) * 100
  const icon = step.icon || 'sparkle'
  const Icon = GLYPHS[icon] || GLYPHS.sparkle
  const grad = (GRADIENTS[icon] || GRADIENTS.sparkle)

  const confetti = useMemo(() => (
    Array.from({ length: 46 }, (_, i) => ({
      left: (i * 47) % 100,
      delay: (i * 0.09) % 1.6,
      dur: 2.4 + (i % 6) * 0.32,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      w: 6 + (i % 5) * 2.5,
      h: 9 + (i % 4) * 5,
      rot: (i * 61 * (i % 2 ? 1 : -1)) % 360,
      drift: (i % 2 ? 1 : -1) * ((i * 17) % 70)
    }))
  ), [])

  const cardContent = (
    <div className="tour-card" ref={cardRef}>
      <div className="tour-card-topline" />
      <div className="tour-body" key={stepIndex}>
        <div className="tour-chipbar">
          <span className="tour-chip">{step.eyebrow || 'Interactive guide'}</span>
          <button className="tour-close" onClick={() => finish('skipped')} aria-label="Close tutorial">✕</button>
        </div>

        <div className="tour-head">
          <div className="tour-iconwrap" style={{ background: `linear-gradient(135deg, ${grad[0]}, ${grad[1]})` }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{Icon}</svg>
          </div>
          <h3 className="tour-title">{step.title}</h3>
        </div>

        <p className="tour-desc">{step.description}</p>

        <div className="tour-progress">
          <div className="tour-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="tour-foot">
          <div className="tour-dots">
            {steps.map((_, i) => <span key={i} className={`tour-dot${i === stepIndex ? ' on' : ''}`} />)}
            <span className="tour-count">{stepIndex + 1} / {steps.length}</span>
          </div>
          <div className="tour-btns">
            {stepIndex > 0 && <button className="tour-btn ghost" onClick={back}>Back</button>}
            <button className="tour-btn primary" onClick={next}>{isLast ? (step.cta || "Let's go") : 'Next'}</button>
          </div>
        </div>

        {stepIndex > 0 && (
          <div className="tour-hint">
            <span>Use <span className="tour-kbd">←</span> <span className="tour-kbd">→</span> to navigate</span>
            <span>Press <span className="tour-kbd">Esc</span> to exit</span>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      <style>{TOUR_CSS}</style>

      <div className="tour-overlay" aria-hidden="true">
        {rect ? (
          <div
            className="tour-hole"
            style={{
              left: `${rect.left - 8}px`,
              top: `${rect.top - 8}px`,
              width: `${rect.width + 16}px`,
              height: `${rect.height + 16}px`,
              borderRadius: '16px'
            }}
          >
            <span className="tour-ring" />
            <span className="tour-hole-shine" />
            <span className="tour-corner" style={{ top: -4, left: -4, borderRight: 'none', borderBottom: 'none', borderTopLeftRadius: 16 }} />
            <span className="tour-corner" style={{ top: -4, right: -4, borderLeft: 'none', borderBottom: 'none', borderTopRightRadius: 16 }} />
            <span className="tour-corner" style={{ bottom: -4, left: -4, borderRight: 'none', borderTop: 'none', borderBottomLeftRadius: 16 }} />
            <span className="tour-corner" style={{ bottom: -4, right: -4, borderLeft: 'none', borderTop: 'none', borderBottomRightRadius: 16 }} />
          </div>
        ) : (
          <div className="tour-blob" />
        )}
      </div>

      {isLast && (
        <div className="tour-confetti" aria-hidden="true">
          {confetti.map((c, i) => (
            <span
              key={i}
              className="tour-piece"
              style={{
                left: `calc(${c.left}% - 6px)`,
                width: c.w,
                height: c.h,
                background: c.color,
                opacity: 0.92,
                ['--rot' ]: `${c.rot}deg`,
                ['--drift' ]: `${c.drift}px`,
                animationDuration: `${c.dur}s`,
                animationDelay: `${c.delay}s`
              }}
            />
          ))}
        </div>
      )}

      {layout.center ? (
        <div className="tour-center-wrap">
          <div className="tour-frame" role="dialog" aria-modal="true" aria-label="Interactive guide">
            {cardContent}
          </div>
        </div>
      ) : (
        <div
          className="tour-frame"
          role="dialog"
          aria-modal="true"
          aria-label="Interactive guide"
          style={{ top: `${layout.top}px`, left: `${layout.left}px`, width: layout.cardW }}
        >
          {layout.arrow && <div className="tour-arrow" style={{ ...layout.arrow }} />}
          {cardContent}
        </div>
      )}
    </>
  )
}