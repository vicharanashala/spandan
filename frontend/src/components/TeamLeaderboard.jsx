import { useState, useEffect, useCallback } from 'react'
import { API_URL } from '../config.js'

/**
 * TeamLeaderboard — drop-in replacement wrapper for the Leaderboard box.
 *
 * Renders a tab switcher (Individual | Teams) inside the same leaderboard
 * card. The Individual tab renders the existing Leaderboard component
 * unchanged; the Teams tab renders a live team score board.
 *
 * Props:
 *   roomId   {string}  — MongoDB _id of the room
 *   token    {string}  — JWT auth token
 *   socket   {Socket}  — Socket.IO client instance
 *   IndividualLeaderboard {React.Component} — the existing Leaderboard component
 */
const TeamLeaderboard = ({ roomId, token, socket, IndividualLeaderboard }) => {
  const [activeTab, setActiveTab] = useState('Individual')
  const [teams, setTeams] = useState([])
  const [teamsLoading, setTeamsLoading] = useState(true)
  const [teamsError, setTeamsError] = useState(null)

  // ── Fetch teams from API ────────────────────────────────────────────────
  const fetchTeams = useCallback(async () => {
    if (!roomId || !token) return
    try {
      const res = await fetch(`${API_URL}/teams?roomId=${roomId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        // API already returns sorted by totalPoints desc
        setTeams(data.teams)
        setTeamsError(null)
      } else {
        setTeamsError('Failed to load teams')
      }
    } catch (err) {
      console.error('[TeamLeaderboard] fetch error:', err)
      setTeamsError('Failed to load teams')
    } finally {
      setTeamsLoading(false)
    }
  }, [roomId, token])

  // Initial fetch
  useEffect(() => {
    fetchTeams()
  }, [fetchTeams])

  // ── Listen for live team:score:update events ────────────────────────────
  useEffect(() => {
    if (!socket) return

    const handleTeamScoreUpdate = (data) => {
      // Optimistically update the team in state, then re-sort
      setTeams(prev => {
        const updated = prev.map(t =>
          t._id === data.teamId
            ? { ...t, totalPoints: data.totalPoints }
            : t
        )
        return [...updated].sort((a, b) => b.totalPoints - a.totalPoints)
      })
    }

    socket.on('team:score:update', handleTeamScoreUpdate)
    return () => socket.off('team:score:update', handleTeamScoreUpdate)
  }, [socket])

  // ── Styles ─────────────────────────────────────────────────────────────
  const tabBarStyle = {
    display: 'flex',
    gap: '4px',
    marginBottom: '16px',
    background: 'var(--bg-primary)',
    borderRadius: '10px',
    padding: '4px'
  }

  const tabStyle = (isActive) => ({
    flex: 1,
    padding: '8px 0',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: isActive ? '700' : '500',
    cursor: 'pointer',
    background: isActive ? '#3b82f6' : 'transparent',
    color: isActive ? 'white' : 'var(--text-secondary)',
    transition: 'all 0.2s ease'
  })

  // ── Team row renderer ───────────────────────────────────────────────────
  const renderTeamRow = (team, index) => {
    const rank = index + 1
    const medalMap = { 1: '🥇', 2: '🥈', 3: '🥉' }
    const rankBg = rank === 1
      ? 'linear-gradient(135deg, #fef3c7, #fde68a)'
      : rank === 2
        ? 'linear-gradient(135deg, #f3f4f6, #e5e7eb)'
        : rank === 3
          ? 'linear-gradient(135deg, #fef3c7, #fde68a)'
          : 'var(--bg-primary)'
    const rankBorder = rank <= 3
      ? `2px solid ${rank === 1 ? '#f59e0b' : rank === 2 ? '#9ca3af' : '#d97706'}`
      : '1px solid var(--border-color)'
    const pointsColor = rank === 1 ? '#f59e0b' : 'var(--text-primary)'

    return (
      <div key={team._id} style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 10px',
        background: rankBg,
        borderRadius: '10px',
        border: rankBorder,
        boxSizing: 'border-box',
        width: '100%'
      }}>
        {/* Rank badge */}
        <span style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: rank === 1 ? '#f59e0b' : rank === 2 ? '#6b7280' : rank === 3 ? '#d97706' : 'var(--border-color)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: '700',
          flexShrink: 0
        }}>
          {rank <= 3 ? medalMap[rank] : rank}
        </span>

        {/* Team info */}
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {team.name}
          </div>
          <div style={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
            marginTop: '2px'
          }}>
            {(team.memberIds || []).length} member{(team.memberIds || []).length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Points */}
        <div style={{
          fontSize: '16px',
          fontWeight: '700',
          color: pointsColor,
          textAlign: 'right',
          flexShrink: 0,
          minWidth: '50px'
        }}>
          {team.totalPoints}
          <span style={{ fontSize: '10px', fontWeight: '500', marginLeft: '2px' }}>pts</span>
        </div>
      </div>
    )
  }

  // ── Teams tab content ───────────────────────────────────────────────────
  const renderTeamsTab = () => {
    if (teamsLoading) {
      return (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
          Loading teams...
        </div>
      )
    }
    if (teamsError) {
      return (
        <div style={{ padding: '20px', textAlign: 'center', color: '#ef4444', fontSize: '13px' }}>
          {teamsError}
        </div>
      )
    }
    if (teams.length === 0) {
      return (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
          No teams yet. The teacher can create teams from the room management panel.
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        {teams.map((team, index) => renderTeamRow(team, index))}
      </div>
    )
  }

  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      {/* Tab switcher */}
      <div style={tabBarStyle} role="tablist">
        <button
          id="tab-individual"
          role="tab"
          aria-selected={activeTab === 'Individual'}
          onClick={() => setActiveTab('Individual')}
          style={tabStyle(activeTab === 'Individual')}
        >
          👤 Individual
        </button>
        <button
          id="tab-teams"
          role="tab"
          aria-selected={activeTab === 'Teams'}
          onClick={() => setActiveTab('Teams')}
          style={tabStyle(activeTab === 'Teams')}
        >
          🏅 Teams
        </button>
      </div>

      {/* Tab panels */}
      {activeTab === 'Individual' ? (
        <IndividualLeaderboard roomId={roomId} token={token} socket={socket} />
      ) : (
        renderTeamsTab()
      )}
    </div>
  )
}

export default TeamLeaderboard
