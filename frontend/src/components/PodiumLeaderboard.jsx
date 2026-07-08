import React from 'react'

/**
 * PodiumLeaderboard — visual top-3 podium + full ranked list
 * Props:
 *   leaderboard: Array<{ rank, studentName, totalPoints, correctCount, totalAnswered }>
 *   currentUserId: string (to highlight current user's row)
 */
export default function PodiumLeaderboard({ leaderboard = [], currentUserName = '' }) {
  if (!leaderboard.length) return (
    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏆</div>
      <p>No scores yet. Start a poll to see the leaderboard!</p>
    </div>
  )

  const top3 = leaderboard.slice(0, 3)
  const rest = leaderboard.slice(3)

  // Reorder: 2nd, 1st, 3rd for the podium visual
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean)
  const podiumHeights = { 1: '120px', 2: '90px', 3: '70px' }
  const podiumColors  = { 1: '#fbbf24', 2: '#94a3b8', 3: '#d97706' }
  const podiumBg      = { 1: 'linear-gradient(135deg,#b45309,#fbbf24)', 2: 'linear-gradient(135deg,#475569,#94a3b8)', 3: 'linear-gradient(135deg,#92400e,#d97706)' }
  const rankEmoji     = { 1: '🥇', 2: '🥈', 3: '🥉' }

  const initials = (name = '') => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div>
      {/* ── Podium ── */}
      {top3.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '8px', marginBottom: '28px', paddingTop: '24px' }}>
          {podiumOrder.map((entry) => {
            if (!entry) return null
            const h    = podiumHeights[entry.rank] || '60px'
            const c    = podiumColors[entry.rank]  || '#7c3aed'
            const bg   = podiumBg[entry.rank]      || 'var(--accent)'
            const isMe = entry.studentName === currentUserName

            return (
              <div key={entry.rank} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: entry.rank === 1 ? '0 0 140px' : '0 0 120px' }}>
                {/* Avatar */}
                <div style={{
                  width: entry.rank === 1 ? '64px' : '52px',
                  height: entry.rank === 1 ? '64px' : '52px',
                  borderRadius: '50%',
                  background: bg,
                  color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: entry.rank === 1 ? '20px' : '16px',
                  fontWeight: '900',
                  boxShadow: `0 0 0 4px ${c}60, 0 8px 24px ${c}50`,
                  marginBottom: '8px',
                  border: isMe ? '3px solid white' : 'none',
                }}>
                  {initials(entry.studentName)}
                </div>
                <span style={{ fontSize: '18px', marginBottom: '4px' }}>{rankEmoji[entry.rank]}</span>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', textAlign: 'center', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.studentName}{isMe ? ' (You)' : ''}
                </span>
                <span style={{ fontSize: '14px', fontWeight: '800', color: c, marginBottom: '6px' }}>{entry.totalPoints} pts</span>
                {/* Podium block */}
                <div style={{
                  width: '100%', height: h, borderRadius: '10px 10px 0 0',
                  background: bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '28px', fontWeight: '900', color: 'rgba(255,255,255,.6)',
                  boxShadow: `0 -4px 20px ${c}40`,
                }}>
                  {entry.rank}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Full Ranked List ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {leaderboard.map((entry, i) => {
          const isMe = entry.studentName === currentUserName
          const accuracy = entry.totalAnswered > 0
            ? Math.round((entry.correctCount / entry.totalAnswered) * 100) : 0

          return (
            <div key={entry.rank} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px 16px', borderRadius: '12px',
              background: isMe ? 'var(--accent-light)' : 'var(--bg-card)',
              border: isMe ? '1.5px solid var(--accent)' : '1px solid var(--border-color)',
              animation: `fadeIn .35s ${i * 0.04}s both`,
            }}>
              {/* Rank */}
              <div style={{ width: '32px', textAlign: 'center', flexShrink: 0 }}>
                {entry.rank <= 3
                  ? <span style={{ fontSize: '20px' }}>{rankEmoji[entry.rank]}</span>
                  : <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-muted)' }}>#{entry.rank}</span>}
              </div>
              {/* Avatar */}
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                background: isMe ? 'var(--accent)' : 'var(--bg-hover)',
                color: isMe ? 'white' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: '800',
              }}>
                {initials(entry.studentName)}
              </div>
              {/* Name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.studentName}{isMe ? ' (You)' : ''}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{accuracy}% accuracy · {entry.correctCount}/{entry.totalAnswered} correct</div>
              </div>
              {/* Points */}
              <div style={{ fontWeight: '900', fontSize: '18px', color: entry.rank <= 3 ? podiumColors[entry.rank] : 'var(--text-primary)', flexShrink: 0 }}>
                {entry.totalPoints}
                <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginLeft: '3px' }}>pts</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
