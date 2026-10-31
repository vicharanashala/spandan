import React, { useEffect, useLayoutEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import useTourStore, { hasSeenTour } from '../stores/tourStore'
import useAuthStore from '../stores/authStore'
import { tourSteps, tourForPath } from '../content/tours'

const PAD = 8
const CARD_W = 340
const CARD_H_EST = 190
const RETRIES = 20         // a target may not be rendered yet (page still loading data): poll ~5 s before skipping
const RETRY_MS = 250
const AUTO_START_MS = 800  // let the page settle before the first-visit tour starts

// In-house guided tour: a dark overlay with a cut-out around the current step's element
// (data-tour="<target>"), plus a card with Back / Next / Skip. Mounted once in App.jsx; driven by
// tourStore. Steps whose target is absent (e.g. a mode-specific button) are skipped in the direction
// of travel. Esc skips the whole tour. Everything underneath is click-blocked while a tour runs.
// It also AUTO-STARTS the page's tour the first time a signed-in user opens that page (per user
// record + per-browser memo), and ends a running tour if the user navigates away.
export default function Tour() {
  const { active, step, next, back, stop, direction, start } = useTourStore()
  const { user, isAuthenticated } = useAuthStore()
  const { pathname } = useLocation()
  const steps = active ? tourSteps(active) : null
  const current = steps ? steps[step] : null
  const [rect, setRect] = useState(null)

  // First visit of a page → run its tour once. Navigating away mid-tour ends it (and marks it seen).
  useEffect(() => {
    if (active) { stop('skipped'); return }
    if (!isAuthenticated || !user?.role) return
    const id = tourForPath(pathname, user.role)
    if (!id || hasSeenTour(user, id)) return
    const t = setTimeout(() => { if (!useTourStore.getState().active) start(id) }, AUTO_START_MS)
    return () => clearTimeout(t)
  }, [pathname, user?._id, isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!current) { setRect(null); return }
    let tries = 0, cancelled = false, el = null
    const timers = []
    const measure = () => { if (el && !cancelled) setRect(el.getBoundingClientRect()) }
    // A target that is in the DOM but not visible (zero size, or slid off-screen like the mobile
    // sidebar drawer) counts as missing — vertical scroll is handled by scrollIntoView, so only width,
    // height and the horizontal position are checked.
    const isVisible = (node) => {
      const r = node.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth
    }
    const locate = () => {
      if (cancelled) return
      el = document.querySelector(`[data-tour="${current.target}"]`)
      if (el && !isVisible(el)) el = null
      if (!el) {
        if (tries++ < RETRIES) { timers.push(setTimeout(locate, RETRY_MS)); return }
        // Not on this page: move on without the user noticing.
        if (direction < 0 && step > 0) back()
        else if (step < steps.length - 1) next()
        else stop('finished')
        return
      }
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch (e) { /* jsdom */ }
      measure()
      timers.push(setTimeout(measure, 350))
      window.addEventListener('resize', measure)
      window.addEventListener('scroll', measure, true)
    }
    locate()
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [active, step]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!active) return
    const onKey = (e) => { if (e.key === 'Escape') stop('skipped') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, stop])

  if (!current || !rect) return null

  const vw = window.innerWidth, vh = window.innerHeight
  const below = rect.bottom + PAD + CARD_H_EST < vh
  const top = below ? rect.bottom + PAD + 12 : Math.max(12, rect.top - PAD - CARD_H_EST - 12)
  const left = Math.min(Math.max(12, rect.left), Math.max(12, vw - CARD_W - 12))
  const isLast = step === steps.length - 1

  return (
    <>
      {/* click shield */}
      <div onClick={() => {}} style={{ position: 'fixed', inset: 0, zIndex: 9990 }} />
      {/* spotlight: the box-shadow darkens everything except the cut-out */}
      <div aria-hidden="true" style={{
        position: 'fixed', zIndex: 9991, pointerEvents: 'none',
        top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
        borderRadius: '10px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 3px var(--accent)',
        transition: 'top .2s, left .2s, width .2s, height .2s'
      }} />
      <div role="dialog" aria-label={`Tour step ${step + 1} of ${steps.length}: ${current.title}`} style={{
        position: 'fixed', zIndex: 9992, top, left, width: `min(${CARD_W}px, calc(100vw - 24px))`,
        background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)',
        borderRadius: '12px', boxShadow: '0 12px 32px rgba(0,0,0,0.3)', padding: '16px 18px', boxSizing: 'border-box'
      }}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Step {step + 1} of {steps.length}</div>
        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>{current.title}</div>
        <div style={{ fontSize: '14px', lineHeight: 1.5, marginBottom: '14px' }}>{current.body}</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => stop('skipped')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', padding: '6px 4px' }}>Skip tour</button>
          <span style={{ flex: 1 }} />
          {step > 0 && (
            <button onClick={back} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px' }}>Back</button>
          )}
          <button onClick={next} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: 'var(--accent-solid)', color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>{isLast ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </>
  )
}
