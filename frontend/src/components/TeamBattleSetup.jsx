import React, { useState } from 'react'
import useTeamStore from '../stores/teamStore'

export default function TeamBattleSetup({ roomId, onTeamsCreated, onClose }) {
  const [teamSize, setTeamSize] = useState(3)
  const [groupingMode, setGroupingMode] = useState('random')
  const { teams, createTeams, deleteTeams, isLoading, error } = useTeamStore()
  const [created, setCreated] = useState(teams.length > 0)

  const handleCreate = async () => {
    try {
      const newTeams = await createTeams(roomId, teamSize, groupingMode)
      setCreated(true)
      if (onTeamsCreated) onTeamsCreated(newTeams)
    } catch (err) {
      // error is set in store
    }
  }

  const handleReset = async () => {
    await deleteTeams(roomId)
    setCreated(false)
  }

  const modes = [
    { value: 'random', label: 'Random', icon: '🎲', desc: 'Shuffle students randomly into teams' },
    { value: 'performance-mixed', label: 'Mixed Performance', icon: '📊', desc: 'Balance toppers and struggling students using serpentine sorting' },
    { value: 'student-choice', label: 'Student Choice', icon: '🤝', desc: 'Let students pick their own teams' }
  ]

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(6,182,212,0.08))',
      border: '1px solid var(--border-color, #334155)',
      borderRadius: '16px',
      padding: '24px',
      position: 'relative',
      backdropFilter: 'blur(12px)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '20px', color: 'var(--text-primary, #f1f5f9)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          ⚔️ Team Battle Setup
        </h3>
        {onClose && (
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--text-secondary, #94a3b8)',
            fontSize: '20px', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px'
          }}>✕</button>
        )}
      </div>

      {!created ? (
        <>
          {/* Team Size */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', color: 'var(--text-secondary, #94a3b8)', marginBottom: '8px', fontWeight: '600' }}>
              Team Size: <span style={{ color: '#6366f1', fontSize: '18px' }}>{teamSize}</span>
            </label>
            <input
              type="range"
              min="2" max="10" value={teamSize}
              onChange={(e) => setTeamSize(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#6366f1' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary, #64748b)' }}>
              <span>2 (pairs)</span><span>10 (large groups)</span>
            </div>
          </div>

          {/* Grouping Mode */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', color: 'var(--text-secondary, #94a3b8)', marginBottom: '10px', fontWeight: '600' }}>
              Grouping Mode
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {modes.map(mode => (
                <button
                  key={mode.value}
                  onClick={() => setGroupingMode(mode.value)}
                  style={{
                    flex: '1', minWidth: '140px', padding: '14px 12px', borderRadius: '12px', border: 'none',
                    background: groupingMode === mode.value
                      ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                      : 'var(--bg-card, #1e293b)',
                    color: groupingMode === mode.value ? '#fff' : 'var(--text-primary, #e2e8f0)',
                    cursor: 'pointer', textAlign: 'center',
                    boxShadow: groupingMode === mode.value ? '0 4px 15px rgba(99,102,241,0.4)' : 'none',
                    transition: 'all 0.3s ease', fontSize: '13px'
                  }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '6px' }}>{mode.icon}</div>
                  <div style={{ fontWeight: '600', marginBottom: '4px' }}>{mode.label}</div>
                  <div style={{ fontSize: '11px', opacity: 0.7 }}>{mode.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px', color: '#fca5a5', fontSize: '13px', marginBottom: '16px' }}>
              ⚠️ {error}
            </div>
          )}

          {/* Create Button */}
          <button
            onClick={handleCreate}
            disabled={isLoading}
            style={{
              width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
              background: isLoading ? '#475569' : 'linear-gradient(135deg, #6366f1, #06b6d4)',
              color: '#fff', fontSize: '16px', fontWeight: '700', cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: isLoading ? 'none' : '0 4px 15px rgba(99,102,241,0.3)'
            }}
          >
            {isLoading ? '⏳ Creating Teams...' : '⚡ Create Teams'}
          </button>
        </>
      ) : (
        <>
          {/* Team List */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            {teams.map(team => (
              <div key={team._id} style={{
                background: 'var(--bg-card, #1e293b)', borderRadius: '12px', padding: '14px',
                borderLeft: '4px solid #6366f1'
              }}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>{team.avatar} <strong>{team.name}</strong></div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
                  {team.members?.length || 0} members
                </div>
                <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {team.members?.map(m => (
                    <span key={m._id || m} style={{
                      background: 'rgba(99,102,241,0.2)', padding: '2px 8px', borderRadius: '10px',
                      fontSize: '11px', color: '#a5b4fc'
                    }}>
                      {m.name || 'Student'}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Reset Button */}
          <button
            onClick={handleReset}
            style={{
              width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.4)',
              background: 'rgba(239,68,68,0.1)', color: '#fca5a5', fontSize: '14px', fontWeight: '600',
              cursor: 'pointer', transition: 'all 0.3s ease'
            }}
          >
            🗑️ Reset Teams
          </button>
        </>
      )}
    </div>
  )
}
