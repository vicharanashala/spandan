import { useState, useEffect, useCallback } from 'react'
import { API_URL } from '../config.js'

const Leaderboard = ({ roomId, token, socket, userId }) => {
  const [leaderboard, setLeaderboard] = useState([])
  // The current student's OWN row, when they rank below the public top 10. Delivered privately
  // (REST "top 10 + me" on mount, or the per-user `leaderboard:you` socket push on each segment fold)
  // so the browser never receives the full ranking. null when the student is inside the top 10.
  const [myRow, setMyRow] = useState(null)
  // How many ranks the server broadcasts publicly (the rest see only their own row). Driven by the
  // server's LEADERBOARD_TOP_N and delivered in the REST/socket payloads; defaults to the classic 10.
  const [topN, setTopN] = useState(10)
  const [totalParticipants, setTotalParticipants] = useState(0)
  const [isTeacher, setIsTeacher] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Keep the latest isTeacher available inside the socket listener without rebinding it.
  const isTeacherRef = useRef(false)
  useEffect(() => { isTeacherRef.current = isTeacher }, [isTeacher])

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
      setTotalParticipants(data.totalParticipants)
      setIsTeacher(data.isTeacher)
      setError(null) // recovered — clear any stale error so a past blip doesn't keep hiding the board
      setLoading(false)
    } catch (err) {
      // Transient blip (server restart / request timeout / network) — retry a couple times with
      // backoff before surfacing an error. A live socket push also clears a stuck error independently,
      // so the board self-heals on the next segment even if every retry here fails.
      if (retries > 0) {
        setTimeout(() => fetchLeaderboard({ retries: retries - 1, backoffMs: backoffMs * 2 }), backoffMs)
        return
      }
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

  // Only surface the error when we have nothing to show. If a board (or the student's own row) is
  // already loaded, a later transient blip must not blank it — the next fetch retry / socket push clears it.
  if (error && leaderboard.length === 0 && !myRow) {
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

  const renderRank = (entry) => {
    const rank = entry.rank
    // Identify "you" by id, not by array position or a server flag — robust across the REST board,
    // the public top-10 push, and the private own-row push.
    const isCurrentUser = String(entry.studentId) === String(userId)

    // Top-3 and the current-user row always render on a LIGHT gradient background in BOTH themes
    // (gold/silver/bronze/blue). var(--text-primary) flips to near-white in dark mode, which made
    // these rows unreadable. Pin their text to the light-mode dark values so light mode is unchanged
    // and dark mode stays legible.
    const isHighlighted = rank <= 3 || isCurrentUser
    const nameColor = isHighlighted ? '#1f2937' : 'var(--text-primary)'
    const subColor = isHighlighted ? '#6b7280' : 'var(--text-secondary)'
    const pointsColor = rank === 1 ? '#f59e0b' : isHighlighted ? '#1f2937' : 'var(--text-primary)'

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
        flexShrink: 0,
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
            color: nameColor,
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
            color: subColor,
            marginTop: '2px'
          }}>
            {entry.correctCount}/{entry.totalAnswered} correct
          </div>
        </div>

        <div style={{
          fontSize: '16px',
          fontWeight: '700',
          color: pointsColor,
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

  // Ellipsis marking the gap between the top 10 and the student's own (lower) rank.
  const renderGap = () => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '8px 0',
      color: 'var(--text-secondary)',
      fontSize: '12px',
      flexShrink: 0
    }}>
      •••
    </div>
  )

  // Show the student's own row (with a ••• gap) only when they rank below the public top N.
  const showOwnRow = !isTeacher && myRow && myRow.rank > topN

  return (
    <div style={{ position: 'relative', width: '100%', minWidth: 0, maxWidth: '100%' }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        overflowX: 'hidden',
        overflowY: 'auto',
        maxHeight: '60vh',
        boxSizing: 'border-box'
      }}>
        {leaderboard.map((entry) => renderRank(entry))}

        {/* Student ranked below the top 10: a ••• gap then their OWN row (delivered privately). */}
        {showOwnRow && (
          <>
            {renderGap()}
            {renderRank(myRow)}
          </>
        )}

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
      {/* Fade hint when the board overflows */}
      {leaderboard.length > 8 && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '32px', background: 'linear-gradient(to bottom, rgba(var(--bg-card-rgb), 0), rgba(var(--bg-card-rgb), 1))', pointerEvents: 'none' }} />
      )}
    </div>
  )
}

export default Leaderboard
