import React from 'react'
import { TERMS_SECTIONS, TERMS_VERSION, TERMS_EFFECTIVE } from '../content/terms.js'

// Renders the full Terms of Use text from content/terms.js. Shared by the public /terms page and the
// accept-terms screen, so both always show exactly the same wording.
function TermsContent() {
  return (
    <div style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.65, textAlign: 'left' }}>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Version {TERMS_VERSION} · Effective {TERMS_EFFECTIVE}
      </p>
      {TERMS_SECTIONS.map((s) => (
        <section
          key={s.id}
          id={`terms-${s.id}`}
          style={s.highlight ? {
            border: '1px solid var(--accent)',
            background: 'var(--input-bg)',
            borderRadius: '12px',
            padding: '12px 16px',
            margin: '16px 0'
          } : { margin: '16px 0' }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 6px' }}>{s.title}</h3>
          {(s.paragraphs || []).map((p, i) => <p key={i} style={{ margin: '0 0 8px' }}>{p}</p>)}
          {s.bullets && (
            <ul style={{ margin: '0 0 8px', paddingLeft: '20px', listStyleType: 'disc' }}>
              {s.bullets.map((b, i) => <li key={i} style={{ marginBottom: '4px' }}>{b}</li>)}
            </ul>
          )}
          {(s.after || []).map((p, i) => <p key={i} style={{ margin: '0 0 8px' }}>{p}</p>)}
        </section>
      ))}
    </div>
  )
}

export default TermsContent
