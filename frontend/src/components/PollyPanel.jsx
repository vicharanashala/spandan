import { useState, useEffect } from 'react'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'

// Admin(teacher)-only dashboard card: toggle Polly, send the bot into a meeting (asks for the
// meeting URL + Attendee credentials), post AI-generated polls with the admin's own AI provider,
// and remove the bot. Hidden entirely from students.

const cardStyle = {
  background: 'var(--bg-card)', borderRadius: '16px', padding: '24px',
  boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)', marginBottom: '24px'
}
const inputStyle = {
  width: '100%', padding: '12px 16px', border: '2px solid var(--border-color)', borderRadius: '10px',
  fontSize: '14px', outline: 'none', background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box'
}
const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }
const btnStyle = (on, color = '#3b82f6') => ({
  padding: '12px 24px', background: on ? color : '#9ca3af', color: 'white', border: 'none',
  borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: on ? 'pointer' : 'not-allowed'
})

function PollyPanel() {
  const { user, token } = useAuthStore()
  const [enabled, setEnabled] = useState(false)
  const [providers, setProviders] = useState({})
  const [form, setForm] = useState({
    meetingUrl: '', attendeeApiKey: '', attendeeBaseUrl: 'https://app.attendee.dev', botName: 'Polly', provider: ''
  })
  const [bot, setBot] = useState(null) // { id, state }
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

  // All hooks are declared above — safe to bail out for non-admins here.
  if (user?.role !== 'teacher') return null

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const creds = () => ({ attendeeApiKey: form.attendeeApiKey, attendeeBaseUrl: form.attendeeBaseUrl })

  const api = async (path, body) => {
    const r = await fetch(`${API_URL}/polly/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    })
    const d = await r.json()
    if (!d.success) throw new Error(d.error || 'Request failed')
    return d
  }

  const run = async (fn) => {
    setBusy(true); setError(''); setMsg('')
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const handleJoin = () => run(async () => {
    if (!form.meetingUrl.trim()) throw new Error('Enter the meeting URL')
    if (!form.attendeeApiKey.trim()) throw new Error('Enter your Attendee API key')
    const d = await api('join', { meetingUrl: form.meetingUrl.trim(), botName: form.botName, ...creds() })
    setBot(d.bot); setMsg(`Polly joined the meeting (state: ${d.bot.state}).`)
  })

  const handleLeave = () => run(async () => {
    await api('leave', { botId: bot.id, ...creds() })
    setBot(null); setMsg('Polly left the meeting.')
  })

  const handleStatus = () => run(async () => {
    const d = await api('status', { botId: bot.id, ...creds() })
    setBot(d.bot); setMsg(`State: ${d.bot.state}`)
  })

  const handlePoll = () => run(async () => {
    if (!topic.trim()) throw new Error('Enter a topic or paste transcript text')
    const d = await api('poll', { botId: bot.id, topic: topic.trim(), provider: form.provider, ...creds() })
    setMsg(`Posted a poll to the meeting: "${d.question.question}"`)
  })

  return (
    <div style={cardStyle}>
      {/* Header + toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Polly - meeting bot
        </h2>
        <button
          onClick={() => setEnabled((v) => !v)}
          aria-pressed={enabled}
          style={{
            width: '52px', height: '28px', borderRadius: '999px', border: 'none', cursor: 'pointer',
            background: enabled ? '#3b82f6' : 'var(--border-color)', position: 'relative', transition: 'background .2s'
          }}
        >
          <span style={{
            position: 'absolute', top: '3px', left: enabled ? '27px' : '3px', width: '22px', height: '22px',
            borderRadius: '50%', background: 'white', transition: 'left .2s'
          }} />
        </button>
      </div>

      {!enabled && (
        <p style={{ margin: '10px 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
          Turn on to send Polly into a Zoom/Meet meeting and run AI-generated live polls from here.
        </p>
      )}

      {enabled && (
        <div style={{ marginTop: '16px' }}>
          {/* Short guide so a teacher knows how to get Polly into their meeting */}
          <details style={{
            marginBottom: '16px', border: '1px solid var(--border-color)', borderRadius: '10px',
            padding: '12px 16px', background: 'var(--input-bg)'
          }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
              How to run Polly in your meeting
            </summary>
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
              <li>Start your Zoom meeting and copy its invite/join link.</li>
              <li>Below, paste the meeting link and your Attendee API key, pick your AI provider, and click "Add to the meeting".</li>
              <li>If the bot lands in the waiting room, admit it like any other participant.</li>
              <li>Enter a topic or paste transcript text and click "Generate poll" - Polly writes a question with your AI and posts it into the meeting chat for students to answer.</li>
              <li>Click "Remove from meeting" when you are done.</li>
            </ol>
          </details>

          {!bot ? (
            <>
              <p style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                Add Polly to a meeting. Enter the meeting link and your Attendee credentials.
              </p>
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
                        {Object.entries(providers).filter(([, p]) => p.enabled).map(([key, p]) => (
                          <option key={key} value={key}>{p.name}</option>
                        ))}
                      </select>
                    ) : (
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                        No AI provider is set up on the server yet. Add an AI key in the backend to enable poll generation.
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <button onClick={handleJoin} disabled={busy} style={btnStyle(!busy)}>
                    {busy ? 'Adding…' : 'Add to the meeting'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <span style={{
                  padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                  background: 'rgba(59,130,246,.15)', color: '#3b82f6'
                }}>
                  In meeting · {bot.state}
                </span>
                <button onClick={handleStatus} disabled={busy} style={{ ...btnStyle(!busy), padding: '6px 14px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                  Refresh
                </button>
              </div>

              <label style={labelStyle}>Generate & post a poll (uses {providers[form.provider]?.name || form.provider})</label>
              <textarea
                style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Topic or transcript text to base the poll on…"
              />
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button onClick={handlePoll} disabled={busy} style={btnStyle(!busy)}>
                  {busy ? 'Working…' : 'Generate poll'}
                </button>
                <button onClick={handleLeave} disabled={busy} style={btnStyle(!busy, '#ef4444')}>
                  Remove from meeting
                </button>
              </div>
            </>
          )}

          {(error || msg) && (
            <p style={{ marginTop: '14px', fontSize: '13px', color: error ? '#ef4444' : '#16a34a' }}>
              {error || msg}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default PollyPanel
