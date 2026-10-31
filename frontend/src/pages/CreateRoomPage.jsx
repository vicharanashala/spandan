import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import useSocketStore from '../stores/socketStore'
import Sidebar from '../components/Sidebar'
import useIsMobile from '../hooks/useIsMobile'
import { PageHeader, pageWash, inputStyle, primaryButton, ghostButton, toneText } from '../components/AppUI'
import { SectionHeader, cardStyle } from '../components/InsightUI'
import { Check, Clapperboard, FileText, Lightbulb, Mic, Plus } from 'lucide-react'
import { Ico, renderIcon } from '../components/icons'

const label = { display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }

function CreateRoomPage() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { createRoom, setAuthToken } = useRoomStore()
  const isMobile = useIsMobile()

  const [roomName, setRoomName] = useState('')
  const [mode, setMode] = useState('normal')
  const [videoUrl, setVideoUrl] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')

  // Video Mode needs a Chromium browser (getDisplayMedia tab-audio capture on the teacher side).
  const isChromium = /Chrome|Edg/.test(navigator.userAgent) && !/OPR|Opera/.test(navigator.userAgent)
  const isValidYouTube = (url) =>
    /(?:youtube\.com\/(?:watch\?v=|live\/|embed\/)|youtu\.be\/)[\w-]+/.test(url.trim())

  React.useEffect(() => {
    if (token) {
      setAuthToken(token)
    }
  }, [token])

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      setError('Please enter a room name')
      return
    }

    if (mode === 'video' && !isValidYouTube(videoUrl)) {
      setError('Please enter a valid YouTube link for Video Mode')
      return
    }

    setIsCreating(true)
    setError('')

    try {
      const settings = { mode }
      if (mode === 'video') settings.videoUrl = videoUrl.trim()
      const room = await createRoom(roomName.trim(), settings)
      navigate(`/teacher/room/${room._id}`)
    } catch (err) {
      setError(err.message || 'Failed to create room')
    } finally {
      setIsCreating(false)
    }
  }

  const isDisabled = isCreating || !roomName.trim() || (mode === 'video' && !isValidYouTube(videoUrl))

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      maxWidth: '100%'
    }}>
      <Sidebar user={user} />

      {/* Main Content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', marginLeft: 'var(--sidebar-width, 240px)' }}>
        <PageHeader isMobile={isMobile} icon={Plus} title="Create New Room" subtitle="Create a new room for your students" />

        {/* Content */}
        <div style={{ flex: 1, padding: isMobile ? '16px' : '28px 32px 36px', boxSizing: 'border-box', maxWidth: '100%', background: pageWash }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.45fr) minmax(300px, 1fr)', gap: '24px', alignItems: 'start', maxWidth: 1240 }}>
            {/* ---- left: the form ---- */}
            <div className="insight-card" style={{ ...cardStyle(isMobile), marginBottom: 0 }}>
              <SectionHeader icon={FileText} title="Room details" hint="Give your room a clear name so students can find it easily, then choose how you will teach." />

              {error && (
                <div role="alert" style={{ background: 'var(--tint-danger-bg)', border: '1px solid var(--tint-danger-border)', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px', color: 'var(--tint-danger-fg)', fontSize: '14px' }}>
                  {error}
                </div>
              )}

              <div data-tour="room-name" style={{ marginBottom: '24px' }}>
                <label htmlFor="room-name" style={label}>Room name</label>
                <input
                  id="room-name"
                  type="text"
                  className="app-input"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="e.g. DBMS Lecture 12"
                  maxLength={200}
                  style={inputStyle({ fontSize: 16, padding: '14px 16px' })}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                />
              </div>

              {/* Room mode: two large cards that say what each mode needs */}
              <div data-tour="room-mode" style={{ marginBottom: '22px' }}>
                <span style={label}>How will you teach?</span>
                <div role="radiogroup" aria-label="Room mode" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                  {[
                    { key: 'normal', icon: Mic, title: 'Normal', desc: 'Teach live; Spandan listens through your microphone.', tint: 'var(--accent)', needs: ['A microphone', 'Works in any browser'] },
                    { key: 'video', icon: Clapperboard, title: 'Video', desc: 'Play a YouTube video or live stream for the class.', tint: '#db2777', needs: ['A YouTube link', 'Chrome or Edge'] }
                  ].map((opt) => {
                    const on = mode === opt.key
                    return (
                      <button key={opt.key} type="button" role="radio" aria-checked={on} onClick={() => setMode(opt.key)} className="app-choice" style={{
                        position: 'relative', textAlign: 'left', padding: '16px 16px 14px', borderRadius: 16, cursor: 'pointer', color: 'var(--text-primary)',
                        border: on ? `2px solid ${opt.tint}` : '1px solid var(--border-color)',
                        background: on ? `color-mix(in srgb, ${opt.tint} 8%, var(--bg-card))` : 'var(--input-bg)',
                        boxShadow: on ? `0 8px 22px color-mix(in srgb, ${opt.tint} 18%, transparent)` : 'none'
                      }}>
                        <span aria-hidden="true" style={{ position: 'absolute', top: 12, right: 12, width: 20, height: 20, borderRadius: '50%', border: `2px solid ${on ? opt.tint : 'var(--border-color)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {on && <span style={{ width: 10, height: 10, borderRadius: '50%', background: opt.tint }} />}
                        </span>
                        <span aria-hidden="true" style={{ width: 46, height: 46, borderRadius: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 23, color: toneText(opt.tint), background: `linear-gradient(135deg, color-mix(in srgb, ${opt.tint} 10%, transparent), color-mix(in srgb, ${opt.tint} 26%, transparent))` }}>{renderIcon(opt.icon, 23)}</span>
                        <span style={{ display: 'block', fontSize: 16, fontWeight: 750, marginTop: 10 }}>{opt.title}</span>
                        <span style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.45 }}>{opt.desc}</span>
                        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                          {opt.needs.map((n) => <span key={n} style={{ fontSize: 11.5, fontWeight: 650, padding: '3px 9px', borderRadius: 999, color: on ? toneText(opt.tint) : 'var(--text-secondary)', background: on ? `color-mix(in srgb, ${opt.tint} 12%, transparent)` : 'color-mix(in srgb, var(--text-secondary) 10%, transparent)' }}><Ico as={Check} /> {n}</span>)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Video URL (video mode only) */}
              {mode === 'video' && (
                <div style={{ marginBottom: '22px' }}>
                  <label htmlFor="video-url" style={label}>YouTube video or live URL</label>
                  <input
                    id="video-url"
                    type="text"
                    className="app-input"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    style={inputStyle()}
                  />
                  {videoUrl.trim() && !isValidYouTube(videoUrl) && (
                    <div style={{ fontSize: '12px', color: 'var(--tint-danger-fg)', marginTop: '6px' }}>
                      Enter a valid YouTube link (youtube.com/watch, /live, or youtu.be).
                    </div>
                  )}
                  {!isChromium && (
                    <div style={{ fontSize: '12px', color: 'var(--tint-warn-fg)', background: 'var(--tint-warn-bg)', border: '1px solid var(--tint-warn-border)', borderRadius: '12px', padding: '10px 12px', marginTop: '10px' }}>
                      Video Mode needs Google Chrome or Microsoft Edge to capture the video's audio for
                      transcription. Please open Spandan in Chrome or Edge before starting a video room.
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', flexDirection: isMobile ? 'column-reverse' : 'row', paddingTop: 18, borderTop: '1px solid var(--border-color)' }}>
                <button data-tour="create-button" onClick={handleCreateRoom} disabled={isDisabled} style={primaryButton(isDisabled, { width: isMobile ? '100%' : 'auto', padding: '13px 24px', fontSize: 15 })}>
                  {isCreating ? 'Creating…' : <><Ico as={Plus} /> Create Room</>}
                </button>
                <button onClick={() => navigate('/teacher')} style={ghostButton({ padding: '13px 20px', fontSize: '14px', width: isMobile ? '100%' : 'auto' })}>
                  Cancel
                </button>
                {!isMobile && <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--text-secondary)' }}>You can change the settings later in the room.</span>}
              </div>
            </div>

            {/* ---- right: how it works ---- */}
            <div style={{ display: 'grid', gap: 20 }}>
              <div className="insight-card" style={{ ...cardStyle(isMobile), marginBottom: 0 }}>
                <SectionHeader icon={Lightbulb} tint="#f59e0b" title="How it works" />
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 14 }}>
                  {[
                    ['Create the room', 'You get a short code to share with the class.'],
                    ['Start teaching', mode === 'video' ? "Play the video; Spandan listens to its audio and drafts questions." : 'Spandan listens to your lecture and drafts questions from what you said.'],
                    ['Approve and launch', 'Review each batch, then launch polls; students answer live.'],
                    ['See the results', 'When you end the room, everyone gets their results page.'],
                  ].map(([t, d], i) => (
                    <li key={t} style={{ display: 'flex', gap: 12 }}>
                      <span aria-hidden="true" style={{ width: 26, height: 26, flexShrink: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, color: '#fff', background: 'var(--accent-gradient)' }}>{i + 1}</span>
                      <span>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 650, color: 'var(--text-primary)' }}>{t}</span>
                        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.45 }}>{d}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CreateRoomPage
