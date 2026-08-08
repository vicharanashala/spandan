import React from 'react'
import { useNavigate } from 'react-router-dom'
import useThemeStore from '../stores/themeStore'
import useRoomStore from '../stores/roomStore'

export default function RoomCard({ room, showDelete = false }) {
  const navigate = useNavigate()
  const { isDark } = useThemeStore()
  const { startRoom, deleteRoom } = useRoomStore()

  const isScheduled = room.status === 'SCHEDULED' || Boolean(room.scheduledStartTime && room.status !== 'ACTIVE')
  const isPastDue = isScheduled && room.scheduledStartTime && new Date() > new Date(room.scheduledStartTime)

  const background = isPastDue
    ? (isDark ? 'rgba(249, 115, 22, 0.15)' : 'linear-gradient(135deg, #fff7ed, #ffedd5)')
    : 'var(--bg-card)'

  const border = isPastDue
    ? (isDark ? '1px solid rgba(249, 115, 22, 0.5)' : '1px solid #fdba74')
    : isScheduled
    ? '1px solid rgba(234, 179, 8, 0.4)'
    : '1px solid var(--border-color)'

  const badgeBg = isPastDue ? 'rgba(249, 115, 22, 0.25)' : isScheduled ? 'rgba(234,179,8,0.2)' : 'rgba(34,197,94,0.15)'
  const badgeColor = isPastDue ? '#ea580c' : isScheduled ? '#b45309' : '#16a34a'
  const badgeBorder = isPastDue ? '1px solid rgba(249, 115, 22, 0.4)' : isScheduled ? '1px solid rgba(234,179,8,0.4)' : '1px solid rgba(34,197,94,0.3)'
  const badgeText = isScheduled ? 'SCHEDULED' : 'ACTIVE'

  const boxBg = isPastDue ? 'rgba(249, 115, 22, 0.12)' : 'rgba(234, 179, 8, 0.08)'
  const boxBorder = isPastDue ? '1px dashed rgba(249, 115, 22, 0.5)' : '1px dashed rgba(234, 179, 8, 0.4)'
  const boxColor = isPastDue ? '#c2410c' : '#b45309'
  const boxLabel = isPastDue ? '⏰ Time Passed:' : '⏰ Scheduled:'

  const handleStart = async (e) => {
    e.stopPropagation()
    try {
      await startRoom(room._id)
      navigate(`/teacher/room/${room._id}`)
    } catch (err) {
      alert(err.message || 'Failed to start room')
    }
  }

  const handleDelete = async (e) => {
    e.stopPropagation()
    if (window.confirm(`Are you sure you want to delete "${room.name}"?`)) {
      try {
        await deleteRoom(room._id)
      } catch (err) {
        alert(err.message || 'Failed to delete room')
      }
    }
  }

  return (
    <div
      onClick={() => navigate(`/teacher/room/${room._id}`)}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'var(--shadow-md)'
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: showDelete ? '24px' : '20px',
        background,
        borderRadius: 'var(--radius-lg)',
        border,
        boxShadow: 'var(--shadow-md)',
        minHeight: showDelete ? '150px' : '140px',
        minWidth: 0,
        cursor: 'pointer',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease',
        boxSizing: 'border-box'
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
          <h3 style={{
            margin: 0,
            fontSize: showDelete ? '17px' : '16px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
            overflow: showDelete ? 'hidden' : 'visible',
            textOverflow: showDelete ? 'ellipsis' : 'clip',
            whiteSpace: showDelete ? 'nowrap' : 'normal'
          }}>
            {room.name}
          </h3>
          <span style={{
            fontSize: '10px',
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            background: badgeBg,
            color: badgeColor,
            border: badgeBorder
          }}>
            {showDelete && badgeText === 'SCHEDULED' ? 'Scheduled' : badgeText}
          </span>
        </div>

        <p style={{ margin: showDelete ? '0 0 6px' : '0 0 4px', fontSize: showDelete ? '13px' : '12px', color: 'var(--text-secondary)' }}>
          Code: <strong style={{ color: 'var(--accent)', letterSpacing: '1px' }}>{room.code}</strong>
        </p>

        {isScheduled && room.scheduledStartTime && (
          <div style={{
            margin: showDelete ? '8px 0' : '6px 0',
            padding: '6px 10px',
            background: boxBg,
            borderRadius: '6px',
            border: boxBorder,
            fontSize: showDelete ? '12px' : '11px',
            fontWeight: 600,
            color: boxColor,
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <span>{boxLabel}</span>
            <span>
              {new Date(room.scheduledStartTime).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>
        )}

        <p style={{ margin: 0, fontSize: showDelete ? '13px' : '12px', color: 'var(--text-secondary)' }}>
          {room.questionCount || 0} questions
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: showDelete ? '20px' : '16px', flexWrap: showDelete ? 'wrap' : 'nowrap' }}>
        {isScheduled && (
          <button
            onClick={handleStart}
            style={{
              flex: 1,
              minWidth: 0,
              padding: showDelete ? '11px 14px' : '9px 12px',
              background: '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            ▶ Start
          </button>
        )}

        {showDelete ? (
          <>
            <button
              onClick={() => navigate(`/teacher/room/${room._id}`)}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '11px 14px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius)',
                fontSize: '13px',
                fontWeight: 600,
                whiteSpace: 'nowrap'
              }}
            >
              Manage →
            </button>
            <button
              onClick={handleDelete}
              style={{
                padding: '11px 14px',
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius)',
                fontSize: '13px',
                fontWeight: 600
              }}
            >
              🗑 Delete
            </button>
          </>
        ) : (
          <button
            onClick={() => navigate(`/teacher/room/${room._id}`)}
            style={{
              flex: 1,
              padding: '9px 12px',
              background: 'var(--nav-hover)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Manage →
          </button>
        )}
      </div>
    </div>
  )
}
