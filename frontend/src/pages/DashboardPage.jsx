import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import useSocketStore from '../stores/socketStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'

function DashboardPage() {
  const navigate = useNavigate()
  const { user, token, isAuthenticated } = useAuthStore()
  const { rooms, currentRoom, isLoading, error, fetchRooms, createRoom, setAuthToken } = useRoomStore()
  const { isConnected } = useSocketStore()
  
  const [roomName, setRoomName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [checked, setChecked] = useState(false)
  const [stats, setStats] = useState({
    totalRooms: 0,
    activeRooms: 0,
    totalPolls: 0,
    totalResponses: 0
  })

  // Initial setup
  useEffect(() => {
    if (token) {
      setAuthToken(token)
      fetchRooms()
      fetchTeacherStats()
    }
    setChecked(true)
  }, [token])

  const fetchTeacherStats = async () => {
    try {
      // Fetch all rooms
      const roomsRes = await fetch(`${API_URL}/rooms`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const roomsData = await roomsRes.json()
      
      const allRooms = roomsData.rooms || []
      const activeRooms = allRooms.filter(r => !r.endedAt)
      
      // Fetch all questions for teacher's rooms
      let totalPolls = 0
      let totalResponses = 0
      
      for (const room of allRooms) {
        const qRes = await fetch(`${API_URL}/questions?roomId=${room._id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const qData = await qRes.json()
        totalPolls += (qData.questions || []).length
        
        const rRes = await fetch(`${API_URL}/responses/stats/room/${room._id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const rData = await rRes.json()
        totalResponses += (rData.stats?.totalResponses || 0)
      }
      
      setStats({
        totalRooms: allRooms.length,
        activeRooms: activeRooms.length,
        totalPolls,
        totalResponses
      })
    } catch (err) {
      console.error('Failed to fetch teacher stats:', err)
    }
  }

  // Redirect to login if no token after initial check
  useEffect(() => {
    if (checked && !token) {
      navigate('/')
    }
  }, [checked, token, navigate])

  const handleCreateRoom = async () => {
    if (!roomName.trim()) return
    setIsCreating(true)
    try {
      await createRoom(roomName.trim())
      setRoomName('')
    } catch (err) {
      console.error('Failed to create room:', err)
    } finally {
      setIsCreating(false)
    }
  }

  // Show spinner while checking
  if (!checked) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'var(--bg-primary)' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:'52px', height:'52px', border:'4px solid var(--border-color)', borderTopColor:'#7c3aed', borderRadius:'50%', animation:'spin 0.9s linear infinite', margin:'0 auto 18px' }} />
          <p style={{ color:'var(--text-secondary)', fontSize:'14px', fontWeight:'500' }}>Loading dashboard…</p>
        </div>
      </div>
    )
  }

  // Stats data - default values (will update later)

  const activeRoomList = (rooms || []).filter(r => !r.endedAt)

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg-primary)' }}>
      <Sidebar user={user} />
      
      <div style={{ flex:1, display:'flex', flexDirection:'column', marginLeft:'240px' }}>

        {/* ── Header ── */}
        <header style={{ background:'var(--header-bg)', color:'white', padding:'18px 32px', boxShadow:'0 4px 24px rgba(0,0,0,.25)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <h1 style={{ margin:0, fontSize:'22px', fontWeight:'800', letterSpacing:'-.4px' }}>
                👋 Welcome back, {user?.name || 'Teacher'}!
              </h1>
              <p style={{ margin:'3px 0 0', opacity:.75, fontSize:'13px' }}>Manage your rooms and launch polls</p>
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
              { icon:'📚', label:'Total Rooms',     value:stats.totalRooms,    color:'#7c3aed' },
              { icon:'🟢', label:'Active Rooms',    value:stats.activeRooms,   color:'#059669' },
              { icon:'📊', label:'Total Polls',     value:stats.totalPolls,    color:'#2563eb' },
              { icon:'💬', label:'Total Responses', value:stats.totalResponses, color:'#db2777' },
            ].map(({ icon, label, value, color }) => (
              <div key={label} className="stat-card fade-in">
                <div style={{ fontSize:'28px', marginBottom:'10px' }}>{icon}</div>
                <div style={{ fontSize:'30px', fontWeight:'800', color, lineHeight:1 }}>{value}</div>
                <div style={{ fontSize:'12px', color:'var(--text-secondary)', marginTop:'6px', fontWeight:'500' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* ── Create Room ── */}
          <div className="card fade-in" style={{ padding:'24px', marginBottom:'24px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'18px' }}>
              <span style={{ fontSize:'18px' }}>✨</span>
              <h2 style={{ margin:0, fontSize:'16px', fontWeight:'700', color:'var(--text-primary)' }}>Create New Room</h2>
            </div>
            <div style={{ display:'flex', gap:'10px' }}>
              <input
                type="text" value={roomName}
                onChange={e => setRoomName(e.target.value)}
                placeholder="Enter room name…"
                className="input"
                style={{ flex:1 }}
                onKeyDown={e => e.key === 'Enter' && handleCreateRoom()}
              />
              <button onClick={handleCreateRoom} disabled={isCreating || !roomName.trim()} className="btn btn-primary">
                {isCreating ? '⏳ Creating…' : '➕ Create Room'}
              </button>
            </div>
          </div>

          {/* ── Active Rooms ── */}
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}>
            <h2 style={{ margin:0, fontSize:'16px', fontWeight:'700', color:'var(--text-primary)' }}>🏠 My Active Rooms</h2>
            {activeRoomList.length > 0 && (
              <span className="badge badge-purple">{activeRoomList.length}</span>
            )}
          </div>

          {isLoading ? (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:'16px' }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height:'140px', borderRadius:'16px' }} />)}
            </div>
          ) : activeRoomList.length > 0 ? (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:'16px' }}>
              {activeRoomList.map(room => (
                <div key={room._id} className="card card-interactive fade-in" style={{ padding:'20px', display:'flex', flexDirection:'column', minHeight:'150px', position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', top:0, left:0, right:0, height:'3px', background:'linear-gradient(90deg,#7c3aed,#a855f7)' }} />
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'10px' }}>
                      <h3 style={{ margin:0, fontSize:'15px', fontWeight:'700', color:'var(--text-primary)' }}>{room.name}</h3>
                      <span className="badge badge-green" style={{ fontSize:'10px' }}>LIVE</span>
                    </div>
                    <p style={{ margin:'0 0 4px', fontSize:'12px', color:'var(--text-secondary)' }}>
                      Code: <strong style={{ color:'var(--accent)', letterSpacing:'2px', fontWeight:'700' }}>{room.code}</strong>
                    </p>
                    <p style={{ margin:0, fontSize:'12px', color:'var(--text-secondary)' }}>{room.questionCount || 0} questions</p>
                  </div>
                  <button onClick={() => navigate(`/teacher/room/${room._id}`)} className="btn btn-primary" style={{ marginTop:'14px', justifyContent:'center' }}>
                    Open Room →
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ textAlign:'center', padding:'52px 32px' }}>
              <div style={{ fontSize:'52px', marginBottom:'16px' }}>📭</div>
              <h3 style={{ color:'var(--text-primary)', fontSize:'18px', fontWeight:'700', margin:'0 0 8px' }}>No active rooms</h3>
              <p style={{ color:'var(--text-secondary)', fontSize:'14px', margin:'0 0 20px' }}>Create your first room above to get started!</p>
              <button onClick={() => navigate('/teacher/create-room')} className="btn btn-primary">
                ➕ Create a Room
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DashboardPage