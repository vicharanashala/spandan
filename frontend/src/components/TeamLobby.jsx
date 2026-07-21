import React from 'react'
import useSocketStore from '../stores/socketStore.js'

export default function TeamLobby({ teams, myTeam, studentId, roomId, groupingMode, teamSize }) {
  const { joinManualTeam, leaveManualTeam } = useSocketStore()
  if (!teams || teams.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '300px', color: 'var(--text-secondary, #94a3b8)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px', animation: 'pulse 2s infinite' }}>⏳</div>
          <div style={{ fontSize: '16px' }}>Waiting for teacher to form teams...</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        textAlign: 'center', marginBottom: '24px', padding: '20px',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(6,182,212,0.1))',
        borderRadius: '16px', border: '1px solid rgba(99,102,241,0.2)'
      }}>
        <div style={{ fontSize: '28px', marginBottom: '8px' }}>⚔️</div>
        <h2 style={{
          margin: '0 0 4px 0', fontSize: '22px',
          background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          fontWeight: '800'
        }}>
          Team Battle Mode
        </h2>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary, #94a3b8)' }}>
          {teams.length} teams ready to compete
        </p>
      </div>

      {/* Team Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '16px'
      }}>
        {teams.map((team, idx) => {
          const isMyTeam = myTeam?._id === team._id
          return (
            <div
              key={team._id}
              style={{
                background: isMyTeam
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(6,182,212,0.1))'
                  : 'var(--bg-card, #1e293b)',
                borderRadius: '16px', padding: '20px',
                border: isMyTeam ? '2px solid #6366f1' : '1px solid var(--border-color, #334155)',
                boxShadow: isMyTeam ? '0 0 25px rgba(99,102,241,0.2)' : 'none',
                transition: 'all 0.3s ease',
                animation: `cardPop 0.5s ease ${idx * 0.1}s both`
              }}
            >
              {/* My Team Badge */}
              {isMyTeam && (
                <div style={{
                  display: 'inline-block', background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
                  color: '#fff', padding: '3px 10px', borderRadius: '20px',
                  fontSize: '11px', fontWeight: '700', marginBottom: '10px'
                }}>
                  ✨ YOUR TEAM
                </div>
              )}

              {/* Avatar + Name */}
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{
                  fontSize: '42px', marginBottom: '8px',
                  filter: isMyTeam ? 'drop-shadow(0 0 8px rgba(99,102,241,0.5))' : 'none'
                }}>
                  {team.avatar}
                </div>
                <div style={{
                  fontSize: '18px', fontWeight: '800',
                  color: 'var(--text-primary, #f1f5f9)'
                }}>
                  {team.name}
                </div>
                {groupingMode === 'student-choice' && (
                  <div style={{
                    fontSize: '12px',
                    color: team.members?.length >= teamSize ? '#ef4444' : '#10b981',
                    marginTop: '6px',
                    fontWeight: '600',
                    display: 'inline-block',
                    padding: '2px 8px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '12px'
                  }}>
                    {team.members?.length} / {teamSize} Members
                  </div>
                )}
              </div>

              {/* Members List */}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: '6px'
              }}>
                {team.members?.map(member => {
                  const memberId = member._id || member
                  const isMe = memberId === studentId
                  return (
                    <div key={memberId} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '6px 10px', borderRadius: '8px',
                      background: isMe ? 'rgba(99,102,241,0.15)' : 'rgba(30,41,59,0.5)'
                    }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        background: isMe
                          ? 'linear-gradient(135deg, #6366f1, #06b6d4)'
                          : '#334155',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: '700', color: '#fff', flexShrink: 0
                      }}>
                        {(member.name || 'S')[0].toUpperCase()}
                      </div>
                      <span style={{
                        fontSize: '13px', fontWeight: isMe ? '700' : '400',
                        color: isMe ? '#a5b4fc' : 'var(--text-secondary, #94a3b8)'
                      }}>
                        {member.name || 'Student'} {isMe && '(You)'}
                      </span>
                    </div>
                  )
                })}
              </div>

              {groupingMode === 'student-choice' && (
                <div style={{ marginTop: '16px' }}>
                  {isMyTeam ? (
                    <button
                      onClick={() => leaveManualTeam(roomId)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        border: '1px solid #ef4444',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseOver={(e) => { e.target.style.background = 'rgba(239, 68, 68, 0.2)' }}
                      onMouseOut={(e) => { e.target.style.background = 'rgba(239, 68, 68, 0.1)' }}
                    >
                      🚪 Leave Team
                    </button>
                  ) : (
                    <button
                      onClick={() => joinManualTeam(roomId, team._id)}
                      disabled={team.members?.length >= teamSize}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: team.members?.length >= teamSize ? '#334155' : 'linear-gradient(135deg, #6366f1, #06b6d4)',
                        color: team.members?.length >= teamSize ? '#64748b' : '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: '700',
                        cursor: team.members?.length >= teamSize ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseOver={(e) => { if (team.members?.length < teamSize) e.target.style.transform = 'translateY(-1px)' }}
                      onMouseOut={(e) => { if (team.members?.length < teamSize) e.target.style.transform = 'translateY(0)' }}
                    >
                      {team.members?.length >= teamSize ? '🔒 Team Full' : '🤝 Join Team'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Waiting Indicator */}
      <div style={{
        textAlign: 'center', marginTop: '24px', padding: '16px',
        color: 'var(--text-secondary, #94a3b8)', fontSize: '14px'
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          background: 'var(--bg-card, #1e293b)', padding: '10px 20px',
          borderRadius: '24px', border: '1px solid var(--border-color, #334155)'
        }}>
          <span style={{ animation: 'pulse 1.5s infinite' }}>⏳</span>
          Waiting for teacher to launch the first question...
        </div>
      </div>

      <style>{`
        @keyframes cardPop {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
