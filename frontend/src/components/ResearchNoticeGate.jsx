import React from 'react'
import { useLocation } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import { hasSeenTour, markTourSeen } from '../stores/tourStore'
import ResearchNoticeContent from './ResearchNoticeContent'
import useResearchOptOutStore from '../stores/researchOptOutStore'
import { RESEARCH_NOTICE_ID, RESEARCH_NOTICE_TITLE } from '../content/research.js'

// One-time research notice (IEC Form, Annexure B.1): shown once to every signed-in account after it has
// accepted the current Terms, then remembered on the user record (tourSeen) like the guided tours.
// Not blocking: closing it changes nothing; the opt-out is the sidebar button above the profile card.
function ResearchNoticeGate() {
  const { pathname } = useLocation()
  const openOptOut = useResearchOptOutStore((s) => s.open)
  const { token, isAuthenticated, user, termsRequired } = useAuthStore()

  // Never over a live session (student answering polls, teacher console): it waits for the next page.
  const live = pathname.startsWith('/student/session/') || /^\/teacher\/room\/[^/]+$/.test(pathname)
  const show = token && isAuthenticated && user?.role && user.termsAccepted === true && !termsRequired &&
    !hasSeenTour(user, RESEARCH_NOTICE_ID) && !live && pathname !== '/terms'
  if (!show) return null

  const close = () => { markTourSeen(RESEARCH_NOTICE_ID) }
  const optOut = () => { markTourSeen(RESEARCH_NOTICE_ID); openOptOut() }

  const button = (primary) => ({
    flex: 1,
    padding: '12px',
    fontSize: '15px',
    fontWeight: 600,
    background: primary ? 'var(--accent-gradient)' : 'transparent',
    color: primary ? '#fff' : 'var(--text-secondary)',
    border: primary ? 'none' : '1px solid var(--border-color)',
    borderRadius: '12px',
    cursor: 'pointer'
  })

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="research-notice-title" style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0, 0, 0, 0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)',
        width: '100%', maxWidth: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)'
      }}>
        <div style={{ padding: '20px 24px 8px' }}>
          <h2 id="research-notice-title" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {RESEARCH_NOTICE_TITLE}
          </h2>
        </div>
        <div style={{ overflowY: 'auto', padding: '0 24px', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
          <ResearchNoticeContent />
        </div>
        <div style={{ display: 'flex', gap: '12px', padding: '16px 24px 20px' }}>
          <button type="button" onClick={optOut} style={button(false)}>Research opt-out</button>
          <button type="button" onClick={close} style={button(true)}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default ResearchNoticeGate
