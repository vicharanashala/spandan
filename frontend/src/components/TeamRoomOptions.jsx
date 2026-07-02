import React from 'react'

const numberInputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  background: 'var(--input-bg)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  boxSizing: 'border-box'
}

function TeamRoomOptions({ value, onChange, compact = false }) {
  const teamMode = {
    enabled: false,
    teamCount: 2,
    teamSize: 4,
    randomizeTeams: true,
    ...(value || {})
  }

  const updateTeamMode = (updates) => {
    onChange({ ...teamMode, ...updates })
  }

  return (
    <div style={{
      marginTop: compact ? '12px' : '20px',
      padding: compact ? '14px' : '16px',
      border: '1px solid var(--border-color)',
      borderRadius: '10px',
      background: 'var(--bg-primary)'
    }}>
      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: '14px',
        fontWeight: '600',
        color: 'var(--text-primary)',
        cursor: 'pointer'
      }}>
        <input
          type="checkbox"
          checked={teamMode.enabled}
          onChange={(e) => updateTeamMode({ enabled: e.target.checked })}
        />
        Enable team quiz mode
      </label>

      {teamMode.enabled && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: compact ? 'repeat(auto-fit, minmax(130px, 1fr))' : 'repeat(2, minmax(0, 1fr))',
          gap: '12px',
          marginTop: '14px'
        }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: '500' }}>
            Number of teams
            <input
              type="number"
              min="1"
              max="50"
              value={teamMode.teamCount}
              onChange={(e) => updateTeamMode({ teamCount: Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
              style={numberInputStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: '500' }}>
            People per team
            <input
              type="number"
              min="1"
              max="200"
              value={teamMode.teamSize}
              onChange={(e) => updateTeamMode({ teamSize: Math.min(200, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
              style={numberInputStyle}
            />
          </label>

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            gridColumn: compact ? 'auto' : '1 / -1',
            color: 'var(--text-primary)',
            fontSize: '13px',
            fontWeight: '500'
          }}>
            <input
              type="checkbox"
              checked={teamMode.randomizeTeams}
              onChange={(e) => updateTeamMode({ randomizeTeams: e.target.checked })}
            />
            Randomize team assignment
          </label>
        </div>
      )}
    </div>
  )
}

export default TeamRoomOptions
