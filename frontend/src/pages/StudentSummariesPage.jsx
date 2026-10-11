import React, { useState, useEffect } from 'react'
import { summaryApi } from '../lib/api.js'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import useIsMobile from '../hooks/useIsMobile'

export default function StudentSummariesPage() {
  const { user } = useAuthStore()
  const isMobile = useIsMobile()
  const [summaries, setSummaries] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedSummary, setExpandedSummary] = useState(null)
  const [loadingId, setLoadingId] = useState(null)
  const [downloadDropdownOpen, setDownloadDropdownOpen] = useState(false)
  const [chats, setChats] = useState({})
  const [chatInputs, setChatInputs] = useState({})
  const [isAsking, setIsAsking] = useState(false)

  useEffect(() => {
    fetchSummaries()
  }, [])

  const fetchSummaries = async () => {
    try {
      const res = await summaryApi.listPublished()
      setSummaries(res)
    } catch (err) {
      console.error('Failed to fetch published summaries:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleExpand = async (id) => {
    if (expandedSummary?._id === id) {
      setExpandedSummary(null)
      setDownloadDropdownOpen(false)
      return
    }

    setDownloadDropdownOpen(false)

    setLoadingId(id)
    try {
      const detail = await summaryApi.get(id)
      setExpandedSummary(detail)
    } catch (err) {
      console.error('Failed to fetch summary details:', err)
      alert(err.message || 'Failed to fetch details')
    } finally {
      setLoadingId(null)
    }
  }

  const handleDownloadMarkdown = (summary) => {
    const date = new Date(summary.createdAt).toLocaleDateString()
    const content = `# ${summary.title} & ${date}\n\n## Executive Summary\n\n${summary.overview}\n\n## Key Takeaways\n\n${summary.keyTakeaways?.map(pt => `- ${pt}`).join('\n') || ''}`
    
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${summary.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_Study_Note.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setDownloadDropdownOpen(false)
  }

  const handleDownloadPDF = (summary) => {
    const date = new Date(summary.createdAt).toLocaleDateString()
    const printWindow = window.open('', '_blank')
    const htmlContent = `
      <html>
        <head>
          <title>${summary.title} - Study Note</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; }
            h1 { font-size: 24px; margin-bottom: 8px; }
            h2 { font-size: 20px; margin-top: 24px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
            .date { color: #666; font-size: 14px; margin-bottom: 32px; }
            ul { padding-left: 24px; }
            li { margin-bottom: 8px; }
          </style>
        </head>
        <body>
          <h1>${summary.title} &amp; ${date}</h1>
          <h2>Executive Summary</h2>
          <p>${summary.overview}</p>
          <h2>Key Takeaways</h2>
          <ul>
            ${summary.keyTakeaways?.map(pt => `<li>${pt}</li>`).join('') || ''}
          </ul>
        </body>
      </html>
    `
    printWindow.document.write(htmlContent)
    printWindow.document.close()
    setTimeout(() => {
      printWindow.print()
    }, 250)
    setDownloadDropdownOpen(false)
  }

  const handleAskQuestion = async (id) => {
    const question = chatInputs[id]?.trim()
    if (!question || isAsking) return

    const newChat = [...(chats[id] || []), { role: 'user', text: question }]
    setChats({ ...chats, [id]: newChat })
    setChatInputs({ ...chatInputs, [id]: '' })
    setIsAsking(true)

    try {
      const res = await summaryApi.askQuestion(id, question)
      setChats(prev => ({
        ...prev,
        [id]: [...(prev[id] || []), { role: 'ai', text: res.answer }]
      }))
    } catch (err) {
      setChats(prev => ({
        ...prev,
        [id]: [...(prev[id] || []), { role: 'ai', text: `Error: ${err.message}` }]
      }))
    } finally {
      setIsAsking(false)
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
                Review AI-generated summaries and transcripts from your classes
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <div style={{ flex: 1, padding: isMobile ? '16px' : '32px', boxSizing: 'border-box', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
          
          <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>Published Summaries</h2>
          
          {loading ? (
            <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
          ) : summaries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-secondary)', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
              No summaries have been published yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {summaries.map(summary => {
                const isExpanded = expandedSummary?._id === summary._id
                const isLoadingDetail = loadingId === summary._id
                return (
                  <div key={summary._id} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                    <div onClick={() => handleExpand(summary._id)} style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: '16px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{summary.title}</h3>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <span>Teacher: <strong>{summary.teacherId?.name || 'Unknown'}</strong></span>
                          <span>•</span>
                          <span>{new Date(summary.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        {isLoadingDetail ? '...' : isExpanded ? '▲' : '▼'}
                      </div>
                    </div>

                    {isExpanded && expandedSummary && (
                      <div style={{ padding: '20px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
                          <div>
                            <h4 style={{ margin: '0 0 10px', fontSize: '15px', color: 'var(--text-primary)' }}>Overview</h4>
                            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{expandedSummary.overview}</p>
                          </div>
                          <div style={{ position: 'relative' }}>
                            <button 
                              onClick={() => setDownloadDropdownOpen(!downloadDropdownOpen)}
                              style={{ padding: '8px 16px', background: 'var(--accent-gradient, var(--accent))', color: 'white', border: 'none', borderRadius: 'var(--radius)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}
                            >
                              Download Study Note <span style={{ fontSize: '10px' }}>▼</span>
                            </button>
                            
                            {downloadDropdownOpen && (
                              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)', zIndex: 10, minWidth: '180px', overflow: 'hidden' }}>
                                <button onClick={() => handleDownloadMarkdown(expandedSummary)} style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', fontSize: '13px' }}>
                                  Markdown (.md)
                                </button>
                                <button onClick={() => handleDownloadPDF(expandedSummary)} style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px' }}>
                                  PDF Document (.pdf)
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <h4 style={{ margin: '0 0 10px', fontSize: '15px', color: 'var(--text-primary)' }}>Key Takeaways</h4>
                        <ul style={{ margin: '0 0 24px', paddingLeft: '20px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                          {expandedSummary.keyTakeaways?.map((point, idx) => (
                            <li key={idx} style={{ marginBottom: '8px' }}>{point}</li>
                          ))}
                        </ul>

                        <details>
                          <summary style={{ cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--accent)' }}>View Full Transcript</summary>
                          <div style={{ marginTop: '12px', padding: '16px', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)', fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: '400px', overflowY: 'auto', lineHeight: 1.6 }}>
                            {expandedSummary.cleanedText || 'No transcript available.'}
                          </div>
                        </details>

                        <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                          <details>
                            <summary style={{ cursor: 'pointer', fontSize: '15px', fontWeight: 600, color: 'var(--accent)', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>💬</span> Ask AI About This Lecture
                            </summary>
                            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' }}>
                              <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {chats[expandedSummary._id]?.length ? chats[expandedSummary._id].map((msg, idx) => (
                                  <div key={idx} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-primary)', color: msg.role === 'user' ? 'white' : 'var(--text-primary)', padding: '10px 14px', borderRadius: '12px', maxWidth: '85%', fontSize: '14px', border: msg.role === 'user' ? 'none' : '1px solid var(--border-color)' }}>
                                    <strong style={{ display: 'block', marginBottom: '4px', fontSize: '12px', opacity: 0.8 }}>{msg.role === 'user' ? 'You' : 'AI Tutor'}</strong>
                                    {msg.text}
                                  </div>
                                )) : (
                                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center' }}>Ask any question about this lecture transcript!</p>
                                )}
                                {isAsking && (
                                  <div style={{ alignSelf: 'flex-start', background: 'var(--bg-primary)', color: 'var(--text-secondary)', padding: '10px 14px', borderRadius: '12px', fontSize: '14px', border: '1px solid var(--border-color)' }}>
                                    <em>AI tutor is thinking...</em>
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                <input 
                                  type="text" 
                                  placeholder="Type your question..." 
                                  value={chatInputs[expandedSummary._id] || ''}
                                  onChange={(e) => setChatInputs({ ...chatInputs, [expandedSummary._id]: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAskQuestion(expandedSummary._id)
                                  }}
                                  style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', outline: 'none' }}
                                />
                                <button 
                                  onClick={() => handleAskQuestion(expandedSummary._id)}
                                  disabled={isAsking || !chatInputs[expandedSummary._id]?.trim()}
                                  style={{ padding: '10px 20px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 'var(--radius)', fontWeight: 600, cursor: (isAsking || !chatInputs[expandedSummary._id]?.trim()) ? 'not-allowed' : 'pointer', opacity: (isAsking || !chatInputs[expandedSummary._id]?.trim()) ? 0.6 : 1 }}
                                >
                                  Send
                                </button>
                              </div>
                            </div>
                          </details>
                        </div>
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
