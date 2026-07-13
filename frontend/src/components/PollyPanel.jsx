import { useState, useEffect } from 'react'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'

// Admin(teacher)-only dashboard card to run and manage the Polly meeting bot: send it into a Zoom/Meet
// meeting, configure all the meeting/poll behaviour (poll timing, auto vs manual triggers, notification
// rules, timer, speaker wrap-up nudge + pause/end guidance, breaks, question types), post AI-generated
// polls, and send notifications. Hidden entirely from students.

const cardStyle = {
  background: 'var(--bg-card)', borderRadius: '16px', padding: '24px',
  boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)', marginBottom: '24px'
}
const inputStyle = {
  width: '100%', padding: '12px 16px', border: '2px solid var(--border-color)', borderRadius: '10px',
  fontSize: '14px', outline: 'none', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box'
}
const smallInput = { ...inputStyle, padding: '8px 10px', width: '90px' }
const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }
const btnStyle = (on, color = '#3b82f6') => ({
  padding: '10px 18px', background: on ? color : '#9ca3af', color: 'white', border: 'none',
  borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: on ? 'pointer' : 'not-allowed'
})

// Small reusable pill toggle.
function Toggle({ on, onChange }) {
  return (
    <button onClick={onChange} aria-pressed={on} type="button" style={{
      width: '46px', height: '26px', borderRadius: '999px', border: 'none', cursor: 'pointer', flex: '0 0 auto',
      background: on ? '#3b82f6' : 'var(--border-color)', position: 'relative', transition: 'background .2s'
    }}>
      <span style={{ position: 'absolute', top: '3px', left: on ? '23px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', transition: 'left .2s' }} />
    </button>
  )
}
// A labelled settings row.
function Row({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '8px 0' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        {hint && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{hint}</div>}
      </div>
      <div style={{ flex: '0 0 auto' }}>{children}</div>
    </div>
  )
}
function GroupTitle({ children }) {
  return <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-secondary)', margin: '14px 0 2px' }}>{children}</div>
}

const DEFAULT_SETTINGS = {
  pollMinutes: '12,25', pollTrigger: 'manual', showTimer: true, showCountdown: true, countdownSecs: 15,
  qTypes: { MCQ: true, TF: true, FITB: false },
  notifyMode: 'manual', headsUp: true, headsUpLeadSec: 30, notifyEveryone: true, notifySpeaker: true,
  wrapUpNudge: true, pauseEndGuidance: true,
  breaksEnabled: true, breakEveryMin: 25, breakLengthMin: 5,
}

function PollyPanel() {
  const { user, token } = useAuthStore()
  const [enabled, setEnabled] = useState(false)
  const [providers, setProviders] = useState({})
  const [form, setForm] = useState({ meetingUrl: '', attendeeApiKey: '', attendeeBaseUrl: 'https://app.attendee.dev', botName: 'Polly', provider: '' })
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [bot, setBot] = useState(null)
  const [participants, setParticipants] = useState([])
  const [speaker, setSpeaker] = useState('')
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!enabled || Object.keys(providers).length) return
    fetch(`${API_URL}/polly/providers`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return
        setProviders(d.providers)
        const firstEnabled = Object.entries(d.providers).find(([, p]) => p.enabled)?.[0]
        if (firstEnabled) setForm((f) => ({ ...f, provider: f.provider || firstEnabled }))
      })
      .catch(() => {})
  }, [enabled, token]) // eslint-disable-line react-hooks/exhaustive-deps

  if (user?.role !== 'teacher') return null

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setS = (k, v) => setSettings((s) => ({ ...s, [k]: v }))
  const toggleS = (k) => setS(k, !settings[k])
  const setQType = (t) => setSettings((s) => ({ ...s, qTypes: { ...s.qTypes, [t]: !s.qTypes[t] } }))
  const creds = () => ({ attendeeApiKey: form.attendeeApiKey, attendeeBaseUrl: form.attendeeBaseUrl })

  const api = async (path, body) => {
    const r = await fetch(`${API_URL}/polly/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body)
    })
    const d = await r.json()
    if (!d.success) throw new Error(d.error || 'Request failed')
    return d
  }
  const run = async (fn) => { setBusy(true); setError(''); setMsg(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) } }

  const handleJoin = () => run(async () => {
    if (!form.meetingUrl.trim()) throw new Error('Enter the meeting URL')
    if (!form.attendeeApiKey.trim()) throw new Error('Enter your Attendee API key')
    const d = await api('join', { meetingUrl: form.meetingUrl.trim(), botName: form.botName, settings, ...creds() })
    setBot(d.bot); if (d.settings) setSettings(d.settings); setMsg(`Polly joined the meeting (state: ${d.bot.state}).`)
    loadParticipants()
  })
  const handleSaveSettings = () => run(async () => { await api('config', { botId: bot.id, settings }); setMsg('Settings saved for this session.') })
  const handleStatus = () => run(async () => { const d = await api('status', { botId: bot.id, ...creds() }); setBot(d.bot); setMsg(`State: ${d.bot.state}`) })
  const loadParticipants = async () => {
    try { const d = await api('participants', { botId: bot?.id, ...creds() }); const list = d.participants || []; setParticipants(Array.isArray(list) ? list : (list.participants || [])) } catch { /* ignore */ }
  }
  const handleHeadsUp = () => run(async () => { const d = await api('notify', { botId: bot.id, kind: 'headsup', speakerUuid: speaker || undefined, ...creds() }); setMsg(d.note || `Heads-up sent to: ${d.sent.join(', ') || 'no one (check settings)'}`) })
  const handleWrapUp = () => run(async () => { const d = await api('notify', { botId: bot.id, kind: 'wrapup', speakerUuid: speaker || undefined, ...creds() }); setMsg(d.note || `Wrap-up nudge sent to: ${d.sent.join(', ') || 'no one (check settings)'}`) })
  const handlePoll = () => run(async () => {
    if (!topic.trim()) throw new Error('Enter a topic or paste transcript text')
    const d = await api('poll', { botId: bot.id, topic: topic.trim(), provider: form.provider, ...creds() })
    setMsg(`Posted a poll to the meeting: "${d.question.question}"`)
  })
  const handleLeave = () => run(async () => { await api('leave', { botId: bot.id, ...creds() }); setBot(null); setParticipants([]); setSpeaker(''); setMsg('Polly left the meeting.') })

  // The full settings editor (used before joining and while in the meeting).
  const SettingsEditor = (
    <details style={{ margin: '4px 0 16px', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 16px', background: 'var(--input-bg)' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>Meeting settings</summary>

      <GroupTitle>Polls</GroupTitle>
      <Row label="Poll minutes" hint="Meeting minutes to run polls at">
        <input style={smallInput} value={settings.pollMinutes} onChange={(e) => setS('pollMinutes', e.target.value)} placeholder="12,25" />
      </Row>
      <Row label="Trigger" hint="Fire polls automatically or by hand">
        <select style={{ ...smallInput, width: '120px' }} value={settings.pollTrigger} onChange={(e) => setS('pollTrigger', e.target.value)}>
          <option value="manual">Manual</option><option value="auto">Automatic</option>
        </select>
      </Row>
      <Row label="Question types" hint="Types the AI may create">
        <div style={{ display: 'flex', gap: '10px' }}>
          {['MCQ', 'TF', 'FITB'].map((t) => (
            <label key={t} style={{ fontSize: '13px', color: 'var(--text-primary)', display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input type="checkbox" checked={!!settings.qTypes[t]} onChange={() => setQType(t)} />{t}
            </label>
          ))}
        </div>
      </Row>
      <Row label="Poll countdown" hint="Show a countdown before a poll">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {settings.showCountdown && <input style={smallInput} type="number" value={settings.countdownSecs} onChange={(e) => setS('countdownSecs', Number(e.target.value))} />}
          <Toggle on={settings.showCountdown} onChange={() => toggleS('showCountdown')} />
        </div>
      </Row>

      <GroupTitle>Notifications</GroupTitle>
      <Row label="Notify mode" hint="Send notifications automatically or by hand">
        <select style={{ ...smallInput, width: '120px' }} value={settings.notifyMode} onChange={(e) => setS('notifyMode', e.target.value)}>
          <option value="manual">Manual</option><option value="auto">Automatic</option>
        </select>
      </Row>
      <Row label={`"Poll coming soon" heads-up`} hint="Broadcast a warning before a poll">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {settings.headsUp && <input style={smallInput} type="number" value={settings.headsUpLeadSec} onChange={(e) => setS('headsUpLeadSec', Number(e.target.value))} />}
          <Toggle on={settings.headsUp} onChange={() => toggleS('headsUp')} />
        </div>
      </Row>
      <Row label="Send to everyone" hint="Post notifications in the meeting chat"><Toggle on={settings.notifyEveryone} onChange={() => toggleS('notifyEveryone')} /></Row>
      <Row label="Send to the speaker" hint="Also send privately to the current speaker"><Toggle on={settings.notifySpeaker} onChange={() => toggleS('notifySpeaker')} /></Row>

      <GroupTitle>Timer</GroupTitle>
      <Row label="Show meeting timer" hint="Keep an always-on timer visible"><Toggle on={settings.showTimer} onChange={() => toggleS('showTimer')} /></Row>

      <GroupTitle>Speaker</GroupTitle>
      <Row label="Wrap-up nudge" hint="Privately ask the current speaker to wrap up before a poll"><Toggle on={settings.wrapUpNudge} onChange={() => toggleS('wrapUpNudge')} /></Row>
      <Row label="Include pause/end guidance" hint='Add "how to pause or end" text to the nudge'><Toggle on={settings.pauseEndGuidance} onChange={() => toggleS('pauseEndGuidance')} /></Row>

      <GroupTitle>Breaks</GroupTitle>
      <Row label="Schedule breaks"><Toggle on={settings.breaksEnabled} onChange={() => toggleS('breaksEnabled')} /></Row>
      {settings.breaksEnabled && (
        <>
          <Row label="Every (minutes)"><input style={smallInput} type="number" value={settings.breakEveryMin} onChange={(e) => setS('breakEveryMin', Number(e.target.value))} /></Row>
          <Row label="Break length (minutes)"><input style={smallInput} type="number" value={settings.breakLengthMin} onChange={(e) => setS('breakLengthMin', Number(e.target.value))} /></Row>
        </>
      )}
      <p style={{ margin: '10px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
        Automatic scheduling, the on-camera timer, and live transcription need the full Polly bot runtime; manual polls, notifications, and speaker nudges work today.
      </p>
    </details>
  )

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>Polly - meeting bot</h2>
        <Toggle on={enabled} onChange={() => setEnabled((v) => !v)} />
      </div>

      {!enabled && (
        <p style={{ margin: '10px 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
          Turn on to send Polly into a Zoom/Meet meeting, manage the poll and notification settings, and run AI-generated live polls from here.
        </p>
      )}

      {enabled && (
        <div style={{ marginTop: '16px' }}>
          <details style={{ marginBottom: '16px', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 16px', background: 'var(--input-bg)' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>How to run Polly in your meeting</summary>
            <ol style={{ margin: '12px 0 0', paddingLeft: '20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <li>
                Get Zoom credentials (one-time). At marketplace.zoom.us, sign in, then:
                <ul style={{ margin: '4px 0', paddingLeft: '18px' }}>
                  <li>Click Develop, then Build App, and choose "General App".</li>
                  <li>Copy the Client ID and Client Secret from the App Credentials section.</li>
                  <li>Open Features, then Embed, and turn on the "Meeting SDK" toggle.</li>
                </ul>
              </li>
              <li>Set up Attendee (the service that runs the bot): sign up at app.attendee.dev (or self-host it). In its Settings, paste the Zoom Client ID and Secret, then create an Attendee API key.</li>
              <li>Adjust the meeting settings below (polls, notifications, timer, speaker nudges, breaks).</li>
              <li>Start your Zoom meeting, copy its invite/join link, paste it with your Attendee API key, pick your AI provider, and click "Add to the meeting".</li>
              <li>Admit the bot from the waiting room if needed. Use the controls to send a heads-up, nudge the speaker, or post a poll.</li>
              <li>Click "Remove from meeting" when you are done.</li>
            </ol>
          </details>

          {SettingsEditor}

          {!bot ? (
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Meeting URL</label>
                <input style={inputStyle} value={form.meetingUrl} onChange={set('meetingUrl')} placeholder="https://zoom.us/j/123..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Attendee API key</label>
                  <input style={inputStyle} type="password" value={form.attendeeApiKey} onChange={set('attendeeApiKey')} placeholder="Token from Attendee" autoComplete="off" />
                </div>
                <div>
                  <label style={labelStyle}>Attendee base URL</label>
                  <input style={inputStyle} value={form.attendeeBaseUrl} onChange={set('attendeeBaseUrl')} placeholder="https://app.attendee.dev" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Bot name</label>
                  <input style={inputStyle} value={form.botName} onChange={set('botName')} placeholder="Polly" />
                </div>
                <div>
                  <label style={labelStyle}>AI provider (for polls)</label>
                  {Object.values(providers).some((p) => p.enabled) ? (
                    <select style={inputStyle} value={form.provider} onChange={set('provider')}>
                      {Object.entries(providers).filter(([, p]) => p.enabled).map(([key, p]) => (<option key={key} value={key}>{p.name}</option>))}
                    </select>
                  ) : (
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>No AI provider is set up on the server yet.</p>
                  )}
                </div>
              </div>
              <div><button onClick={handleJoin} disabled={busy} style={btnStyle(!busy)}>{busy ? 'Adding…' : 'Add to the meeting'}</button></div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, background: 'rgba(59,130,246,.15)', color: '#3b82f6' }}>In meeting · {bot.state}</span>
                <button onClick={handleStatus} disabled={busy} style={{ ...btnStyle(!busy), padding: '6px 14px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>Refresh</button>
                <button onClick={handleSaveSettings} disabled={busy} style={{ ...btnStyle(!busy), padding: '6px 14px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>Save settings</button>
              </div>

              <Row label="Current speaker" hint="Pick who a private nudge goes to">
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select style={{ ...smallInput, width: '180px' }} value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
                    <option value="">Everyone / none</option>
                    {participants.map((p) => (<option key={p.id || p.uuid} value={p.uuid || p.id}>{p.name || p.full_name || p.uuid}</option>))}
                  </select>
                  <button onClick={() => run(loadParticipants)} disabled={busy} style={{ ...btnStyle(!busy), padding: '8px 12px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>Reload</button>
                </div>
              </Row>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', margin: '10px 0 16px' }}>
                <button onClick={handleHeadsUp} disabled={busy} style={btnStyle(!busy)}>Send poll heads-up</button>
                <button onClick={handleWrapUp} disabled={busy} style={btnStyle(!busy, '#f59e0b')}>Nudge speaker (wrap-up)</button>
                <button onClick={handleLeave} disabled={busy} style={btnStyle(!busy, '#ef4444')}>Remove from meeting</button>
              </div>

              <label style={labelStyle}>Generate & post a poll (uses {providers[form.provider]?.name || form.provider})</label>
              <textarea style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic or transcript text to base the poll on…" />
              <div style={{ marginTop: '12px' }}><button onClick={handlePoll} disabled={busy} style={btnStyle(!busy)}>{busy ? 'Working…' : 'Generate poll'}</button></div>
            </>
          )}

          {(error || msg) && (<p style={{ marginTop: '14px', fontSize: '13px', color: error ? '#ef4444' : '#16a34a' }}>{error || msg}</p>)}
        </div>
      )}
    </div>
  )
}

export default PollyPanel
