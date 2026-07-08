import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
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
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <h1 style={{ margin:0, fontSize:'22px', fontWeight:'800', letterSpacing:'-.4px' }}>
                🎓 Welcome, {user?.name || 'Student'}!
              </h1>
              <p style={{ margin:'3px 0 0', opacity:.75, fontSize:'13px' }}>Join rooms and participate in live polls</p>
            </div>
            <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <div style={{ flex:1, padding:'28px 32px' }}>

          {/* ── Stat Cards ── */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:'16px', marginBottom:'28px' }}>
            {[
              { icon:'📚', label:'Rooms Joined',  value:stats.totalRooms,  color:'#7c3aed' },
              { icon:'✅', label:'Polls Taken',   value:stats.pollsTaken,  color:'#059669' },
              { icon:'❌', label:'Polls Missed',  value:stats.pollsMissed, color:'#dc2626' },
              { icon:'📈', label:'Score %',       value:`${stats.average}%`, color:'#2563eb' },
            ].map(({ icon, label, value, color }) => (
              <div key={label} className="stat-card fade-in">
                <div style={{ fontSize:'28px', marginBottom:'10px' }}>{icon}</div>
                <div style={{ fontSize:'30px', fontWeight:'800', color, lineHeight:1 }}>{value}</div>
                <div style={{ fontSize:'12px', color:'var(--text-secondary)', marginTop:'6px', fontWeight:'500' }}>{label}</div>
              </div>
            ))}
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