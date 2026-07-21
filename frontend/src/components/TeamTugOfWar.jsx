import React from 'react'

export default function TeamTugOfWar({ teams }) {
  if (!teams || teams.length === 0) {
    return (
      <div style={{
        padding: '30px', background: '#0f172a', color: '#64748b',
        borderRadius: '16px', textAlign: 'center', minHeight: '200px',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚔️</div>
          <div>No teams yet. Start Team Battle to see the Tug-of-War!</div>
        </div>
      </div>
    )
  }

  const sortedTeams = [...teams].sort((a, b) => (b.points || 0) - (a.points || 0))
  const maxPoints = Math.max(...teams.map(t => t.points || 0), 100)

  // Rank colors for top 3
  const rankColors = ['#fbbf24', '#94a3b8', '#cd7c32']

  return (
    <div style={{
      padding: '24px', background: '#0f172a', color: 'white',
      borderRadius: '16px', border: '1px solid #1e293b'
    }}>
      <h3 style={{
        textAlign: 'center', margin: '0 0 24px 0', fontSize: '22px',
        background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        fontWeight: '800'
      }}>
        🏁 Live Team Tug-Of-War
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {sortedTeams.map((team, idx) => {
          const percentage = Math.min(100, Math.round(((team.points || 0) / maxPoints) * 100))
          const isLeading = idx === 0 && (team.points || 0) > 0
          const hasStreak = (team.streakCount || 0) >= 3

          return (
            <div key={team._id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              animation: `slideIn 0.5s ease ${idx * 0.1}s both`
            }}>
              {/* Rank */}
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: idx < 3 ? rankColors[idx] : '#334155',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: '800', color: idx < 3 ? '#0f172a' : '#94a3b8',
                flexShrink: 0
              }}>
                {idx + 1}
              </div>

              {/* Team Card */}
              <div style={{
                width: '160px', background: '#1e293b', padding: '10px 14px',
                borderRadius: '10px', borderLeft: `4px solid ${isLeading ? '#6366f1' : '#334155'}`,
                display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0
              }}>
                <span style={{ fontSize: '20px' }}>{team.avatar}</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }}>
                    {team.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    {team.members?.length || 0} members
                  </div>
                </div>
              </div>

              {/* Racing Lane */}
              <div style={{
                flex: 1, background: '#1e293b', height: '28px',
                borderRadius: '14px', overflow: 'hidden', position: 'relative'
              }}>
                <div style={{
                  width: `${Math.max(percentage, 3)}%`,
                  background: isLeading
                    ? 'linear-gradient(90deg, #6366f1, #06b6d4)'
                    : 'linear-gradient(90deg, #475569, #64748b)',
                  height: '100%', borderRadius: '14px',
                  transition: 'width 1s ease-in-out',
                  position: 'relative',
                  boxShadow: isLeading ? '0 0 12px rgba(99,102,241,0.4)' : 'none'
                }}>
                  {hasStreak && (
                    <span style={{
                      position: 'absolute', right: '8px', top: '3px',
                      fontSize: '16px', filter: 'drop-shadow(0 0 4px #f59e0b)'
                    }}>
                      🔥
                    </span>
                  )}
                </div>
              </div>

              {/* Score */}
              <div style={{
                width: '80px', textAlign: 'right', flexShrink: 0
              }}>
                <div style={{
                  fontSize: '18px', fontWeight: '800',
                  color: isLeading ? '#34d399' : '#94a3b8'
                }}>
                  {team.points || 0}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>pts</div>
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
