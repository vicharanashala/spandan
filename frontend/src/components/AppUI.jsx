import React, { useState, useRef } from 'react'
import useNow from '../hooks/useNow'
import HelpButton from './HelpButton'
import ThemeToggle from './ThemeToggle'
import ProfileDropdown from './ProfileDropdown'
import { Check, Copy, School } from 'lucide-react'
import { renderIcon } from './icons'

// Page-level building blocks shared by every page (dashboards, lists, forms), in the same visual
// language as the results page (components/InsightUI.jsx): the blue header gradient, soft cards,
// tinted icon chips. Colours come from the theme tokens in index.css, so light and dark both work.

const tintBg = (tint, pct) => `color-mix(in srgb, ${tint} ${pct}%, transparent)`
// A fixed tone used as TEXT: unchanged in light mode, lifted toward white in dark mode (--tone-lift)
export const toneText = (tone) => `color-mix(in srgb, ${tone}, white var(--tone-lift))`

// Faint accent wash behind page content (same as the results page).
export const pageWash = 'radial-gradient(900px 360px at 0% 0%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 70%), radial-gradient(700px 300px at 100% 0%, color-mix(in srgb, #8b5cf6 6%, transparent), transparent 70%)'

// Morning / afternoon / evening greeting for dashboard headers.
export const greeting = (d = new Date()) => {
  const h = d.getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
// Dashboard eyebrow date: "Saturday, 17 October" (viewer's locale). The time next to it is <LiveClock />.
export const dateLabel = (d = new Date()) => d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

// One digit of the live clock: when it changes, the old digit rolls up and out while the new one
// rolls in from below (.roll-in / .roll-out in index.css; no motion under prefers-reduced-motion).
function RollDigit({ ch }) {
  const last = useRef(ch), prev = useRef(null)
  if (last.current !== ch) { prev.current = last.current; last.current = ch }
  return (
    <span className="roll-slot">
      <span key={ch} style={{ display: 'inline-block' }} className={prev.current === null ? undefined : 'roll-in'}>{ch}</span>
      {prev.current !== null && <span key={`${prev.current}>${ch}`} className="roll-out" aria-hidden="true">{prev.current}</span>}
    </span>
  )
}

// Live hh:mm:ss clock (12-hour, viewer's locale). Ticks every second on its own, so the page around it
// does not re-render.
export function LiveClock() {
  const now = useNow(1000)
  const text = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
  return (
    <time dateTime={now.toISOString()} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {[...text].map((c, i) => (/\d/.test(c) ? <RollDigit key={i} ch={c} /> : <span key={i}>{c}</span>))}
    </time>
  )
}

// The blue page header: title (+ optional icon chip and eyebrow) on the left, help / theme / profile
// on the right. Two soft light circles give it depth without changing the brand colour.
export function PageHeader({ icon, eyebrow, title, subtitle, isMobile, children }) {
  return (
    // No overflow:hidden on the header itself — the profile / help menus drop out of it. The
    // decorative circles are clipped by their own layer; zIndex keeps the menus above the content.
    <header style={{
      position: 'relative', zIndex: 30, background: 'var(--header-bg)', color: 'white',
      padding: isMobile ? '14px 16px 22px' : '26px 32px 28px', boxSizing: 'border-box'
    }}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <span style={{ position: 'absolute', width: 340, height: 340, right: -90, top: -170, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.16), rgba(255,255,255,0) 70%)' }} />
        <span style={{ position: 'absolute', width: 260, height: 260, right: 220, bottom: -190, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.10), rgba(255,255,255,0) 70%)' }} />
      </span>
      <div style={{ position: 'relative', display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? '14px' : '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 16, flex: 1, minWidth: 0 }}>
          {icon && !isMobile && (
            <span aria-hidden="true" style={{
              width: 52, height: 52, flexShrink: 0, borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
              background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.28)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)'
            }}>{renderIcon(icon, 26)}</span>
          )}
          <div style={{ minWidth: 0 }}>
            {eyebrow && <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.8, marginBottom: 4 }}>{eyebrow}</div>}
            <h1 style={{ margin: 0, fontSize: isMobile ? '21px' : '26px', fontWeight: 750, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{title}</h1>
            {subtitle && <p style={{ margin: '6px 0 0', opacity: 0.88, fontSize: '14px' }}>{subtitle}</p>}
          </div>
        </div>
        {/* phones: the actions get their own row at the top (next to the menu button), the title below */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, justifyContent: 'flex-end' }}>
          {children}
          <HelpButton />
          <ThemeToggle />
          <ProfileDropdown />
        </div>
      </div>
    </header>
  )
}

// Inputs and buttons
export const inputStyle = (extra = {}) => ({
  width: '100%', minWidth: 0, padding: '12px 14px', border: '1px solid var(--border-color)', borderRadius: '12px',
  fontSize: '14px', outline: 'none', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box',
  transition: 'border-color .15s ease, box-shadow .15s ease', ...extra
})
export const primaryButton = (disabled, extra = {}) => ({
  padding: '12px 20px', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 650, whiteSpace: 'nowrap',
  color: disabled ? 'var(--text-secondary)' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer',
  background: disabled ? 'color-mix(in srgb, var(--text-secondary) 18%, var(--bg-card))' : 'var(--accent-gradient)',
  boxShadow: disabled ? 'none' : '0 6px 16px color-mix(in srgb, var(--accent) 32%, transparent)', ...extra
})
export const ghostButton = (extra = {}) => ({
  padding: '10px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', ...extra
})

// A selectable option card (e.g. room mode). Behaves as a radio button for assistive tech.
export function ChoiceCard({ icon, title, description, active, onClick, tint = 'var(--accent)' }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick} className="app-choice" style={{
      flex: 1, minWidth: 170, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '12px 14px', cursor: 'pointer',
      borderRadius: 14, color: 'var(--text-primary)',
      border: active ? `2px solid ${tint}` : '1px solid var(--border-color)',
      background: active ? tintBg(tint, 9) : 'var(--input-bg)',
      boxShadow: active ? `0 4px 14px ${tintBg(tint, 18)}` : 'none'
    }}>
      <span aria-hidden="true" style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: toneText(tint), background: `linear-gradient(135deg, ${tintBg(tint, 10)}, ${tintBg(tint, 26)})` }}>{renderIcon(icon, 18)}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 650 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{description}</span>
      </span>
    </button>
  )
}

// Room code chip with a copy button.
export function CodeChip({ code }) {
  const [copied, setCopied] = useState(false)
  const copy = (e) => {
    e.stopPropagation()
    try { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400) } catch (err) { /* ignore */ }
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px', borderRadius: 10, background: tintBg('var(--accent)', 9), border: `1px solid ${tintBg('var(--accent)', 22)}` }}>
      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--accent)', fontSize: 13 }}>{code}</span>
      <button type="button" onClick={copy} aria-label={`Copy room code ${code}`} title="Copy code" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, padding: '2px 4px', display: 'inline-flex', color: 'var(--text-secondary)' }}>{copied ? <Check size={13} strokeWidth={2.5} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}</button>
    </span>
  )
}

// Small status pill (Live, Video, Ended …).
export function Pill({ children, tone = 'var(--accent)', dot }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: toneText(tone), background: tintBg(tone, 12), border: `1px solid ${tintBg(tone, 26)}`, whiteSpace: 'nowrap' }}>
      {dot && <span aria-hidden="true" className="app-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: tone }} />}
      {children}
    </span>
  )
}

// A room card: icon + name + status, code chip, meta line, primary action.
// extraActions: more buttons next to the primary one (e.g. delete).
export function RoomCard({ icon = School, title, code, status, meta = [], actionLabel, onAction, onOpen, tint = 'var(--accent)', tourAction, extraActions }) {
  return (
    <div className="app-card app-card--hover" onClick={onOpen} style={{
      display: 'flex', flexDirection: 'column', gap: 12, padding: 18, minWidth: 0, boxSizing: 'border-box', cursor: onOpen ? 'pointer' : 'default',
      background: 'var(--bg-card)', borderRadius: 18, border: '1px solid var(--border-color)',
      boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 6px 18px rgba(16,24,40,0.06)', position: 'relative', overflow: 'hidden'
    }}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: '0 0 auto 0', height: 3, background: `linear-gradient(90deg, ${tint}, ${tintBg(tint, 35)})` }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span aria-hidden="true" style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, color: toneText(tint), background: `linear-gradient(135deg, ${tintBg(tint, 10)}, ${tintBg(tint, 26)})`, border: `1px solid ${tintBg(tint, 22)}` }}>{renderIcon(icon, 20)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={title}>{title}</h3>
          {status && <div style={{ marginTop: 6 }}>{status}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {code && <CodeChip code={code} />}
        {meta.filter(Boolean).map((m, i) => <span key={i} style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{m}</span>)}
      </div>
      {(actionLabel || extraActions) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
          {actionLabel && (
            <button type="button" data-tour={tourAction} onClick={(e) => { e.stopPropagation(); onAction?.() }} style={primaryButton(false, { flex: 1, minWidth: 0, padding: '10px 16px', fontSize: 13.5 })}>
              {actionLabel}
            </button>
          )}
          {extraActions}
        </div>
      )}
    </div>
  )
}

// Empty state for lists.
export function EmptyState({ icon, title, description, children }) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 24px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)', borderRadius: 18 }}>
      <div aria-hidden="true" style={{ width: 64, height: 64, margin: '0 auto 14px', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, color: 'var(--accent)', background: `linear-gradient(135deg, ${tintBg('var(--accent)', 8)}, ${tintBg('var(--accent)', 20)})` }}>{renderIcon(icon, 30, { strokeWidth: 1.75 })}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
      {description && <p style={{ margin: '6px auto 0', maxWidth: 420, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{description}</p>}
      {children && <div style={{ marginTop: 16 }}>{children}</div>}
    </div>
  )
}

// Small square icon button (e.g. delete) for card action rows.
export const iconButton = (tone = '#ef4444') => ({
  width: 42, flexShrink: 0, borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 0,
  border: `1px solid ${tintBg(tone, 30)}`, background: tintBg(tone, 10), color: toneText(tone)
})
