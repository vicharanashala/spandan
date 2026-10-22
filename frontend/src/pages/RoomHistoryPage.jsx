import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import useIsMobile from '../hooks/useIsMobile'
import { PageHeader, pageWash, inputStyle, RoomCard, Pill, EmptyState, iconButton } from '../components/AppUI'
import { SectionLabel } from '../components/InsightUI'
import { API_URL } from '../config.js'
import { Clapperboard, Download, History as HistoryIcon, Mic, Search as SearchIcon } from 'lucide-react'
import { Ico } from '../components/icons'

function RoomHistoryPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { user, token } = useAuthStore()
  const { rooms, isLoading, fetchRooms, setAuthToken } = useRoomStore()
  const [downloadingId, setDownloadingId] = React.useState(null)
  const [query, setQuery] = React.useState('')

  // Download a room's complete results as a CSV (teacher-only endpoint; needs the auth
  // header, so we fetch as a Blob and trigger the download rather than using a plain link).
  const downloadCsv = async (room) => {
    setDownloadingId(room._id)
    try {
      const res = await fetch(`${API_URL}/responses/room/${room._id}/export`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const date = room.endedAt ? new Date(room.endedAt).toISOString().slice(0, 10) : 'session'
      const safe = (room.name || 'room').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60)
      a.href = url
      a.download = `Spandan_${safe}_${date}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Could not download the results CSV. Please try again.')
    } finally {
      setDownloadingId(null)
    }
  }

  const [coHostHistoryRooms, setCoHostHistoryRooms] = React.useState([])

  const fetchCoHostHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/rooms/teacher/cohost/history`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setCoHostHistoryRooms(data.rooms || [])
      }
    } catch (e) {
      console.error('Failed to fetch cohost room history:', e)
    }
  }

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      // Students use dedicated endpoint for their room history
      if (user?.role === 'student') {
        useRoomStore.getState().fetchStudentRoomHistory()
      } else {
        fetchRooms()
        fetchCoHostHistory()
      }
    }
  }, [token, user?.role])

  // Filter ended rooms for teacher view (newest first), then by the search box (name or code)
  const endedRooms = (rooms?.filter(r => r.endedAt) || []).slice().sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))
  const q = query.trim().toLowerCase()
  const shown = q ? endedRooms.filter(r => (r.name || '').toLowerCase().includes(q) || (r.code || '').toLowerCase().includes(q)) : endedRooms
  const isTeacher = user?.role === 'teacher'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', maxWidth: '100%', boxSizing: 'border-box', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' }}>
      <Sidebar user={user} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', marginLeft: 'var(--sidebar-width, 240px)', maxWidth: '100%', boxSizing: 'border-box' }}>
        <PageHeader isMobile={isMobile} icon={HistoryIcon} title="Room History" subtitle="View past classroom sessions" />

        {/* Content */}
        <div style={{ flex: 1, padding: isMobile ? '16px' : '28px 32px 32px', maxWidth: '100%', boxSizing: 'border-box', background: pageWash }}>
          <SectionLabel actions={endedRooms.length > 3 && (
            <input type="search" className="app-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or code" aria-label="Search rooms"
              style={inputStyle({ width: isMobile ? '100%' : 260, padding: '9px 12px', fontSize: 13 })} />
          )}>
            {`Ended rooms${endedRooms.length ? ` · ${q ? `${shown.length} of ${endedRooms.length}` : endedRooms.length}` : ''}`}
          </SectionLabel>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-secondary)' }}>Loading rooms…</div>
          ) : shown.length > 0 ? (
            <div data-tour="history-list" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {shown.map((room, i) => (
                <RoomCard
                  key={room._id}
                  icon={room.settings?.mode === 'video' ? Clapperboard : Mic}
                  tint={room.settings?.mode === 'video' ? '#ec4899' : '#64748b'}
                  title={room.name}
                  code={room.code}
                  status={<Pill tone="#64748b">{`Ended ${room.endedAt ? new Date(room.endedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`}</Pill>}
                  actionLabel="View Results →"
                  tourAction={i === 0 ? 'view-results' : undefined}
                  onAction={() => navigate(`/${isTeacher ? 'teacher' : 'student'}/room/${room._id}/results`)}
                  extraActions={isTeacher && (
                    <button
                      type="button"
                      data-tour={i === 0 ? 'csv-button' : undefined}
                      onClick={(e) => { e.stopPropagation(); downloadCsv(room) }}
                      disabled={downloadingId === room._id}
                      title="Download complete results as CSV"
                      aria-label={`Download results CSV for ${room.name}`}
                      style={{ ...iconButton('var(--accent)'), width: 'auto', padding: '0 12px', fontSize: 12.5, cursor: downloadingId === room._id ? 'wait' : 'pointer' }}
                    >
                      {downloadingId === room._id ? '…' : <><Ico as={Download} /> CSV</>}
                    </button>
                  )}
                />
              ))}
            </div>
          ) : q ? (
            <EmptyState icon={SearchIcon} title="No rooms match your search" description={`Nothing named or coded "${query}". Try a shorter search.`} />
          ) : (
            <EmptyState icon={HistoryIcon} title="No ended rooms yet" description="Rooms you end will appear here for review." />
          )}

          {/* Joined as Co-Host Section for Teachers */}
          {user?.role === 'teacher' && coHostHistoryRooms.length > 0 && (
            <div style={{ marginTop: '40px' }}>
              <h2 style={{
                margin: '0 0 24px',
                fontSize: isMobile ? '17px' : '18px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>🤝</span> Joined as Co-Host
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px'
              }}>
                {coHostHistoryRooms.map((room) => (
                  <div
                    key={room._id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '22px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-lg)',
                      boxShadow: 'var(--shadow-md)',
                      minHeight: '140px',
                      minWidth: 0,
                      boxSizing: 'border-box'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'inline-block', padding: '2px 8px', background: 'rgba(59,130,246,0.15)', color: 'var(--accent)', borderRadius: '12px', fontSize: '11px', fontWeight: 700, marginBottom: '8px' }}>
                        CO-HOST SESSION
                      </div>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px', letterSpacing: '-0.01em' }}>
                        {room.name}
                      </h3>
                      <p style={{ margin: '0 0 6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Host: {room.teacher?.name || 'Teacher'}
                      </p>
                      <p style={{ margin: '0 0 6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Code: <strong style={{ color: 'var(--accent)', letterSpacing: '1px' }}>{room.code}</strong>
                      </p>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {room.endedAt ? `Ended ${new Date(room.endedAt).toLocaleDateString()}` : 'Active session'}
                      </p>
                    </div>
                    <div style={{ marginTop: '18px', display: 'flex', gap: '10px' }}>
                      <button
                        onClick={() => navigate(`/teacher/room/${room._id}${room.endedAt ? '/results' : ''}`)}
                        style={{
                          flex: 1,
                          padding: '10px 16px',
                          background: 'var(--accent-gradient)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 'var(--radius)',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {room.endedAt ? 'View Results →' : 'Open Room →'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default RoomHistoryPage
