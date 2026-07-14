import React, { useState, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const deepUnique = (arr, fields) => {
  if (!arr || !Array.isArray(arr)) return []
  const seen = new Set()
  return arr.filter(item => {
    const key = fields.map(f => (item[f] || '').toLowerCase().trim()).join('::')
    if (seen.has(key) || !key.replace(/::/g, '')) return false
    seen.add(key)
    return true
  })
}

const sectionIcons = {
  definitions: '📖',
  keyConcepts: '🎯',
  importantFormulae: '📐',
  examples: '💡',
  commonMistakes: '⚠️',
  frequentlyConfused: '🔀',
  memoryTips: '🧠',
  examTips: '📝',
  quickReferenceTable: '📊',
  practiceQuestions: '✏️',
  vivaQuestions: '🗣️',
  mcqs: '✅',
  summary: '📋'
}

const tabOrder = [
  { id: 'definitions', label: 'Definitions' },
  { id: 'keyConcepts', label: 'Key Concepts' },
  { id: 'importantFormulae', label: 'Formulae' },
  { id: 'examples', label: 'Examples' },
  { id: 'commonMistakes', label: 'Mistakes' },
  { id: 'frequentlyConfused', label: 'Confused' },
  { id: 'memoryTips', label: 'Memory Tips' },
  { id: 'examTips', label: 'Exam Tips' },
  { id: 'quickReferenceTable', label: 'Ref Table' },
  { id: 'practiceQuestions', label: 'Practice' },
  { id: 'vivaQuestions', label: 'Viva' },
  { id: 'mcqs', label: 'MCQs' },
  { id: 'summary', label: 'Summary' }
]

function processSheet(sheet) {
  if (!sheet) return sheet
  const s = { ...sheet }
  s.definitions = deepUnique(s.definitions, ['term', 'definition'])
  s.keyConcepts = deepUnique(s.keyConcepts, ['concept', 'definition'])
  s.importantFormulae = deepUnique(s.importantFormulae, ['formula', 'description'])
  s.examples = deepUnique(s.examples, ['title', 'content'])
  s.commonMistakes = deepUnique(s.commonMistakes, ['mistake', 'correction'])
  s.frequentlyConfused = deepUnique(s.frequentlyConfused, ['concept1', 'concept2'])
  s.memoryTips = deepUnique(s.memoryTips, ['tip', 'topic'])
  s.examTips = deepUnique(s.examTips, ['tip'])
  s.quickReferenceTable = deepUnique(s.quickReferenceTable, ['category', 'details'])
  s.practiceQuestions = deepUnique(s.practiceQuestions, ['question', 'answer'])
  s.vivaQuestions = deepUnique(s.vivaQuestions, ['question', 'answer'])
  s.mcqs = deepUnique(s.mcqs, ['question'])
  return s
}

function formatBullet(text) {
  const lines = text.split('\n').filter(Boolean)
  if (lines.length <= 1) return text
  return lines.map(l => l.replace(/^[-•*]\s*/, '')).join('\n')
}

function TabBar({ tabs, activeTab, onTabChange }) {
  const [indicatorStyle, setIndicatorStyle] = useState({})
  const tabRefs = useRef({})

  const updateIndicator = (id) => {
    const el = tabRefs.current[id]
    if (el) {
      const parent = el.parentElement
      setIndicatorStyle({
        left: el.offsetLeft,
        width: el.offsetWidth
      })
    }
  }

  React.useEffect(() => {
    if (activeTab) updateIndicator(activeTab)
  }, [activeTab])

  return (
    <div style={{
      position: 'relative', display: 'flex', gap: '2px',
      overflow: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none',
      padding: '4px 0'
    }}>
      <motion.div
        layout
        style={{
          position: 'absolute', bottom: 0, height: '3px',
          background: '#3b82f6', borderRadius: '2px',
          left: indicatorStyle.left || 0,
          width: indicatorStyle.width || 0,
          transition: 'left 0.3s ease, width 0.3s ease'
        }}
      />
      {tabs.map(tab => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            ref={el => tabRefs.current[tab.id] = el}
            onClick={() => onTabChange(tab.id)}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: '8px 8px 0 0',
              background: isActive ? 'rgba(59,130,246,0.08)' : 'transparent',
              color: isActive ? '#3b82f6' : 'var(--text-secondary)',
              fontSize: '13px', fontWeight: isActive ? '600' : '500',
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              transition: 'color 0.2s, background 0.2s',
              position: 'relative'
            }}
          >
            <span style={{ marginRight: '6px' }}>{sectionIcons[tab.id] || '📄'}</span>
            {tab.label}
            <span style={{
              marginLeft: '6px', padding: '1px 6px', borderRadius: '8px',
              fontSize: '11px', background: isActive ? '#3b82f6' : 'var(--bg-secondary)',
              color: isActive ? 'white' : 'var(--text-secondary)'
            }}>
              {tab.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function SectionCard({ icon, title, children, bg }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        background: bg || 'var(--bg-card)',
        borderRadius: '14px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
        marginBottom: '20px'
      }}
    >
      {title && (
        <div style={{
          padding: '16px 20px 0 20px',
          display: 'flex', alignItems: 'center', gap: '10px'
        }}>
          <span style={{ fontSize: '20px' }}>{icon}</span>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)' }}>
            {title}
          </h3>
        </div>
      )}
      <div style={{ padding: '16px 20px 20px 20px' }}>
        {children}
      </div>
    </motion.div>
  )
}

function ContentRenderer({ sheet }) {
  const sections = []

  // Definitions
  if (sheet.definitions?.length > 0) {
    sections.push(
      <SectionCard key="definitions" icon="📖" title="Definitions">
        {sheet.definitions.map((d, i) => (
          <div key={i} style={{
            padding: '12px 0', borderBottom: i < sheet.definitions.length - 1 ? '1px solid var(--border-color)' : 'none'
          }}>
            <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>{d.term}</strong>
            <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.7' }}>
              {d.definition}
            </p>
          </div>
        ))}
      </SectionCard>
    )
  }

  // Key Concepts
  if (sheet.keyConcepts?.length > 0) {
    sections.push(
      <SectionCard key="keyConcepts" icon="🎯" title="Key Concepts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sheet.keyConcepts.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: '#3b82f6', marginTop: '8px', flexShrink: 0
              }} />
              <div>
                {c.concept && (
                  <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{c.concept}</strong>
                )}
                {c.definition && (
                  <p style={{ margin: c.concept ? '2px 0 0' : 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.7' }}>
                    {c.definition}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    )
  }

  // Formulae
  if (sheet.importantFormulae?.length > 0) {
    sections.push(
      <SectionCard key="importantFormulae" icon="📐" title="Formulae & Rules">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sheet.importantFormulae.map((f, i) => (
            <div key={i} style={{
              borderRadius: '10px', overflow: 'hidden',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{
                padding: '14px 18px', fontFamily: "'Courier New', monospace",
                background: '#1e293b', color: '#e2e8f0', fontSize: '15px',
                letterSpacing: '0.3px', lineHeight: '1.6'
              }}>
                {f.formula}
              </div>
              {f.description && (
                <div style={{ padding: '10px 18px', fontSize: '13px', color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
                  {f.description}
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    )
  }

  // Examples
  if (sheet.examples?.length > 0) {
    sections.push(
      <SectionCard key="examples" icon="💡" title="Examples">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sheet.examples.map((ex, i) => (
            <div key={i} style={{
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
              border: '1px solid #bfdbfe',
              padding: '16px 20px'
            }}>
              {ex.title && (
                <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: '700', color: '#1e40af' }}>
                  {ex.title}
                </h4>
              )}
              <p style={{ margin: 0, fontSize: '14px', color: '#1e3a5f', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                {ex.content}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
    )
  }

  // Common Mistakes
  if (sheet.commonMistakes?.length > 0) {
    sections.push(
      <SectionCard key="commonMistakes" icon="⚠️" title="Common Mistakes">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sheet.commonMistakes.map((m, i) => (
            <div key={i} style={{
              borderRadius: '10px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              padding: '16px 20px'
            }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '16px', flexShrink: 0 }}>❌</span>
                <div>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#991b1b', lineHeight: '1.6' }}>
                    {m.mistake}
                  </p>
                  {m.correction && (
                    <div style={{
                      marginTop: '10px', padding: '10px 14px',
                      background: '#f0fdf4', borderRadius: '8px',
                      border: '1px solid #bbf7d0',
                      display: 'flex', gap: '8px', alignItems: 'flex-start'
                    }}>
                      <span style={{ fontSize: '14px', flexShrink: 0 }}>✅</span>
                      <span style={{ fontSize: '13px', color: '#166534', lineHeight: '1.6' }}>
                        {m.correction}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    )
  }

  // Frequently Confused
  if (sheet.frequentlyConfused?.length > 0) {
    sections.push(
      <SectionCard key="frequentlyConfused" icon="🔀" title="Frequently Confused Concepts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sheet.frequentlyConfused.map((fc, i) => (
            <div key={i} style={{
              padding: '14px 18px', borderRadius: '10px',
              background: 'var(--bg-primary)', border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', background: '#fef3c7', color: '#92400e' }}>
                  {fc.concept1}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>↔</span>
                <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', background: '#fef3c7', color: '#92400e' }}>
                  {fc.concept2}
                </span>
              </div>
              {fc.distinction && (
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  {fc.distinction}
                </p>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    )
  }

  // Memory Tips
  if (sheet.memoryTips?.length > 0) {
    sections.push(
      <SectionCard key="memoryTips" icon="🧠" title="Memory Tips & Mnemonics">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sheet.memoryTips.map((t, i) => (
            <div key={i} style={{
              padding: '14px 18px', borderRadius: '10px',
              background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
              display: 'flex', gap: '10px', alignItems: 'flex-start'
            }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>🧠</span>
              <div>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.7' }}>
                  {t.tip}
                </p>
                {t.topic && (
                  <span style={{
                    display: 'inline-block', marginTop: '6px', padding: '2px 8px',
                    borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                    background: '#ede9fe', color: '#5b21b6'
                  }}>
                    {t.topic}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    )
  }

  // Exam Tips
  if (sheet.examTips?.length > 0) {
    sections.push(
      <SectionCard key="examTips" icon="📝" title="Exam Tips">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sheet.examTips.map((t, i) => (
            <div key={i} style={{
              padding: '14px 18px', borderRadius: '10px',
              background: '#eff6ff', border: '1px solid #bfdbfe',
              display: 'flex', gap: '10px', alignItems: 'flex-start'
            }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>💡</span>
              <p style={{ margin: 0, fontSize: '14px', color: '#1e40af', lineHeight: '1.7' }}>
                {t.tip}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
    )
  }

  // Quick Reference Table
  if (sheet.quickReferenceTable?.length > 0) {
    sections.push(
      <SectionCard key="quickReferenceTable" icon="📊" title="Quick Reference">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {sheet.quickReferenceTable.map((qr, i) => (
            <div key={i} style={{
              display: 'flex', gap: '12px',
              padding: '10px 14px', borderRadius: '8px',
              background: i % 2 === 0 ? 'var(--bg-primary)' : 'transparent',
              borderBottom: i < sheet.quickReferenceTable.length - 1 ? '1px solid var(--border-color)' : 'none'
            }}>
              <span style={{
                minWidth: '120px', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)'
              }}>
                {qr.category}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                {qr.details}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>
    )
  }

  // Practice Questions
  if (sheet.practiceQuestions?.length > 0) {
    sections.push(
      <SectionCard key="practiceQuestions" icon="✏️" title="Practice Questions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sheet.practiceQuestions.map((q, i) => (
            <div key={i} style={{
              borderRadius: '10px', border: '1px solid var(--border-color)',
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '16px 20px',
                display: 'flex', gap: '12px', alignItems: 'flex-start'
              }}>
                <span style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: '#3b82f6', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: '700', flexShrink: 0
                }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.7' }}>
                    {q.question}
                  </p>
                  {q.difficulty && (
                    <span style={{
                      padding: '2px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                      background: q.difficulty === 'easy' ? '#dcfce7' : q.difficulty === 'hard' ? '#fee2e2' : '#fef3c7',
                      color: q.difficulty === 'easy' ? '#166534' : q.difficulty === 'hard' ? '#991b1b' : '#92400e'
                    }}>
                      {q.difficulty}
                    </span>
                  )}
                  <details style={{ marginTop: '10px' }}>
                    <summary style={{
                      display: 'inline-block', padding: '6px 14px',
                      borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                      color: '#3b82f6', cursor: 'pointer',
                      background: 'rgba(59,130,246,0.08)',
                      border: 'none', userSelect: 'none'
                    }}>
                      Show Answer
                    </summary>
                    <div style={{
                      marginTop: '10px', padding: '12px 16px', borderRadius: '8px',
                      background: '#f0fdf4', border: '1px solid #bbf7d0',
                      fontSize: '14px', color: '#166534', lineHeight: '1.7'
                    }}>
                      {q.answer}
                    </div>
                  </details>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    )
  }

  // Viva Questions
  if (sheet.vivaQuestions?.length > 0) {
    sections.push(
      <SectionCard key="vivaQuestions" icon="🗣️" title="Viva / Oral Questions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sheet.vivaQuestions.map((q, i) => (
            <div key={i} style={{
              borderRadius: '10px', border: '1px solid var(--border-color)',
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '14px 18px', background: 'var(--bg-primary)',
                display: 'flex', gap: '10px', alignItems: 'flex-start'
              }}>
                <span style={{
                  width: '24px', height: '24px', borderRadius: '50%',
                  background: '#7c3aed', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: '700', flexShrink: 0
                }}>
                  {i + 1}
                </span>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.7' }}>
                  {q.question}
                </p>
              </div>
              <details>
                <summary style={{
                  padding: '8px 18px', fontSize: '12px', fontWeight: '600',
                  color: '#7c3aed', cursor: 'pointer', background: 'rgba(124,58,237,0.06)',
                  borderTop: '1px solid var(--border-color)'
                }}>
                  Show Answer
                </summary>
                <div style={{
                  padding: '12px 18px', fontSize: '14px', color: '#5b21b6',
                  background: '#f5f3ff', lineHeight: '1.7'
                }}>
                  {q.answer}
                </div>
              </details>
            </div>
          ))}
        </div>
      </SectionCard>
    )
  }

  // MCQs
  if (sheet.mcqs?.length > 0) {
    sections.push(
      <SectionCard key="mcqs" icon="✅" title="Self-Test MCQs">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sheet.mcqs.map((q, i) => (
            <div key={i} style={{
              borderRadius: '10px', border: '1px solid var(--border-color)',
              overflow: 'hidden'
            }}>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <span style={{
                    width: '26px', height: '26px', borderRadius: '50%',
                    background: '#059669', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '13px', fontWeight: '700', flexShrink: 0
                  }}>
                    {i + 1}
                  </span>
                  <p style={{ margin: '2px 0 0', fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.7' }}>
                    {q.question}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginLeft: '36px' }}>
                  {(q.options || []).map((opt, oi) => (
                    <div key={oi} style={{
                      padding: '10px 14px', borderRadius: '8px', fontSize: '14px',
                      background: opt.isCorrect ? '#f0fdf4' : 'var(--bg-secondary)',
                      border: `2px solid ${opt.isCorrect ? '#22c55e' : 'var(--border-color)'}`,
                      color: opt.isCorrect ? '#166534' : 'var(--text-primary)',
                      display: 'flex', alignItems: 'center', gap: '10px',
                      fontWeight: opt.isCorrect ? '600' : '400'
                    }}>
                      <span style={{
                        width: '22px', height: '22px', borderRadius: '50%',
                        background: opt.isCorrect ? '#22c55e' : 'var(--border-color)',
                        color: opt.isCorrect ? 'white' : 'var(--text-secondary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: '700', flexShrink: 0
                      }}>
                        {String.fromCharCode(65 + oi)}
                      </span>
                      {opt.text}
                      {opt.isCorrect && <span style={{ marginLeft: 'auto', fontSize: '14px' }}>✓</span>}
                    </div>
                  ))}
                </div>
                {q.explanation && (
                  <div style={{
                    marginTop: '10px', marginLeft: '36px', padding: '10px 14px',
                    borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)',
                    background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                    lineHeight: '1.6'
                  }}>
                    <strong>Explanation:</strong> {q.explanation}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    )
  }

  // Summary
  if (sheet.summary) {
    sections.push(
      <SectionCard key="summary" icon="📋" title="Summary">
        <div style={{
          padding: '20px 24px', borderRadius: '10px',
          background: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
          border: '1px solid #bae6fd',
          fontSize: '15px', color: '#0c4a6e', lineHeight: '1.8'
        }}>
          {sheet.summary}
        </div>
      </SectionCard>
    )
  }

  return <>{sections}</>
}

function RevisionPreview({ sheet, onClose }) {
  const [activeTab, setActiveTab] = useState('')
  const contentRef = useRef(null)
  const [copied, setCopied] = useState(false)

  const processed = useMemo(() => processSheet(sheet), [sheet])

  const tabs = useMemo(() => {
    return tabOrder.filter(t => {
      const data = processed[t.id]
      return data && (Array.isArray(data) ? data.length > 0 : typeof data === 'string' && data.trim())
    })
  }, [processed])

  React.useEffect(() => {
    if (tabs.length > 0 && !activeTab) setActiveTab(tabs[0].id)
  }, [tabs])

  if (!sheet) return null

  const scrollToTop = () => {
    if (contentRef.current) contentRef.current.scrollTop = 0
  }

  const handleTabChange = (id) => {
    setActiveTab(id)
    scrollToTop()
  }

  const handleCopy = async () => {
    let text = `${processed.title || 'Revision Sheet'}\n`
    text += `Generated: ${new Date(processed.createdAt).toLocaleDateString()}\n\n`

    const sections = [
      { label: 'Definitions', data: processed.definitions, fields: ['term', 'definition'], fmt: (d) => `${d.term}: ${d.definition}` },
      { label: 'Key Concepts', data: processed.keyConcepts, fields: ['concept', 'definition'], fmt: (d) => `${d.concept}: ${d.definition}` },
      { label: 'Formulae', data: processed.importantFormulae, fields: ['formula', 'description'], fmt: (d) => `${d.formula} — ${d.description}` },
      { label: 'Examples', data: processed.examples, fields: ['title', 'content'], fmt: (d) => `${d.title}\n${d.content}` },
      { label: 'Common Mistakes', data: processed.commonMistakes, fields: ['mistake', 'correction'], fmt: (d) => `❌ ${d.mistake}\n✅ ${d.correction}` },
      { label: 'Exam Tips', data: processed.examTips, fields: ['tip'], fmt: (d) => `💡 ${d.tip}` },
      { label: 'Practice Questions', data: processed.practiceQuestions, fields: ['question', 'answer'], fmt: (d, i) => `Q${i + 1}: ${d.question}\nAnswer: ${d.answer}` },
      { label: 'Summary', data: processed.summary ? [processed.summary] : [], fields: [], fmt: (d) => d }
    ]

    for (const sec of sections) {
      if (sec.data && sec.data.length > 0) {
        text += `\n${'='.repeat(60)}\n${sec.label}\n${'='.repeat(60)}\n\n`
        sec.data.forEach((item, i) => text += sec.fmt(item, i) + '\n\n')
      }
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { }
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    const content = document.getElementById('revision-content')?.innerHTML || ''

    printWindow.document.write(`
      <html>
      <head>
        <title>${processed.title || 'Revision Sheet'}</title>
        <style>
          @page { margin: 20mm; size: A4; }
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; line-height: 1.6; }
          h1 { font-size: 24px; margin-bottom: 4px; }
          .date { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
          .section { margin-bottom: 24px; page-break-inside: avoid; }
          .section h2 { font-size: 18px; border-bottom: 2px solid #3b82f6; padding-bottom: 6px; margin-bottom: 12px; }
          .card { padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
          .card:last-child { border-bottom: none; }
          .term { font-weight: 700; font-size: 15px; }
          .desc { margin: 4px 0 0; color: #4b5563; }
          .bullet { margin: 6px 0; padding-left: 16px; }
          .formula-block { background: #1e293b; color: #e2e8f0; padding: 12px 16px; border-radius: 6px; font-family: monospace; }
          .mistake { background: #fef2f2; border: 1px solid #fecaca; padding: 12px 16px; border-radius: 8px; margin-bottom: 8px; }
          .exam-tip { background: #eff6ff; border: 1px solid #bfdbfe; padding: 12px 16px; border-radius: 8px; margin-bottom: 8px; }
          .summary { background: #f0f9ff; border: 1px solid #bae6fd; padding: 16px 20px; border-radius: 8px; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <h1>${processed.title || 'Revision Sheet'}</h1>
        <div class="date">Generated ${new Date(processed.createdAt).toLocaleDateString()}</div>
        ${content}
      </body>
      </html>
    `)
    printWindow.document.close()
    setTimeout(() => printWindow.print(), 500)
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 3000, backdropFilter: 'blur(4px)',
      padding: '20px'
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        style={{
          background: 'var(--bg-primary)',
          borderRadius: '20px',
          width: '1120px', maxWidth: '100%',
          height: '90vh', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          border: '1px solid var(--border-color)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          overflow: 'hidden'
        }}
        className="revision-modal"
      >
        {/* ═══ Sticky Header ═══ */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-card)',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '22px' }}>📄</span>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {processed.title || 'AI Revision Sheet'}
                </h2>
              </div>
              <p style={{ margin: '4px 0 0 32px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Generated {new Date(processed.createdAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                {processed.topic && <span> · Topic: {processed.topic}</span>}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, marginLeft: '16px' }}>
              <button onClick={handleCopy}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
              <button onClick={handlePrint}
                style={{
                  padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                🖨️ Print
              </button>
              <button onClick={onClose}
                style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  border: 'none', background: 'transparent',
                  color: 'var(--text-secondary)', fontSize: '18px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.2s',
                  marginLeft: '4px'
                }}
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* ═══ Sticky Tab Navigation ═══ */}
        {tabs.length > 1 && (
          <div style={{
            padding: '0 24px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-card)',
            flexShrink: 0,
            overflow: 'hidden'
          }}>
            <TabBar tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />
          </div>
        )}

        {/* ═══ Scrollable Content Area ═══ */}
        <div ref={contentRef} id="revision-content" style={{
          flex: 1, overflow: 'auto', padding: '24px',
          scrollBehavior: 'smooth',
          overflowX: 'hidden'
        }}>
          {/* Section-based layout: show only the active tab's content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {(() => {
                const data = processed[activeTab]
                if (!data) {
                  return <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px' }}>Select a section above to view content.</p>
                }

                if (activeTab === 'definitions' && data.length > 0) {
                  return (
                    <SectionCard icon="📖" title="Definitions">
                      {data.map((d, i) => (
                        <div key={i} style={{
                          padding: '14px 0', borderBottom: i < data.length - 1 ? '1px solid var(--border-color)' : 'none'
                        }}>
                          <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>{d.term}</strong>
                          <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.7' }}>
                            {d.definition}
                          </p>
                        </div>
                      ))}
                    </SectionCard>
                  )
                }

                if (activeTab === 'keyConcepts' && data.length > 0) {
                  return (
                    <SectionCard icon="🎯" title="Key Concepts">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {data.map((c, i) => (
                          <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', marginTop: '8px', flexShrink: 0 }} />
                            <div>
                              {c.concept && <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{c.concept}</strong>}
                              {c.definition && <p style={{ margin: c.concept ? '2px 0 0' : 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.7' }}>{c.definition}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )
                }

                if (activeTab === 'importantFormulae' && data.length > 0) {
                  return (
                    <SectionCard icon="📐" title="Formulae & Rules">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {data.map((f, i) => (
                          <div key={i} style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                            <div style={{ padding: '14px 18px', fontFamily: "'Courier New', monospace", background: '#1e293b', color: '#e2e8f0', fontSize: '15px', letterSpacing: '0.3px', lineHeight: '1.6' }}>
                              {f.formula}
                            </div>
                            {f.description && <div style={{ padding: '10px 18px', fontSize: '13px', color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>{f.description}</div>}
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )
                }

                if (activeTab === 'examples' && data.length > 0) {
                  return (
                    <SectionCard icon="💡" title="Examples">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {data.map((ex, i) => (
                          <div key={i} style={{ borderRadius: '10px', background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1px solid #bfdbfe', padding: '16px 20px' }}>
                            {ex.title && <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: '700', color: '#1e40af' }}>{ex.title}</h4>}
                            <p style={{ margin: 0, fontSize: '14px', color: '#1e3a5f', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{ex.content}</p>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )
                }

                if (activeTab === 'commonMistakes' && data.length > 0) {
                  return (
                    <SectionCard icon="⚠️" title="Common Mistakes">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {data.map((m, i) => (
                          <div key={i} style={{ borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', padding: '16px 20px' }}>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                              <span style={{ fontSize: '16px', flexShrink: 0 }}>❌</span>
                              <div>
                                <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#991b1b', lineHeight: '1.6' }}>{m.mistake}</p>
                                {m.correction && (
                                  <div style={{ marginTop: '10px', padding: '10px 14px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                    <span style={{ fontSize: '14px', flexShrink: 0 }}>✅</span>
                                    <span style={{ fontSize: '13px', color: '#166534', lineHeight: '1.6' }}>{m.correction}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )
                }

                if (activeTab === 'frequentlyConfused' && data.length > 0) {
                  return (
                    <SectionCard icon="🔀" title="Frequently Confused Concepts">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {data.map((fc, i) => (
                          <div key={i} style={{ padding: '14px 18px', borderRadius: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                              <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', background: '#fef3c7', color: '#92400e' }}>{fc.concept1}</span>
                              <span style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>↔</span>
                              <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', background: '#fef3c7', color: '#92400e' }}>{fc.concept2}</span>
                            </div>
                            {fc.distinction && <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>{fc.distinction}</p>}
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )
                }

                if (activeTab === 'memoryTips' && data.length > 0) {
                  return (
                    <SectionCard icon="🧠" title="Memory Tips & Mnemonics">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {data.map((t, i) => (
                          <div key={i} style={{ padding: '14px 18px', borderRadius: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '16px', flexShrink: 0 }}>🧠</span>
                            <div>
                              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.7' }}>{t.tip}</p>
                              {t.topic && <span style={{ display: 'inline-block', marginTop: '6px', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: '#ede9fe', color: '#5b21b6' }}>{t.topic}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )
                }

                if (activeTab === 'examTips' && data.length > 0) {
                  return (
                    <SectionCard icon="📝" title="Exam Tips">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {data.map((t, i) => (
                          <div key={i} style={{ padding: '14px 18px', borderRadius: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '16px', flexShrink: 0 }}>💡</span>
                            <p style={{ margin: 0, fontSize: '14px', color: '#1e40af', lineHeight: '1.7' }}>{t.tip}</p>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )
                }

                if (activeTab === 'quickReferenceTable' && data.length > 0) {
                  return (
                    <SectionCard icon="📊" title="Quick Reference">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {data.map((qr, i) => (
                          <div key={i} style={{ display: 'flex', gap: '12px', padding: '10px 14px', borderRadius: '8px', background: i % 2 === 0 ? 'var(--bg-primary)' : 'transparent', borderBottom: i < data.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                            <span style={{ minWidth: '120px', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{qr.category}</span>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>{qr.details}</span>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )
                }

                if (activeTab === 'practiceQuestions' && data.length > 0) {
                  return (
                    <SectionCard icon="✏️" title="Practice Questions">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {data.map((q, i) => (
                          <div key={i} style={{ borderRadius: '10px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                            <div style={{ padding: '16px 20px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                              <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', flexShrink: 0 }}>{i + 1}</span>
                              <div style={{ flex: 1 }}>
                                <p style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.7' }}>{q.question}</p>
                                {q.difficulty && <span style={{ padding: '2px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: q.difficulty === 'easy' ? '#dcfce7' : q.difficulty === 'hard' ? '#fee2e2' : '#fef3c7', color: q.difficulty === 'easy' ? '#166534' : q.difficulty === 'hard' ? '#991b1b' : '#92400e' }}>{q.difficulty}</span>}
                                <details style={{ marginTop: '10px' }}>
                                  <summary style={{ display: 'inline-block', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: '#3b82f6', cursor: 'pointer', background: 'rgba(59,130,246,0.08)', border: 'none', userSelect: 'none' }}>Show Answer</summary>
                                  <div style={{ marginTop: '10px', padding: '12px 16px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '14px', color: '#166534', lineHeight: '1.7' }}>{q.answer}</div>
                                </details>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )
                }

                if (activeTab === 'vivaQuestions' && data.length > 0) {
                  return (
                    <SectionCard icon="🗣️" title="Viva / Oral Questions">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {data.map((q, i) => (
                          <div key={i} style={{ borderRadius: '10px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                            <div style={{ padding: '14px 18px', background: 'var(--bg-primary)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                              <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#7c3aed', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0 }}>{i + 1}</span>
                              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.7' }}>{q.question}</p>
                            </div>
                            <details>
                              <summary style={{ padding: '8px 18px', fontSize: '12px', fontWeight: '600', color: '#7c3aed', cursor: 'pointer', background: 'rgba(124,58,237,0.06)', borderTop: '1px solid var(--border-color)' }}>Show Answer</summary>
                              <div style={{ padding: '12px 18px', fontSize: '14px', color: '#5b21b6', background: '#f5f3ff', lineHeight: '1.7' }}>{q.answer}</div>
                            </details>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )
                }

                if (activeTab === 'mcqs' && data.length > 0) {
                  return (
                    <SectionCard icon="✅" title="Self-Test MCQs">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {data.map((q, i) => (
                          <div key={i} style={{ borderRadius: '10px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                            <div style={{ padding: '16px 20px' }}>
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '12px' }}>
                                <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#059669', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', flexShrink: 0 }}>{i + 1}</span>
                                <p style={{ margin: '2px 0 0', fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.7' }}>{q.question}</p>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginLeft: '36px' }}>
                                {(q.options || []).map((opt, oi) => (
                                  <div key={oi} style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '14px', background: opt.isCorrect ? '#f0fdf4' : 'var(--bg-secondary)', border: `2px solid ${opt.isCorrect ? '#22c55e' : 'var(--border-color)'}`, color: opt.isCorrect ? '#166534' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: opt.isCorrect ? '600' : '400' }}>
                                    <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: opt.isCorrect ? '#22c55e' : 'var(--border-color)', color: opt.isCorrect ? 'white' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>{String.fromCharCode(65 + oi)}</span>
                                    {opt.text}
                                    {opt.isCorrect && <span style={{ marginLeft: 'auto', fontSize: '14px' }}>✓</span>}
                                  </div>
                                ))}
                              </div>
                              {q.explanation && (
                                <div style={{ marginTop: '10px', marginLeft: '36px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', lineHeight: '1.6' }}>
                                  <strong>Explanation:</strong> {q.explanation}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )
                }

                if (activeTab === 'summary' && data) {
                  return (
                    <SectionCard icon="📋" title="Summary">
                      <div style={{ padding: '20px 24px', borderRadius: '10px', background: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)', border: '1px solid #bae6fd', fontSize: '15px', color: '#0c4a6e', lineHeight: '1.8' }}>
                        {data}
                      </div>
                    </SectionCard>
                  )
                }

                return <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px' }}>No content in this section yet.</p>
              })()}
            </motion.div>
          </AnimatePresence>

          {/* Bottom padding */}
          <div style={{ height: '40px' }} />
        </div>
      </motion.div>
    </div>
  )
}

export default RevisionPreview
