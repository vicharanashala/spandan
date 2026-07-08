import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import PerformanceChart from '../components/PerformanceChart'
import { API_URL } from '../config.js'

function StudentDashboard() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { socket, isConnected, joinRoom, leaveRoom } = useSocketStore()
  const { activeRooms, joinRoomByCode, setAuthToken, fetchActiveRooms } = useRoomStore()
  
  const [roomCode, setRoomCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [stats, setStats] = useState({
    totalRooms: 0,
    pollsTaken: 0,
    pollsMissed: 0,
    average: 0
  })

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      fetchStudentStats()
      fetchActiveRooms()
    }
  }, [token])

  const fetchStudentStats = async () => {
    try {
      const res = await fetch(`${API_URL}/responses/stats/student/${user._id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.stats) {
        setStats({
          totalRooms: data.stats.totalRooms || 0,
          pollsTaken: data.stats.pollsTaken || 0,
          pollsMissed: data.stats.pollsMissed || 0,
          average: data.stats.average || 0
        })
      }
    } catch (err) {
      console.error('Failed to fetch student stats:', err)
    }
  }

  const handleJoinRoom = async () => {
    if (!roomCode.trim()) return
    setIsJoining(true)
    try {
      const room = await joinRoomByCode(roomCode.trim().toUpperCase())
      joinRoom(room.code, user._id)
      navigate(`/student/session/${room.code}`)
    } catch (err) {
      console.error('Failed to join room:', err)
    } finally {
      setIsJoining(false)
    }
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg-primary)' }}>
      <Sidebar user={user} />

      <div style={{ flex:1, display:'flex', flexDirection:'column', marginLeft:'240px' }}>

        {/* ── Header ── */}
        <header style={{ background:'var(--header-bg)', color:'white', padding:'18px 32px', boxShadow:'0 4px 24px rgba(0,0,0,.25)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap: 'wrap', gap: '20px' }}>
            <div>
              <h1 style={{ margin:0, fontSize:'22px', fontWeight:'800', letterSpacing:'-.4px' }}>
                🎓 Welcome, {user?.name || 'Student'}!
              </h1>
              <p style={{ margin:'3px 0 0', opacity:.75, fontSize:'13px' }}>Join rooms and participate in live polls</p>
            </div>
            
            {/* Gamification Progress */}
            <div style={{ flex: 1, maxWidth: '300px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', fontWeight: '700' }}>
                <span style={{ color: '#a78bfa' }}>⭐ Level {user?.level || 1}</span>
                <span style={{ opacity: 0.8 }}>{user?.xp || 0} / {(user?.level || 1) * 500} XP</span>
              </div>
              <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ 
                  height: '100%', 
                  width: `${Math.min(100, ((user?.xp || 0) / ((user?.level || 1) * 500)) * 100)}%`, 
                  background: 'linear-gradient(90deg, #8b5cf6, #d946ef)',
                  borderRadius: '4px',
                  transition: 'width 0.5s ease-out'
                }} />
              </div>
            </div>

            <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <div style={{ flex:1, padding:'28px 32px' }}>

          {/* ── Dashboard Stats & Chart ── */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:'24px', marginBottom:'28px' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', flex:1 }}>
                {[
                  { icon:'📚', label:'Rooms Joined',  value:stats.totalRooms,  color:'#7c3aed' },
                  { icon:'📈', label:'Average Score', value:`${stats.average}%`, color:'#2563eb' },
                ].map(({ icon, label, value, color }) => (
                  <div key={label} className="stat-card fade-in" style={{ padding:'16px' }}>
                    <div style={{ fontSize:'24px', marginBottom:'6px' }}>{icon}</div>
                    <div style={{ fontSize:'24px', fontWeight:'800', color, lineHeight:1 }}>{value}</div>
                    <div style={{ fontSize:'11px', color:'var(--text-secondary)', marginTop:'6px', fontWeight:'600', textTransform:'uppercase' }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', flex:1 }}>
                {[
                  { icon:'✅', label:'Polls Taken',   value:stats.pollsTaken,  color:'#059669' },
                  { icon:'❌', label:'Polls Missed',  value:stats.pollsMissed, color:'#dc2626' },
                ].map(({ icon, label, value, color }) => (
                  <div key={label} className="stat-card fade-in" style={{ padding:'16px' }}>
                    <div style={{ fontSize:'24px', marginBottom:'6px' }}>{icon}</div>
                    <div style={{ fontSize:'24px', fontWeight:'800', color, lineHeight:1 }}>{value}</div>
                    <div style={{ fontSize:'11px', color:'var(--text-secondary)', marginTop:'6px', fontWeight:'600', textTransform:'uppercase' }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Performance Chart */}
            <div className="card fade-in" style={{ padding:'20px', display:'flex', flexDirection:'column' }}>
              <h2 className="section-title" style={{ marginBottom:'8px' }}>📊 Activity Overview</h2>
              <div style={{ flex:1, minHeight:'180px' }}>
                <PerformanceChart data={[
                  { label: 'Rooms', value: stats.totalRooms, color: 'linear-gradient(135deg,#4c1d95,#7c3aed)' },
                  { label: 'Taken', value: stats.pollsTaken, color: 'linear-gradient(135deg,#065f46,#10b981)' },
                  { label: 'Missed', value: stats.pollsMissed, color: 'linear-gradient(135deg,#991b1b,#ef4444)' }
                ]} height={160} />
              </div>
            </div>
          </div>

          {/* ── Quick Join ── */}
          <div className="card fade-in" style={{ padding:'24px', marginBottom:'24px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'18px' }}>
              <span style={{ fontSize:'18px' }}>🔗</span>
              <div>
                <h2 style={{ margin:0, fontSize:'16px', fontWeight:'700', color:'var(--text-primary)' }}>Quick Join</h2>
                <p style={{ margin:0, fontSize:'12px', color:'var(--text-secondary)' }}>Enter your room code to join a live session</p>
              </div>
            </div>
            <div style={{ display:'flex', gap:'10px' }}>
              <input
                type="text" value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter room code…"
                maxLength={8}
                className="input"
                style={{ flex:1, letterSpacing:'3px', fontWeight:'700', fontSize:'16px', textAlign:'center' }}
                onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
              />
              <button onClick={handleJoinRoom} disabled={isJoining || !roomCode.trim()} className="btn btn-primary" style={{ padding:'10px 24px' }}>
                {isJoining ? '⏳ Joining…' : '🚀 Join Room'}
              </button>
            </div>
          </div>

          {/* ── Previously Joined Active Rooms ── */}
          {activeRooms.length > 0 && (
            <>
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}>
                <h2 style={{ margin:0, fontSize:'16px', fontWeight:'700', color:'var(--text-primary)' }}>🟢 Active Rooms You've Joined</h2>
                <span className="badge badge-green">{activeRooms.length}</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:'16px', marginBottom:'28px' }}>
                {activeRooms.map(room => (
                  <div key={room._id} className="card card-interactive fade-in" style={{ padding:'20px', display:'flex', flexDirection:'column', minHeight:'150px', position:'relative', overflow:'hidden' }}>
                    <div style={{ position:'absolute', top:0, left:0, right:0, height:'3px', background:'linear-gradient(90deg,#059669,#10b981)' }} />
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'10px' }}>
                        <h3 style={{ margin:0, fontSize:'15px', fontWeight:'700', color:'var(--text-primary)' }}>{room.name}</h3>
                        <span className="badge badge-green" style={{ fontSize:'10px' }}>LIVE</span>
                      </div>
                      <p style={{ margin:'0 0 4px', fontSize:'12px', color:'var(--text-secondary)' }}>
                        Code: <strong style={{ color:'var(--accent)', letterSpacing:'2px', fontWeight:'700' }}>{room.code}</strong>
                      </p>
                      <p style={{ margin:0, fontSize:'12px', color:'var(--text-secondary)' }}>
                        {room.questionCount || 0} questions · {room.settings?.timeToAnswer || 30}s each
                      </p>
                    </div>
                    <button onClick={() => navigate(`/student/session/${room.code}`)} className="btn btn-primary" style={{ marginTop:'14px', justifyContent:'center' }}>
                      🔄 Rejoin Room →
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default StudentDashboard