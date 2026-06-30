import { useState, useEffect } from 'react'
import { API_URL } from '../config.js'

const Leaderboard = ({ roomId, token, socket, anonymousMode = false }) => {
  const [leaderboard, setLeaderboard] = useState([])
  const [userRank, setUserRank] = useState(null)
  const [totalParticipants, setTotalParticipants] = useState(0)
  const [isTeacher, setIsTeacher] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const getDisplayName = (entry) => {
    if (anonymousMode || isTeacher) {
      return `Student ${entry.rank}`
    }
    return entry.studentName
  }

  const fetchLeaderboard = async () => {
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
      } else {
        setError('Failed to load leaderboard')
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err)
      setError('Failed to load leaderboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!roomId) return
    fetchLeaderboard()

    // Listen for points:updated events
    if (socket) {
      socket.on('points:updated', () => {
        console.log('[Leaderboard] Points updated, refreshing...')
        fetchLeaderboard()
      })
      return () => socket.off('points:updated')
    }
  }, [roomId, socket])

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
        fontSize: '13px'
      }}>
        {error}
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
            maxWidth: '100%'
          }}>
            {getDisplayName(entry)}{isCurrentUser ? ' (You)' : ''}
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