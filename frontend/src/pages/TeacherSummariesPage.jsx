import React, { useState, useEffect } from 'react'
import { summaryApi } from '../lib/api.js'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import useIsMobile from '../hooks/useIsMobile'

export default function TeacherSummariesPage() {
  const { user } = useAuthStore()
  const isMobile = useIsMobile()
  const [summaries, setSummaries] = useState([])
  const [loading, setLoading] = useState(true)

  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    fetchSummaries()
  }, [])

  const fetchSummaries = async () => {
    try {
      const res = await summaryApi.listMine()
      setSummaries(res)
    } catch (err) {
      console.error('Failed to fetch summaries:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      setText(event.target.result)
    }
    reader.readAsText(file)
  }

  const handleGenerate = async () => {
    if (!title.trim() || !text.trim()) return
    setIsGenerating(true)
    try {
      await summaryApi.create({ title: title.trim(), text: text.trim() })
      setTitle('')
      setText('')
      await fetchSummaries()
    } catch (err) {
      console.error('Failed to generate summary:', err)
      alert(err.message || 'Failed to generate summary')
    } finally {
      setIsGenerating(false)
    }
  }

  const togglePublish = async (id, currentStatus) => {
    try {
      await summaryApi.publish(id, !currentStatus)
      setSummaries(summaries.map(s => s._id === id ? { ...s, published: !currentStatus } : s))
    } catch (err) {
      console.error('Failed to publish:', err)
      alert(err.message || 'Failed to update publish status')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this summary?')) return
    try {
      await summaryApi.remove(id)
      setSummaries(summaries.filter(s => s._id !== id))
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Sidebar user={user} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', marginLeft: 'var(--sidebar-width, 240px)', transition: 'margin-left 0.2s ease', boxSizing: 'border-box' }}>
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: isMobile ? '20px 16px' : '24px 32px', paddingLeft: isMobile ? '64px' : '32px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: isMobile ? '20px' : '26px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                Lecture Summaries
              </h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
                Generate and manage AI summaries of your class transcripts
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <div style={{ flex: 1, padding: isMobile ? '16px' : '32px', boxSizing: 'border-box', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
          
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: isMobile ? '20px' : '24px', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-color)', marginBottom: '32px' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>Generate New Summary</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input type="text" placeholder="Lecture Title..." value={title} onChange={e => setTitle(e.target.value)} style={{ padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', background: 'var(--input-bg)', color: 'var(--text-primary)', outline: 'none' }} />
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Or upload .txt file:</span>
                <input type="file" accept=".txt" onChange={handleFileUpload} style={{ fontSize: '14px', color: 'var(--text-primary)' }} />
              </div>

              <textarea placeholder="Paste transcript here..." value={text} onChange={e => setText(e.target.value)} style={{ width: '100%', height: '150px', padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', background: 'var(--input-bg)', color: 'var(--text-primary)', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              
              <button disabled={isGenerating || !title.trim() || !text.trim()} onClick={handleGenerate} style={{ alignSelf: 'flex-start', padding: '12px 24px', background: isGenerating || !title.trim() || !text.trim() ? '#9ca3af' : 'var(--accent-gradient)', color: 'white', border: 'none', borderRadius: 'var(--radius)', fontWeight: 600, cursor: isGenerating || !title.trim() || !text.trim() ? 'not-allowed' : 'pointer' }}>
                {isGenerating ? 'Generating...' : 'Generate Summary'}
              </button>
            </div>
          </div>

          <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>My Summaries</h2>
          
          {loading ? (
            <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
          ) : summaries.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No summaries generated yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {summaries.map(summary => {
                const isExpanded = expandedId === summary._id
                return (
                  <div key={summary._id} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: '16px' }} onClick={() => setExpandedId(isExpanded ? null : summary._id)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary.title}</h3>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <span>{new Date(summary.createdAt).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>Status: <strong style={{ color: summary.status === 'ready' ? '#10b981' : summary.status === 'failed' ? '#ef4444' : '#f59e0b' }}>{summary.status}</strong></span>
                          {summary.wordCount && <span>• {summary.wordCount} words</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }} onClick={e => e.stopPropagation()}>
                        {summary.status === 'ready' && (
                          <button onClick={() => togglePublish(summary._id, summary.published)} style={{ padding: '6px 12px', background: summary.published ? 'rgba(16, 185, 129, 0.1)' : 'transparent', color: summary.published ? '#10b981' : 'var(--text-secondary)', border: `1px solid ${summary.published ? '#10b981' : 'var(--border-color)'}`, borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                            {summary.published ? 'Published' : 'Publish'}
                          </button>
                        )}
                        <button onClick={() => handleDelete(summary._id)} style={{ padding: '6px 12px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                          Delete
                        </button>
                      </div>
                    </div>

                    {isExpanded && summary.status === 'ready' && (
                      <div style={{ padding: '20px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
                        <h4 style={{ margin: '0 0 10px', fontSize: '15px', color: 'var(--text-primary)' }}>Overview</h4>
                        <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{summary.overview}</p>
                        
                        <h4 style={{ margin: '0 0 10px', fontSize: '15px', color: 'var(--text-primary)' }}>Key Takeaways</h4>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                          {summary.keyTakeaways.map((point, idx) => (
                            <li key={idx} style={{ marginBottom: '8px' }}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {isExpanded && summary.status === 'failed' && (
                      <div style={{ padding: '20px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: '#ef4444' }}>
                        Error: {summary.errorMessage || 'Unknown error'}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
