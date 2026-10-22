import React, { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { renderIcon } from './icons'

// Shared building blocks for the results page (RoomInsights / StudentInsights): stat tiles with a
// tinted icon (same visual language as the dashboard cards), section headers with an icon chip, and
// the small section labels that group the page. Styling hooks live in index.css (.insight-*).

const tintBg = (tint, pct) => `color-mix(in srgb, ${tint} ${pct}%, transparent)`
// Gradient icon chip (lighter top-left → stronger bottom-right) in the tile's colour.
const chipBg = (tint) => `linear-gradient(135deg, ${tintBg(tint, 10)}, ${tintBg(tint, 26)})`
// The icon in a chip: the tint, lifted toward white in dark mode (--tone-lift).
const chipInk = (tint) => `color-mix(in srgb, ${tint}, white var(--tone-lift))`

// Card surface shared by every results-page card: large radius, soft layered shadow.
export const cardStyle = (isMobile) => ({
  background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '20px',
  boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.06)',
  padding: isMobile ? '18px' : '24px', maxWidth: '100%', boxSizing: 'border-box', marginBottom: '24px', position: 'relative'
})

// One stat tile. tone = colour for the value (e.g. a correct-rate band); defaults to the text colour.
// progress (0–100, optional) draws a slim bar under the value, in progressColor (default: the tint).
export function StatTile({ icon, label, value, sub, tint = 'var(--accent)', tone, progress, progressColor, isMobile }) {
  const pct = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : null
  return (
    <div className="insight-tile" style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '18px',
      boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 6px 18px rgba(16,24,40,0.06)', padding: isMobile ? '14px' : '16px 18px', minWidth: 0,
      display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative', overflow: 'hidden'
    }}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: '0 0 auto 0', height: 3, background: `linear-gradient(90deg, ${tint}, ${tintBg(tint, 35)})` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <span aria-hidden="true" style={{
          width: isMobile ? 32 : 36, height: isMobile ? 32 : 36, flexShrink: 0, borderRadius: '11px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 16 : 18,
          color: chipInk(tint), background: chipBg(tint), border: `1px solid ${tintBg(tint, 22)}`
        }}>{renderIcon(icon, isMobile ? 16 : 18)}</span>
        <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1.25 }}>{label}</span>
      </div>
      <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, color: tone ? `color-mix(in srgb, ${tone}, white var(--tone-lift))` : 'var(--text-primary)', overflowWrap: 'anywhere' }}>{value}</div>
      {pct !== null && (
        <div role="presentation" style={{ height: 6, borderRadius: 999, background: tintBg('var(--text-secondary)', 14), overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: progressColor || tint }} />
        </div>
      )}
      {sub && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.35 }}>{sub}</div>}
    </div>
  )
}

// The tile row. Its direct children are the tiles (tests and the page tour rely on that).
// cols = columns on a normal screen, chosen so the tile count fills whole rows (no lone tile on a
// second line); phones always get 2. Narrower desktop windows drop to 2 via .insight-tiles in index.css.
export function TileGrid({ children, isMobile, cols = 4, tour = 'results-stats' }) {
  return (
    <div data-tour={tour} className="insight-tiles" style={{ display: 'grid', '--tile-cols': isMobile ? 2 : cols, gap: isMobile ? '12px' : '16px', marginBottom: '28px' }}>
      {children}
    </div>
  )
}

// Card header: icon chip + title (+ optional right-side actions) and the explanatory hint below.
export function SectionHeader({ icon, title, hint, tint = 'var(--accent)', actions }) {
  return (
    <div style={{ marginBottom: hint ? 14 : 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {icon && <span aria-hidden="true" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: chipInk(tint), background: chipBg(tint), border: `1px solid ${tintBg(tint, 22)}` }}>{renderIcon(icon, 16)}</span>}
        <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)', flex: 1, minWidth: 0 }}>{title}</h2>
        {actions}
      </div>
      {hint && <p style={{ margin: '8px 0 0', fontSize: '13px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{hint}</p>}
    </div>
  )
}

// Small label that groups the page into parts ("Overview", "Engagement", …), with optional actions.
export function SectionLabel({ children, actions, id }) {
  return (
    <div id={id} style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '6px 0 14px', flexWrap: 'wrap', scrollMarginTop: 72 }}>
      <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{children}</span>
      <span aria-hidden="true" style={{ flex: 1, minWidth: 24, height: 1, background: 'var(--border-color)' }} />
      {actions}
    </div>
  )
}

// ---------- Hero summary: the session in one glance (ring + a few auto highlights) ----------
function Ring({ value, label, color, size = 104 }) {
  const r = (size - 12) / 2, c = 2 * Math.PI * r
  const pct = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }} role="img" aria-label={`${label}: ${Number.isFinite(value) ? value + '%' : 'no data'}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tintBg('var(--text-secondary)', 16)} strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <span style={{ fontSize: size > 90 ? 24 : 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>{Number.isFinite(value) ? `${value}%` : '—'}</span>
        <span style={{ fontSize: size > 100 ? 10.5 : 9.5, fontWeight: 600, color: 'var(--text-secondary)', maxWidth: size - 26, lineHeight: 1.15 }}>{label}</span>
      </div>
    </div>
  )
}

function Highlights({ items, isMobile }) {
  if (!items.length) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(3, items.length)}, minmax(0, 1fr))`, gap: 10, marginTop: 14 }}>
      {items.map((h, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, background: 'color-mix(in srgb, var(--bg-card) 72%, transparent)', border: '1px solid var(--border-color)', minWidth: 0 }}>
          <span aria-hidden="true" style={{ fontSize: 18, display: 'inline-flex', flexShrink: 0, color: 'var(--accent)' }}>{renderIcon(h.icon, 18)}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>{h.label}</span>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.value}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

// title, meta = short facts ("12 Oct 2026", "58 min"), ring = { value, label, color }, highlights = [{ icon, label, value }]
export function HeroSummary({ title, meta = [], ring, highlights = [], isMobile }) {
  return (
    <section aria-label={title} style={{
      borderRadius: '22px', padding: isMobile ? '18px' : '24px 28px', marginBottom: '20px', position: 'relative', overflow: 'hidden',
      border: '1px solid color-mix(in srgb, var(--accent) 22%, var(--border-color))',
      background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--bg-card)) 0%, color-mix(in srgb, #8b5cf6 9%, var(--bg-card)) 60%, color-mix(in srgb, #14b8a6 8%, var(--bg-card)) 100%)',
      boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 10px 30px rgba(16,24,40,0.07)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '14px' : '28px' }}>
        {ring && <Ring {...ring} size={isMobile ? 88 : 112} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 18 : 21, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>{title}</div>
          {meta.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
              {meta.map((m, i) => <span key={i}>{m}</span>)}
            </div>
          )}
          {!isMobile && <Highlights items={highlights} isMobile={false} />}
        </div>
      </div>
      {isMobile && <Highlights items={highlights} isMobile />}
    </section>
  )
}

// ---------- Sticky section pills: jump to a part of the page; the part in view is highlighted ----------
export function SectionNav({ sections, isMobile }) {
  const [active, setActive] = useState(sections[0]?.id)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean)
    const io = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (seen[0]) setActive(seen[0].target.id)
    }, { rootMargin: '-80px 0px -60% 0px' })
    els.forEach((el) => io.observe(el))
    // Back at the top of the page (above every section): highlight the first pill again.
    const onScroll = () => { if (els[0] && els[0].getBoundingClientRect().top > window.innerHeight * 0.4) setActive(sections[0].id) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { io.disconnect(); window.removeEventListener('scroll', onScroll) }
  }, [sections.map((s) => s.id).join('|')])
  const go = (id) => {
    const el = document.getElementById(id)
    if (!el) return
    setActive(id)
    el.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }
  return (
    <nav aria-label="Results sections" className="thin-scroll" style={{
      position: 'sticky', top: 0, zIndex: 20, display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 0', margin: '0 0 12px',
      background: 'color-mix(in srgb, var(--bg-primary) 88%, transparent)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)'
    }}>
      {sections.map((s) => {
        const on = s.id === active
        return (
          <button key={s.id} type="button" onClick={() => go(s.id)} aria-current={on ? 'true' : undefined} style={{
            flexShrink: 0, padding: isMobile ? '6px 12px' : '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: on ? 700 : 600,
            border: `1px solid ${on ? 'transparent' : 'var(--border-color)'}`,
            background: on ? 'var(--accent-gradient, var(--accent))' : 'var(--bg-card)', color: on ? '#fff' : 'var(--text-secondary)',
            boxShadow: on ? '0 4px 12px color-mix(in srgb, var(--accent) 30%, transparent)' : 'none'
          }}>{s.label}</button>
        )
      })}
    </nav>
  )
}

// ---------- Question-wise tables: the clickable question number, and the question shown on expand ----------
export function QPill({ n, open, compact }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, padding: compact ? '3px 7px' : '3px 10px', borderRadius: 999, fontWeight: 700, fontSize: compact ? 12 : 12.5, whiteSpace: 'nowrap',
      color: open ? '#fff' : 'var(--accent)', background: open ? 'var(--accent)' : tintBg('var(--accent)', 10),
      border: `1px solid ${open ? 'transparent' : tintBg('var(--accent)', 30)}`
    }}>
      {open ? <ChevronDown size={12} strokeWidth={2.5} aria-hidden="true" /> : <ChevronRight size={12} strokeWidth={2.5} aria-hidden="true" />}Q{n}
    </span>
  )
}

export function QuestionBox({ n, type, text, children }) {
  return (
    <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderLeft: '4px solid var(--accent)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Q{n}{type ? ` · ${type}` : ''}</div>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.45, color: 'var(--text-primary)' }}>{text}</div>
      {children}
    </div>
  )
}
