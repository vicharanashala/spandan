import React, { useEffect, useState, useCallback } from 'react'
import useAuthStore from '../stores/authStore'
import useQuestionBankStore from '../stores/questionBankStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'

function QuestionBankPage() {
  const { user } = useAuthStore()
  const {
    items, total, topics, isLoading, error,
    fetchList, fetchTopics, prepareImport, stageForImport, archive, clearError
  } = useQuestionBankStore()

  const [search, setSearch] = useState('')
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2500)
  }

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      fetchList({ search, topic, difficulty })
    }, 250)
    return () => clearTimeout(t)
  }, [search, topic, difficulty, fetchList])

  useEffect(() => {
    fetchTopics()
  }, [fetchTopics])

  const handleAddToRoom = useCallback(async (bankQ) => {
    setBusyId(bankQ._id)
    try {
      const ready = await prepareImport(bankQ._id)
      stageForImport(ready)
      showToast(?? Staged   — open a room to add it, 'success')
    } catch (e) {
      showToast(? , 'error')
    } finally {
      setBusyId(null)
    }
  }, [prepareImport, stageForImport])

  const handleArchive = useCallback(async (q) => {
    if (!window.confirm('Archive this question?')) return
    try {
      await archive(q._id)
      showToast('??? Archived', 'success')
    } catch (e) {
      showToast(? , 'error')
    }
  }, [archive])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif' }}>
      <Sidebar user={user} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px' }}>
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>
                ?? Question Bank
              </h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
                Save questions once. Reuse them in any room.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown user={user} />
            </div>
          </div>
        </header>

        <div style={{ padding: '32px', flex: 1 }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
                          padding: '12px 16px', borderRadius: 8, marginBottom: 16,
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>? {error}</span>
              <button onClick={clearError} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}>?</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type=text
              placeholder=?? Search questions tags topics…
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: '1 1 280px', minWidth: 220, padding: '10px 14px',
                       background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                       color: 'var(--text-primary)', borderRadius: 8, fontSize: 14 }}
            />
            <select value={topic} onChange={(e) => setTopic(e.target.value)}
              style={{ padding: '10px 14px', background: 'var(--bg-card)',
                       border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                       borderRadius: 8, fontSize: 14, minWidth: 160 }}>
              <option value=>All topics</option>
 {topics.map(t => <option key={t.name} value={t.name}>?? {t.name} ({t.count})</option>)}
 </select>
 <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
 style={{ padding: '10px 14px', background: 'var(--bg-card)',
 border: '1px solid var(--border-color)', color: 'var(--text-primary)',
 borderRadius: 8, fontSize: 14 }}>
 <option value=>Any difficulty</option>
              <option value=easy>Easy</option>
              <option value=medium>Medium</option>
              <option value=hard>Hard</option>
            </select>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              {total} question{total !== 1 ? 's' : ''}
            </span>
          </div>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-secondary)',
                          background: 'var(--bg-card)', borderRadius: 16,
                          border: '1px dashed var(--border-color)' }}>
              <div style={{ fontSize: 56, marginBottom: 12 }}>??</div>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Your bank is empty</h3>
              <p style={{ fontSize: 14, maxWidth: 460, margin: '0 auto' }}>
                Open any room, generate or write questions, then click
                <strong> ?? Save to Bank</strong> on each one to build your library.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {items.map((q) => (
                <div key={q._id} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: 12, padding: 18, display: 'flex', gap: 16
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11,
                                     fontWeight: 700, background: '#3b82f620', color: '#60a5fa' }}>
                        {q.type}
                      </span>
                      <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11,
                                     fontWeight: 700,
                                     background: q.difficulty === 'easy' ? '#10b98120' :
                                                 q.difficulty === 'hard' ? '#ef444420' : '#f59e0b20',
                                     color: q.difficulty === 'easy' ? '#34d399' :
                                            q.difficulty === 'hard' ? '#f87171' : '#fbbf24' }}>
                        {q.difficulty}
                      </span>
                      {q.topic && (
                        <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11,
                                      fontWeight: 700, background: '#8b5cf620', color: '#a78bfa' }}>
                          ?? {q.topic}
                        </span>
                      )}
                      {(q.tags || []).map(t => (
                        <span key={t} style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11,
                                              fontWeight: 600, background: '#ec489920', color: '#f472b6' }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                    <div style={{ color: 'var(--text-primary)', fontSize: 15,
                                  marginBottom: 8, lineHeight: 1.5, fontWeight: 500 }}>
                      {q.question}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {(q.options || []).filter(o => o.isCorrect).map(o => ? ).join(' · ') || <em>No correct answer marked</em>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 130 }}>
                    <button
                      onClick={() => handleAddToRoom(q)}
                      disabled={busyId === q._id}
                      title=Stage this question — open a room to drop it in
                      style={{
                        padding: '10px 14px', background: busyId === q._id ? '#94a3b8' : '#3b82f6',
                        color: 'white', border: 'none', borderRadius: 8, fontWeight: 700,
                        cursor: busyId === q._id ? 'wait' : 'pointer', fontSize: 13,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6
                      }}
                    >
                      {busyId === q._id ? '…' : '?? Add to Room'}
                    </button>
                    <button
                      onClick={() => handleArchive(q)}
                      style={{
                        padding: '8px 14px', background: 'transparent',
                        color: 'var(--text-secondary)', border: '1px solid var(--border-color)',
                        borderRadius: 8, fontWeight: 600,
                        cursor: 'pointer', fontSize: 12
                      }}
                    >
                      ??? Archive
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: 'white', padding: '14px 22px', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)', fontWeight: 600, zIndex: 200,
          maxWidth: 420, animation: 'slideIn 0.2s ease'
        }}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

export default QuestionBankPage
