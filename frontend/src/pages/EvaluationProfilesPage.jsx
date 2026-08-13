// Teacher page: list / create / edit / duplicate / delete evaluation profiles.
//
// Styling follows existing conventions in this codebase:
//   - inline style={{...}} (no Tailwind)
//   - Sidebar + header + content layout used in DashboardPage / ManageRoomPage
//   - profile state via Zustand stores (token pulled with useAuthStore.getState().token)
// All raw API calls go through services/evaluationProfileService.js.

import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import EvaluationProfileFormModal from '../components/EvaluationProfileFormModal'
import EvaluationScoresModal from '../components/EvaluationScoresModal'
import {
  fetchCriteria,
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  duplicateProfile,
  previewOrApplyProfile
} from '../services/evaluationProfileService'
import { API_URL } from '../config.js'

function ProfileCard({ profile, criteriaMeta, onEdit, onDuplicate, onDelete, onPreviewRoom }) {
  const total = profile.criteria?.reduce((s, c) => s + (Number(c.weight) || 0), 0) || 0
  return (
    <div style={{
      padding: '20px',
      background: 'var(--bg-card)',
      borderRadius: '16px',
      border: '1px solid var(--border-color)',
      boxShadow: 'var(--card-shadow)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }}>
      <div>
        <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>{profile.name}</div>
        {profile.description && (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>{profile.description}</div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {(profile.criteria || []).map((c) => {
          const meta = criteriaMeta.find((m) => m.key === c.key)
          return (
            <div key={c.key} style={{ display: 'flex', flexDirection: 'column', fontSize: '13px', color: 'var(--text-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{meta?.label || c.key}</span>
                <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  {(Number(c.weight) * 100).toFixed(0)}%
                </span>
              </div>
              {c.key === 'incorrect_responses' && c.penalty > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#dc2626', fontWeight: '600', paddingLeft: '8px' }}>
                  <span>↳ Penalty</span>
                  <span>-{(Number(c.penalty) * 100).toFixed(0)}%</span>
                </div>
              )}
            </div>
          )
        })}
        <div style={{
          marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed var(--border-color)',
          display: 'flex', justifyContent: 'space-between', fontSize: '12px',
          fontWeight: '700', color: Math.abs(total - 1) <= 0.001 ? '#059669' : '#dc2626'
        }}>
          <span>Total</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{(total * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
        <button
          onClick={() => onEdit(profile)}
          style={{ padding: '6px 12px', background: 'transparent', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
        >
          Edit
        </button>
        <button
          onClick={() => onDuplicate(profile)}
          style={{ padding: '6px 12px', background: 'transparent', color: '#7c3aed', border: '1px solid #7c3aed', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
        >
          Duplicate
        </button>
        <button
          onClick={() => onDelete(profile)}
          style={{ padding: '6px 12px', background: 'transparent', color: '#dc2626', border: '1px solid #dc2626', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
        >
          Delete
        </button>
        {/* Server-side validation guarantees weights sum to 1; if any profile ever drifts,
            Preview is disabled so the user can't ship a broken one. */}
        <button
          onClick={() => onPreviewRoom(profile)}
          disabled={Math.abs(total - 1) > 0.001}
          title={Math.abs(total - 1) > 0.001 ? 'Weights must sum to 100% before preview' : 'Apply to a room'}
          style={{
            marginLeft: 'auto',
            padding: '6px 14px',
            background: Math.abs(total - 1) > 0.001 ? '#9ca3af' : '#7c3aed',
            color: 'white', border: 'none', borderRadius: '6px',
            fontSize: '12px', fontWeight: '600',
            cursor: Math.abs(total - 1) > 0.001 ? 'not-allowed' : 'pointer'
          }}
        >
          Use Profile →
        </button>
      </div>
    </div>
  )
}
function RoomRow({ room, onPick, isSelected, selectionMode }) {
  const borderStyle = isSelected
    ? '2px solid #7c3aed'
    : '1px solid #e5e7eb';
  const backgroundStyle = isSelected
    ? '#f3e8ff'
    : '#f9fafb';

  return (
    <button
      onClick={() => onPick(room)}
      style={{
        textAlign: 'left',
        padding: '10px 12px',
        background: backgroundStyle,
        border: borderStyle,
        borderRadius: '8px',
        cursor: 'pointer',
        color: '#1f2937',
        fontSize: '14px',
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
    >
      <div>
        <div style={{ fontWeight: '600' }}>{room.name}</div>
        <div style={{ fontSize: '12px', color: '#6b7280' }}>Code: {room.code}</div>
      </div>
      {selectionMode === 'multiple' && (
        <input
          type="checkbox"
          checked={isSelected}
          readOnly
          style={{ cursor: 'pointer' }}
        />
      )}
    </button>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{children}</div>
    </div>
  )
}

function RoomPickerModal({ open, onClose, onPick, profile }) {
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectionMode, setSelectionMode] = useState('single')
  const [selectedRoomIds, setSelectedRoomIds] = useState([])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError('')
    setSelectionMode('single')
    setSelectedRoomIds([])
    const token = useAuthStore.getState().token
    fetch(`${API_URL}/rooms`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.json())
      .then((d) => setRooms(d.rooms || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  const ended = rooms.filter((r) => r.endedAt)
  const active = rooms.filter((r) => !r.endedAt)

  const handleRowClick = (room) => {
    if (selectionMode === 'single') {
      onPick(room)
    } else {
      setSelectedRoomIds((prev) =>
        prev.includes(room._id)
          ? prev.filter((id) => id !== room._id)
          : [...prev, room._id]
      )
    }
  }

  const handleApplyMultiple = () => {
    if (selectedRoomIds.length === 0) return
    const selectedRooms = rooms.filter((r) => selectedRoomIds.includes(r._id))
    onPick(selectedRooms)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 9999
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: '16px', padding: '24px',
          width: '90%', maxWidth: '500px', maxHeight: '80vh',
          overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1f2937' }}>
              Apply "{profile?.name}" to a room
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
              Preview computes the scores live on the server. Ended sessions return more data than live ones.
            </p>
          </div>
          <div>
            <select
              value={selectionMode}
              onChange={(e) => {
                setSelectionMode(e.target.value)
                setSelectedRoomIds([])
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '13px',
                background: 'white',
                color: '#374151',
                cursor: 'pointer'
              }}
              aria-label="Selection Mode"
            >
              <option value="single">Single Room</option>
              <option value="multiple">Multiple Rooms</option>
            </select>
          </div>
        </div>

        {loading && <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Loading rooms…</div>}
        {error && <div style={{ padding: '10px', background: '#fef2f2', color: '#dc2626', borderRadius: '8px', fontSize: '13px' }}>{error}</div>}

        {!loading && !error && (
          <div style={{ marginTop: '16px' }}>
            {ended.length > 0 && (
              <Section title="Ended sessions">
                {ended.map((r) => (
                  <RoomRow
                    key={r._id}
                    room={r}
                    onPick={handleRowClick}
                    isSelected={selectedRoomIds.includes(r._id)}
                    selectionMode={selectionMode}
                  />
                ))}
              </Section>
            )}
            {active.length > 0 && (
              <Section title="Active sessions (preview will reflect responses so far)">
                {active.map((r) => (
                  <RoomRow
                    key={r._id}
                    room={r}
                    onPick={handleRowClick}
                    isSelected={selectedRoomIds.includes(r._id)}
                    selectionMode={selectionMode}
                  />
                ))}
              </Section>
            )}
            {ended.length === 0 && active.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
                No rooms yet. Create a room from your dashboard.
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            onClick={onClose}
            style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
          >
            Cancel
          </button>
          {selectionMode === 'multiple' && (
            <button
              onClick={handleApplyMultiple}
              disabled={selectedRoomIds.length === 0}
              style={{
                padding: '10px 20px',
                background: selectedRoomIds.length === 0 ? '#9ca3af' : '#7c3aed',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: selectedRoomIds.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              Apply to Selected ({selectedRoomIds.length})
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
function EvaluationProfilesPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [profiles, setProfiles] = useState([])
  const [criteriaMeta, setCriteriaMeta] = useState([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Room picker / preview state
  const [pickerFor, setPickerFor] = useState(null)
  const [scoresModal, setScoresModal] = useState(null) // { title, subtitle, result, loading, error }

  const load = useCallback(async () => {
    setLoading(true); setLoadError('')
    try {
      const [list, criteria] = await Promise.all([listProfiles(), fetchCriteria()])
      setProfiles(list)
      setCriteriaMeta(criteria.criteria || [])
    } catch (e) {
      setLoadError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (p) => { setEditing(p); setFormOpen(true) }
  const closeForm = () => { if (submitting) return; setFormOpen(false); setEditing(null) }

  const handleSubmit = async (payload) => {
    setSubmitting(true)
    try {
      if (editing) await updateProfile(editing._id, payload)
      else await createProfile(payload)
      setFormOpen(false); setEditing(null)
      await load()
    } catch (e) {
      // Surface inline by reopening the form with the error message — simplest: alert-style.
      alert(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDuplicate = async (p) => {
    try { await duplicateProfile(p._id); await load() } catch (e) { alert(e.message) }
  }

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete profile "${p.name}"? This cannot be undone.`)) return
    try { await deleteProfile(p._id); await load() } catch (e) { alert(e.message) }
  }

  const handlePreviewRoom = (p) => setPickerFor(p)

  const handlePickRoom = async (roomOrRooms) => {
    const profile = pickerFor
    setPickerFor(null)
    const isMulti = Array.isArray(roomOrRooms)
    const title = `Preview · ${profile.name}`

    if (isMulti) {
      const roomNames = roomOrRooms.map((r) => r.name).join(', ')
      setScoresModal({
        title,
        subtitle: `Multiple rooms: ${roomNames}`,
        result: null,
        loading: true,
        error: '',
        profile
      })
      try {
        const roomIds = roomOrRooms.map((r) => r._id)
        const result = await previewOrApplyProfile(profile._id, roomIds, 'apply')
        setScoresModal({
          title,
          subtitle: `Multiple rooms`,
          result,
          loading: false,
          error: '',
          profile
        })
      } catch (e) {
        setScoresModal({
          title,
          subtitle: `Multiple rooms`,
          result: null,
          loading: false,
          error: e.message,
          profile
        })
      }
    } else {
      setScoresModal({
        title,
        subtitle: `${roomOrRooms.name} (code ${roomOrRooms.code})`,
        result: null,
        loading: true,
        error: '',
        profile
      })
      try {
        const result = await previewOrApplyProfile(profile._id, roomOrRooms._id, 'preview')
        setScoresModal({
          title,
          subtitle: `${roomOrRooms.name} (code ${roomOrRooms.code})`,
          result,
          loading: false,
          error: '',
          profile
        })
      } catch (e) {
        setScoresModal({
          title,
          subtitle: `${roomOrRooms.name} (code ${roomOrRooms.code})`,
          result: null,
          loading: false,
          error: e.message,
          profile
        })
      }
    }
  }

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <Sidebar user={user} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px' }}>
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>📊 Teacher Evaluation Profiles</h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
                Combine weighted classroom metrics into a reusable score per student.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <div style={{ flex: 1, padding: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
              Profiles are reusable across any session. Preview computes scores live — no data is modified.
            </p>
            <button
              onClick={openCreate}
              style={{ padding: '10px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
            >
              + Create Profile
            </button>
          </div>

          {loadError && (
            <div style={{ padding: '12px', background: '#fef2f2', color: '#dc2626', borderRadius: '8px', marginBottom: '16px' }}>
              {loadError}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading profiles…</div>
          ) : profiles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📈</div>
              <div style={{ fontSize: '16px', fontWeight: '600' }}>No profiles yet</div>
              <div style={{ fontSize: '13px', marginTop: '6px' }}>Click <strong>Create Profile</strong> to author your first one.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
              {profiles.map((p) => (
                <ProfileCard
                  key={p._id}
                  profile={p}
                  criteriaMeta={criteriaMeta}
                  onEdit={openEdit}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onPreviewRoom={handlePreviewRoom}
                />
              ))}
            </div>
          )}

          <div style={{ marginTop: '24px' }}>
            <button
              onClick={() => navigate('/teacher')}
              style={{ padding: '8px 16px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      <EvaluationProfileFormModal
        open={formOpen}
        onClose={closeForm}
        onSubmit={handleSubmit}
        initialProfile={editing}
        busy={submitting}
      />

      <RoomPickerModal
        open={!!pickerFor}
        onClose={() => setPickerFor(null)}
        onPick={handlePickRoom}
        profile={pickerFor}
      />

      <EvaluationScoresModal
        open={!!scoresModal}
        onClose={() => setScoresModal(null)}
        title={scoresModal?.title}
        subtitle={scoresModal?.subtitle}
        result={scoresModal?.result}
        loading={scoresModal?.loading}
        error={scoresModal?.error}
        criteriaMeta={criteriaMeta}
        profile={scoresModal?.profile}
      />
    </div>
  )
}

export default EvaluationProfilesPage