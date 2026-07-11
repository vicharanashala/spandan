import { useState, useEffect, useCallback } from 'react'
import { API_URL } from '../config.js'

const Leaderboard = ({ roomId, token, socket }) => {
  const [leaderboard, setLeaderboard] = useState([])
  const [userRank, setUserRank] = useState(null)
  const [totalParticipants, setTotalParticipants] = useState(0)
  const [isTeacher, setIsTeacher] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchLeaderboard = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/responses/leaderboard/${roomId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await response.json()
      if (data.success) {
        setLeaderboard(data.leaderboard)
        setUserRank(data.userRank)
        setTotalParticipants(data.totalParticipants)
        setIsTeacher(data.isTeacher)
        setError(null)
      } else {
        setError(data.error || 'Failed to load leaderboard')
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err)
      setError('Couldn’t reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [roomId, token])

  useEffect(() => {
    if (!roomId) return
    fetchLeaderboard()

    // Listen for points:updated events AND socket reconnect
    if (socket) {
      const onPointsUpdate = () => {
        fetchLeaderboard()
      }
      const onReconnect = () => {
        console.log('[Leaderboard] Socket reconnected, refreshing...')
        fetchLeaderboard()
      }
      socket.on('points:updated', onPointsUpdate)
      socket.on('connect', onReconnect)
      return () => {
        socket.off('points:updated', onPointsUpdate)
        socket.off('connect', onReconnect)
      }
    }
  }, [roomId, socket, fetchLeaderboard])

  if (loading) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        color: 'var(--text-secondary)',
        fontSize: '13px'
      }}>
        Loading leaderboard...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        color: '#ef4444',
        fontSize: '13px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div>{error}</div>
        <button
          onClick={() => { setLoading(true); fetchLeaderboard() }}
          style={{
            padding: '6px 14px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'white',
            background: '#3b82f6',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (leaderboard.length === 0) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        color: 'var(--text-secondary)',
        fontSize: '13px'
      }}>
        No responses yet. Leaderboard will appear once students start answering.
      </div>
    )
  }

  const renderRank = (entry, index) => {
    const rank = entry.rank
    const isCurrentUser = entry.isCurrentUser
    
    // If not teacher and there's a gap between current entry and previous
    // AND this entry is the user's rank (and not in top 10 shown), show ellipsis before
    if (!isTeacher && index === 10 && userRank && userRank > 10) {
      // We're showing position 10 (the user's entry), show ellipsis before
      return (
        <>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 0',
            color: 'var(--text-secondary)',
            fontSize: '12px'
          }}>
            •••
          </div>
          <div key={entry.studentId} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 10px',
            minWidth: 0,
            width: '100%',
            maxWidth: '100%',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
            borderRadius: '10px',
            border: '2px solid #3b82f6',
            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
            boxSizing: 'border-box'
          }}>
            <span style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: '#3b82f6',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: '700',
              flexShrink: 0
            }}>
              {rank}
            </span>
            <div style={{ flex: '1 1 auto', minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
              <div style={{
                fontSize: '14px',
                fontWeight: '600',
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%'
              }}>
                {entry.studentName} (You)
              </div>
              <div style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                marginTop: '2px'
              }}>
                {entry.correctCount}/{entry.totalAnswered} correct
              </div>
            </div>
            <div style={{
              fontSize: '16px',
              fontWeight: '700',
              color: '#3b82f6',
              textAlign: 'right',
              flexShrink: 0,
              minWidth: '45px',
              maxWidth: '45px',
              overflow: 'hidden'
            }}>
              {entry.totalPoints}
              <span style={{ fontSize: '10px', fontWeight: '500', marginLeft: '2px' }}>pts</span>
            </div>
          </div>
        </>
      )
    }
    
    return (
      <div key={entry.studentId} style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 10px',
        minWidth: 0,
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
        background: entry.rank === 1 ? 'linear-gradient(135deg, #fef3c7, #fde68a)' :
                     entry.rank === 2 ? 'linear-gradient(135deg, #f3f4f6, #e5e7eb)' :
                     entry.rank === 3 ? 'linear-gradient(135deg, #fef3c7, #fde68a)' : 
                     isCurrentUser ? 'linear-gradient(135deg, #dbeafe, #bfdbfe)' : 'var(--bg-primary)',
        borderRadius: '10px',
        border: entry.rank <= 3 ? `2px solid ${entry.rank === 1 ? '#f59e0b' : entry.rank === 2 ? '#9ca3af' : '#d97706'}` : 
               isCurrentUser ? '2px solid #3b82f6' : '1px solid var(--border-color)'
      }}>
        <span style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: entry.rank === 1 ? '#f59e0b' : entry.rank === 2 ? '#6b7280' : entry.rank === 3 ? '#d97706' : 'var(--border-color)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: '700',
          flexShrink: 0
        }}>
          {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : rank}
        </span>

        <div style={{ flex: '1 1 auto', minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%'
            }}>
              {entry.studentName}{isCurrentUser ? ' (You)' : ''}
            </span>
            {/* Streak Fire badge — only when currentStreak >= 2 */}
            {Number(entry.currentStreak) >= 2 && (
              <span
                title={`On a ${entry.currentStreak}-answer streak (best: ${entry.bestStreak ?? 0})`}
                aria-label={`Streak ${entry.currentStreak}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#b45309',
                  background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                  border: '1px solid #f59e0b',
                  borderRadius: '999px',
                  padding: '1px 6px',
                  flexShrink: 0,
                  lineHeight: 1.4
                }}
              >
                <span style={{ fontSize: '11px' }}>🔥</span>
                <span>{entry.currentStreak}</span>
              </span>
            )}
          </div>
          <div style={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
            marginTop: '2px'
          }}>
            {entry.correctCount}/{entry.totalAnswered} correct
          </div>
        </div>

        <div style={{
          fontSize: '16px',
          fontWeight: '700',
          color: entry.rank === 1 ? '#f59e0b' : 'var(--text-primary)',
          textAlign: 'right',
          flexShrink: 0,
          minWidth: '45px',
          maxWidth: '45px',
          overflow: 'hidden'
        }}>
          {entry.totalPoints}
          <span style={{ fontSize: '10px', fontWeight: '500', marginLeft: '2px' }}>pts</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '8px', 
      width: '100%', 
      minWidth: 0,
      maxWidth: '100%',
      overflowX: 'hidden', 
      boxSizing: 'border-box' 
    }}>
      {leaderboard.map((entry, index) => renderRank(entry, index))}
      
      {/* Show total participants count */}
      {!isTeacher && totalParticipants > 10 && (
        <div style={{
          textAlign: 'center',
          padding: '8px',
          color: 'var(--text-secondary)',
          fontSize: '11px'
        }}>
          {totalParticipants} students in session
        </div>
      )}
    </div>
  )
}

export default Leaderboard