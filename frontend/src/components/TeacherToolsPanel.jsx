import React, { useState } from 'react'

/**
 * TeacherToolsPanel — docked at right side of teacher room page
 * Contains: Raise Hand tracker, Announcement sender, Instant Poll sender
 *
 * Props:
 *   socket, roomCode, raisedHands (array of {userId, userName, at})
 *   onAnnounce(message, type)
 *   onInstantPoll(question, type)
 *   onEndInstantPoll()
 *   activePollId
 *   instantPollVotes — { up: n, down: n } | { 1:n, 2:n, 3:n, 4:n, 5:n }
 */
export default function TeacherToolsPanel({
  socket, roomCode,
  raisedHands = [],
  onAnnounce,
  onInstantPoll,
  onEndInstantPoll,
  activePollId,
  instantPollVotes = {},
}) {
  const [tab, setTab] = useState('hands')  // 'hands' | 'announce' | 'poll'
  const [annMsg, setAnnMsg] = useState('')
  const [annType, setAnnType] = useState('info')
  const [pollQ, setPollQ] = useState('')
  const [pollType, setPollType] = useState('thumbs')
  const [isMusicPlaying, setIsMusicPlaying] = useState(false)

  const TABS = [
    { key: 'hands',    icon: '✋', label: `Hands (${raisedHands.length})` },
    { key: 'announce', icon: '📢', label: 'Announce'  },
    { key: 'poll',     icon: '📊', label: 'Poll'      },
    { key: 'music',    icon: '🎵', label: 'Music'     },
  ]

  const sendAnnouncement = () => {
    if (!annMsg.trim()) return
    onAnnounce?.(annMsg.trim(), annType)
    setAnnMsg('')
  }

  const launchPoll = () => {
    if (!pollQ.trim() || activePollId) return
    onInstantPoll?.(pollQ.trim(), pollType)
    setPollQ('')
  }

  const totalVotes = Object.values(instantPollVotes).reduce((a, b) => a + b, 0)

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '16px', overflow: 'hidden', height: 'fit-content',
      boxShadow: 'var(--card-shadow)', minWidth: '260px',
    }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer',
            background: tab === t.key ? 'var(--accent-light)' : 'transparent',
            color: tab === t.key ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: '700', fontSize: '11px', borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            transition: 'all .15s',
          }}>
            <div style={{ fontSize: '16px' }}>{t.icon}</div>
            <div style={{ marginTop: '2px' }}>{t.label}</div>
          </button>
        ))}
      </div>

      <div style={{ padding: '14px', maxHeight: '360px', overflowY: 'auto' }}>

        {/* RAISE HAND TAB */}
        {tab === 'hands' && (
          <div>
            {raisedHands.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>✋</div>
                No hands raised yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {raisedHands.map(h => (
                  <div key={h.userId} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 10px', background: 'var(--accent-light)',
                    borderRadius: '10px', border: '1px solid var(--accent)',
                    animation: 'fadeIn .3s ease both',
                  }}>
                    <span style={{ fontSize: '18px' }}>✋</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{h.userName}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </div>
                    <button onClick={() => {
                      socket?.emit('hand:lower', { roomCode, userId: h.userId })
                    }} style={{
                      background: 'rgba(220,38,38,.1)', border: '1px solid rgba(220,38,38,.3)',
                      borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', color: '#dc2626', fontSize: '11px', fontWeight: '700'
                    }}>
                      Lower
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ANNOUNCE TAB */}
        {tab === 'announce' && (
          <div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
              {[
                { val: 'info',    icon: '🔵', label: 'Info' },
                { val: 'warning', icon: '🟡', label: 'Warning' },
                { val: 'success', icon: '🟢', label: 'Success' },
              ].map(t => (
                <button key={t.val} onClick={() => setAnnType(t.val)} style={{
                  flex: 1, padding: '6px 4px', border: `1.5px solid ${annType === t.val ? 'var(--accent)' : 'var(--border-color)'}`,
                  background: annType === t.val ? 'var(--accent-light)' : 'transparent',
                  borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: '700',
                  color: annType === t.val ? 'var(--accent)' : 'var(--text-secondary)',
                }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            <textarea
              value={annMsg} onChange={e => setAnnMsg(e.target.value)}
              placeholder="Type your announcement..."
              rows={3}
              style={{
                width: '100%', resize: 'vertical', padding: '10px 12px',
                background: 'var(--input-bg)', border: '1.5px solid var(--input-border)',
                borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px',
                fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: '10px',
              }}
            />
            <button onClick={sendAnnouncement} disabled={!annMsg.trim()} style={{
              width: '100%', padding: '10px', background: 'linear-gradient(135deg,#4c1d95,#7c3aed)',
              color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '13px',
              cursor: annMsg.trim() ? 'pointer' : 'not-allowed', opacity: annMsg.trim() ? 1 : .5,
            }}>
              Send to All Students
            </button>
          </div>
        )}

        {/* POLL TAB */}
        {tab === 'poll' && (
          <div>
            {activePollId ? (
              <div>
                <div style={{ marginBottom: '12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.7px' }}>
                    Live Poll Results ({totalVotes} votes)
                  </span>
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {Object.entries(instantPollVotes).map(([key, count]) => {
                      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
                      return (
                        <div key={key}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                            <span>{key}</span><span>{count} ({pct}%)</span>
                          </div>
                          <div style={{ height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#7c3aed,#a855f7)', borderRadius: '4px', transition: 'width .5s ease' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <button onClick={onEndInstantPoll} style={{
                  width: '100%', padding: '10px', background: 'linear-gradient(135deg,#991b1b,#dc2626)',
                  color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer',
                }}>
                  End Poll
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                  {[{ val: 'thumbs', icon: '👍', label: 'Thumbs' }, { val: 'rating', icon: '⭐', label: 'Rating 1-5' }].map(t => (
                    <button key={t.val} onClick={() => setPollType(t.val)} style={{
                      flex: 1, padding: '6px', border: `1.5px solid ${pollType === t.val ? 'var(--accent)' : 'var(--border-color)'}`,
                      background: pollType === t.val ? 'var(--accent-light)' : 'transparent',
                      borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: '700',
                      color: pollType === t.val ? 'var(--accent)' : 'var(--text-secondary)',
                    }}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={pollQ} onChange={e => setPollQ(e.target.value)}
                  placeholder="Poll question (e.g. Did you understand this topic?)"
                  rows={3}
                  style={{
                    width: '100%', resize: 'vertical', padding: '10px 12px',
                    background: 'var(--input-bg)', border: '1.5px solid var(--input-border)',
                    borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px',
                    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: '10px',
                  }}
                />
                <button onClick={launchPoll} disabled={!pollQ.trim()} style={{
                  width: '100%', padding: '10px', background: 'linear-gradient(135deg,#065f46,#059669)',
                  color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '13px',
                  cursor: pollQ.trim() ? 'pointer' : 'not-allowed', opacity: pollQ.trim() ? 1 : .5,
                }}>
                  Launch Poll
                </button>
              </div>
            )}
          </div>
        )}
        {/* MUSIC TAB */}
        {tab === 'music' && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎵</div>
            <h4 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Ambient Focus Music</h4>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Play a lo-fi focus track synchronously across all student devices to help them concentrate during polls.
            </p>
            <button 
              onClick={() => {
                const nextState = !isMusicPlaying
                setIsMusicPlaying(nextState)
                socket?.emit('room:music:toggle', { roomCode, isPlaying: nextState })
              }}
              style={{
                width: '100%', padding: '10px', 
                background: isMusicPlaying ? 'linear-gradient(135deg,#991b1b,#dc2626)' : 'linear-gradient(135deg,#4c1d95,#7c3aed)',
                color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer',
              }}
            >
              {isMusicPlaying ? '⏹ Stop Music' : '▶ Play Music'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
