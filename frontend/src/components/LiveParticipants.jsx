import React from 'react'

/**
 * LiveParticipants — shows a list of participants in a room
 * Props:
 *   participants: Array<{ id, name, status }> 
 *   compact: boolean — if true, just shows a count and avatars
 */
export default function LiveParticipants({ participants = [], compact = false }) {
  if (compact) {
    const displayLimit = 3
    const excess = participants.length - displayLimit

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'flex', marginLeft: '8px' }}>
          {participants.slice(0, displayLimit).map((p, i) => (
            <div
              key={p.id}
              className="avatar avatar-sm avatar-ring"
              style={{ marginLeft: '-8px', zIndex: 10 - i }}
              title={p.name}
            >
              {p.name.substring(0, 2)}
            </div>
          ))}
          {excess > 0 && (
            <div
              className="avatar avatar-sm avatar-ring"
              style={{ marginLeft: '-8px', zIndex: 0, background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
            >
              +{excess}
            </div>
          )}
        </div>
        <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
          {participants.length} Participant{participants.length !== 1 && 's'}
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: '20px' }}>
      <h3 className="section-title" style={{ marginBottom: '16px' }}>
        <span>👥</span> Live Participants
        <span className="badge badge-purple" style={{ marginLeft: 'auto' }}>{participants.length}</span>
      </h3>
      
      {participants.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
          No one is here yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
          {participants.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', borderRadius: '8px', background: 'var(--bg-hover)' }}>
              <div className="avatar avatar-md">{p.name.substring(0, 2)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{p.name}</div>
                  <div style={{ fontSize: '10px', background: 'linear-gradient(135deg, #8b5cf6, #d946ef)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>
                    Lvl {p.level || 1}
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <span className={`presence-dot ${p.status === 'online' ? 'presence-online' : 'presence-away'}`}></span>
                  {p.status === 'online' ? 'Active' : 'Away'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
