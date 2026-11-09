import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import useIsMobile from '../hooks/useIsMobile'
import { classApi } from '../lib/api'
import { PageHeader, pageWash, primaryButton, RoomCard, Pill, EmptyState, iconButton } from '../components/AppUI'
import { SectionLabel } from '../components/InsightUI'
import { Clapperboard, Inbox, Mic, Plus, Settings, Trash2 } from 'lucide-react'
import { Ico } from '../components/icons'

function ManageRoomPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { user, token } = useAuthStore()
  const { rooms, isLoading, fetchRooms, deleteRoom, setAuthToken } = useRoomStore()
  const [classes, setClasses] = React.useState([])

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      fetchRooms()
      classApi.getAll().then(d => setClasses(d.classes || [])).catch(() => {})
    }
  }, [token])

  const handleDeleteRoom = async (roomId) => {
    if (window.confirm('Are you sure you want to delete this room?')) {
      try {
        await deleteRoom(roomId)
      } catch (err) {
        console.error('Failed to delete room:', err)
      }
    }
  }

  // Filter only active rooms (not ended)
  const activeRooms = rooms?.filter(r => !r.endedAt) || []

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' }}>
      <Sidebar user={user} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 'var(--sidebar-width, 240px)', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
        <PageHeader isMobile={isMobile} icon={Settings} title="Manage Rooms" subtitle="View and manage your active classrooms" />

        {/* Content */}
        <div style={{ flex: 1, padding: isMobile ? '16px' : '28px 32px 32px', boxSizing: 'border-box', maxWidth: '100%', background: pageWash }}>
          <SectionLabel actions={<button onClick={() => navigate('/teacher/create-room')} style={primaryButton(false, { padding: '9px 16px', fontSize: 13 })}><Ico as={Plus} /> New room</button>}>
            {`Active rooms${!isLoading && activeRooms.length ? ` · ${activeRooms.length}` : ''}`}
          </SectionLabel>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-secondary)' }}>Loading rooms…</div>
          ) : activeRooms.length > 0 ? (
            <div data-tour="room-list" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {activeRooms.map((room, i) => {
                const isClass = Boolean(room.classId)
                const classObj = isClass ? classes?.find(c => String(c._id) === String(room.classId?._id || room.classId)) : null
                const displayCode = isClass ? (classObj?.code || (typeof room.classId === 'object' ? room.classId?.code : null)) : room.code
                return (
                <RoomCard
                  key={room._id}
                  icon={room.settings?.mode === 'video' ? Clapperboard : Mic}
                  tint={room.settings?.mode === 'video' ? '#ec4899' : 'var(--accent)'}
                  title={room.name}
                  code={displayCode}
                  status={<span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}><Pill tone="#10b981" dot>Active</Pill>{room.settings?.mode === 'video' && <Pill tone="#ec4899">Video</Pill>}</span>}
                  meta={[`${room.questionCount || 0} question${room.questionCount === 1 ? '' : 's'}`]}
                  actionLabel="Manage →"
                  tourAction={i === 0 ? 'manage-button' : undefined}
                  onOpen={() => navigate(`/teacher/room/${room._id}`)}
                  onAction={() => navigate(`/teacher/room/${room._id}`)}
                  extraActions={
                    <button type="button" aria-label={`Delete room ${room.name}`} title="Delete room" onClick={(e) => { e.stopPropagation(); handleDeleteRoom(room._id) }} style={iconButton('#ef4444')}><Ico as={Trash2} /></button>
                  }
                />
              )})}
            </div>
          ) : (
            <EmptyState icon={Inbox} title="No active rooms" description="Rooms you create stay here until you end them.">
              <button onClick={() => navigate('/teacher/create-room')} style={primaryButton(false)}><Ico as={Plus} /> Create a room</button>
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  )
}

export default ManageRoomPage
