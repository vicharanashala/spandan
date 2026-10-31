import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import useHelpStore from '../stores/helpStore'
import useAuthStore from '../stores/authStore'
import useTourStore from '../stores/tourStore'
import useIsMobile from '../hooks/useIsMobile'
import { Compass, X } from 'lucide-react'
import { renderIcon, Ico } from './icons'
import { sectionsForRole, sectionForPath, searchSections } from '../content/help'
import { tourForPath } from '../content/tours'

const isTyping = (el) => {
  const tag = (el?.tagName || '').toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable
}

// Centered help popup (two panes: section list left, content right; stacked on phones). Mounted once
// in App.jsx; opened by the ⓘ HelpButton or the ? key. Opens on the section matching the current
// page, with search and "Take this page's tour" when the page has one (teachers and students).
// Signed out (the landing page) it shows the guest guide: what Spandan is, register, sign in.
export default function HelpModal() {
  const { isOpen, sectionId, open, close } = useHelpStore()
  const { user, isAuthenticated } = useAuthStore()
  const startTour = useTourStore(s => s.start)
  const { pathname } = useLocation()
  const isMobile = useIsMobile()
  const role = isAuthenticated && user?.role ? user.role : 'guest'   // signed out (landing page) → guest guide
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)

  // On open: reset search and select the requested section, else the one for this page.
  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setSelected(sectionId || sectionForPath(pathname, role, user)?.id || null)
  }, [isOpen, sectionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: Esc closes, ? opens (never while typing in a field).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && isOpen) { close(); return }
      if (e.key === '?' && !isOpen && !isTyping(e.target)) { e.preventDefault(); open() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, isAuthenticated, open, close])

  if (!isOpen) return null

  const all = sectionsForRole(role, user)
  const list = searchSections(all, query)
  const current = all.find(s => s.id === selected) || list[0] || null
  const tourId = isAuthenticated ? tourForPath(pathname, role) : null
  const takeTour = () => { close(); if (tourId) startTour(tourId) }

  const navBtn = (s) => {
    const active = current?.id === s.id
    return (
      <button
        key={s.id} onClick={() => setSelected(s.id)} aria-current={active ? 'true' : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px', width: isMobile ? 'auto' : '100%', textAlign: 'left',
          padding: isMobile ? '8px 12px' : '10px 12px', borderRadius: '8px', border: '1px solid ' + (active ? 'var(--accent)' : 'transparent'),
          background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent', color: 'var(--text-primary)',
          fontSize: '14px', fontWeight: active ? 700 : 500, cursor: 'pointer', whiteSpace: isMobile ? 'nowrap' : 'normal', flexShrink: 0
        }}
      >
        <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0, color: active ? 'var(--accent)' : 'var(--text-secondary)' }}>{renderIcon(s.icon, 17)}</span>
        <span>{s.title}</span>
      </button>
    )
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Help" style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '0' : '24px' }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'relative', width: isMobile ? '100%' : 'min(960px, 100%)', height: isMobile ? '100%' : 'min(85vh, 760px)',
        background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)',
        borderRadius: isMobile ? 0 : '16px', boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        {/* header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Help</h2>
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the guide…" aria-label="Search help"
            style={{ flex: 1, minWidth: '160px', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px' }}
          />
          {tourId && (
            <button onClick={takeTour} style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--nav-hover)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <Ico as={Compass} /> Take this page's tour
            </button>
          )}
          <button onClick={close} aria-label="Close help" style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '22px', cursor: 'pointer', padding: '2px 8px', lineHeight: 1, display: 'inline-flex' }}><X size={22} aria-hidden="true" /></button>
        </div>

        {/* body: nav + content */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>
          <nav aria-label="Help sections" style={{
            width: isMobile ? '100%' : '300px', flexShrink: 0, borderRight: isMobile ? 'none' : '1px solid var(--border-color)',
            borderBottom: isMobile ? '1px solid var(--border-color)' : 'none', padding: isMobile ? '8px 12px' : '12px',
            overflowY: isMobile ? 'hidden' : 'auto', overflowX: isMobile ? 'auto' : 'hidden',
            display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '4px'
          }}>
            {list.length === 0
              ? <p style={{ color: 'var(--text-secondary)', padding: '8px', margin: 0, fontSize: '14px' }}>Nothing matches "{query}".</p>
              : list.map(navBtn)}
          </nav>
          <article style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: isMobile ? '16px' : '20px 28px' }}>
            {current && (
              <>
                <h3 style={{ margin: '0 0 14px', fontSize: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span aria-hidden="true" style={{ display: 'inline-flex', color: 'var(--accent)' }}>{renderIcon(current.icon, 22)}</span>{current.title}
                </h3>
                {current.ordered
                  ? <ol style={{ margin: 0, paddingLeft: '26px', fontSize: '15px', lineHeight: 1.6 }}>{current.body.map((line, i) => <li key={i} style={{ marginBottom: '10px' }}>{line}</li>)}</ol>
                  : <ul style={{ margin: 0, paddingLeft: '22px', fontSize: '15px', lineHeight: 1.6 }}>{current.body.map((line, i) => <li key={i} style={{ marginBottom: '10px' }}>{line}</li>)}</ul>}
              </>
            )}
          </article>
        </div>
      </div>
    </div>
  )
}
