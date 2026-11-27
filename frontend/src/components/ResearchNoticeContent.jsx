import React from 'react'
import { RESEARCH_NOTICE_SECTIONS } from '../content/research.js'

// Body of the research notice, shared by the one-time notice dialog and the /research page.
function ResearchNoticeContent() {
  return (
    <div style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.6 }}>
      {RESEARCH_NOTICE_SECTIONS.map((s) => (
        <section key={s.id} id={`research-${s.id}`} style={{ margin: '12px 0' }}>
          {s.title && <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px' }}>{s.title}</h3>}
          {s.paragraphs.map((p, i) => <p key={i} style={{ margin: '0 0 6px', color: 'var(--text-secondary)' }}>{p}</p>)}
        </section>
      ))}
    </div>
  )
}

export default ResearchNoticeContent
