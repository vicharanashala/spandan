import {
  summarizeAttendancePayload,
  normalizeJourneyState,
  fetchLiveStanding,
  clearSpurtiCache,
  readCookie,
  spurtiConfig,
  spurtiStatus,
  describeSpurti
} from '../services/spurtiLive.js'

const ADMIN_PAYLOAD = {
  sessions: [{ label: 'S1', totalMinutes: 60 }, { label: 'S2', totalMinutes: 60 }, { label: 'S3', totalMinutes: 60 }],
  students: [
    {
      _id: 'a1',
      name: 'Asha',
      email: 'Asha@Example.com',
      totalSp: 1234,
      cells: {
        S1: { minutes: 55 },
        S2: { minutes: 0 },
        S3: { minutes: 41 }
      }
    },
    {
      _id: 'a2',
      name: 'No sessions',
      email: 'none@example.com',
      totalSp: 100,
      cells: { S1: null, S2: null, S3: null }
    }
  ]
}

describe('spurtiLive', () => {
  const saved = { ...process.env }
  const originalFetch = global.fetch
  let warn

  beforeEach(() => {
    clearSpurtiCache()
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.SPURTI_API_URL = 'https://spurti.test/api'
    delete process.env.SPURTI_ADMIN_EMAIL
    delete process.env.SPURTI_ADMIN_TOKEN
    delete process.env.SPURTI_DISABLED
    delete process.env.SPURTI_CACHE_TTL_MS
    delete process.env.SPURTI_MODE
    delete process.env.SPURTI_RETRY_MS
    global.fetch = jest.fn()
  })

  afterEach(() => {
    warn.mockRestore()
    global.fetch = originalFetch
    process.env = { ...saved }
  })

  test('summarizeAttendancePayload sums attended minutes and lowercases emails', () => {
    const rows = summarizeAttendancePayload(ADMIN_PAYLOAD)
    expect(rows.size).toBe(2)
    expect(rows.get('asha@example.com')).toEqual({
      email: 'asha@example.com',
      spBalance: 1234,
      attendanceMinutes: 96,
      sessionsAttended: 2
    })
    expect(rows.get('none@example.com')).toEqual({
      email: 'none@example.com',
      spBalance: 100,
      attendanceMinutes: 0,
      sessionsAttended: 0
    })
  })

  test('summarizeAttendancePayload tolerates a missing payload', () => {
    expect(summarizeAttendancePayload(null).size).toBe(0)
    expect(summarizeAttendancePayload({}).size).toBe(0)
  })

  test('normalizeJourneyState maps totalSp and standup minutes', () => {
    expect(normalizeJourneyState({ totalSp: 980, standups: { zoomMinutes: 2410, sessionsAttended: 33 } }))
      .toEqual({ spBalance: 980, attendanceMinutes: 2410, sessionsAttended: 33 })
    expect(normalizeJourneyState({ totalSp: 980 })).toEqual({ spBalance: 980, attendanceMinutes: 0, sessionsAttended: 0 })
    expect(normalizeJourneyState(null)).toBeNull()
    expect(normalizeJourneyState({})).toBeNull()
  })

  test('readCookie finds one cookie and tolerates encoded values', () => {
    expect(readCookie('a=1; chatengine_token=abc%3D; b=2', 'chatengine_token')).toBe('abc=')
    expect(readCookie('a=1; b=2', 'chatengine_token')).toBeNull()
    expect(readCookie('', 'chatengine_token')).toBeNull()
  })

  test('uses admin headers when configured, and caches the snapshot', async () => {
    process.env.SPURTI_ADMIN_EMAIL = 'admin@example.com'
    process.env.SPURTI_ADMIN_TOKEN = 'secret'
    expect(spurtiConfig()).toMatchObject({ mode: 'admin', enabled: true })

    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ADMIN_PAYLOAD })

    const first = await fetchLiveStanding('ASHA@example.com')
    expect(first).toMatchObject({
      source: 'spurti',
      spBalance: 1234,
      attendanceMinutes: 96,
      sessionsAttended: 2
    })
    expect(first.fetchedAt).toEqual(expect.any(String))

    const second = await fetchLiveStanding('none@example.com')
    expect(second).toMatchObject({ spBalance: 100, attendanceMinutes: 0 })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('https://spurti.test/api/admin/attendance')
    expect(options.headers).toMatchObject({
      'x-admin-email': 'admin@example.com',
      'x-admin-token': 'secret'
    })
  })

  test('returns null for a student Spurti does not know', async () => {
    process.env.SPURTI_ADMIN_EMAIL = 'admin@example.com'
    process.env.SPURTI_ADMIN_TOKEN = 'secret'
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ADMIN_PAYLOAD })
    await expect(fetchLiveStanding('ghost@example.com')).resolves.toBeNull()
  })

  test('falls back to the Samagama cookie when no admin token is configured', async () => {
    expect(spurtiConfig()).toMatchObject({ mode: 'sso', enabled: true })
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ totalSp: 640, standups: { zoomMinutes: 1500, sessionsAttended: 20 } })
    })

    const live = await fetchLiveStanding('student@example.com', { chatengineToken: 'tok-123' })
    expect(live).toMatchObject({ source: 'spurti', spBalance: 640, attendanceMinutes: 1500, sessionsAttended: 20 })

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('https://spurti.test/api/journey/state')
    expect(options.headers.cookie).toBe('chatengine_token=tok-123')
  })

  test('the SSO path needs a cookie', async () => {
    await expect(fetchLiveStanding('student@example.com')).resolves.toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('an unreachable Spurti never throws and yields no mirror', async () => {
    process.env.SPURTI_ADMIN_EMAIL = 'admin@example.com'
    process.env.SPURTI_ADMIN_TOKEN = 'secret'
    global.fetch.mockRejectedValue(new Error('network down'))
    await expect(fetchLiveStanding('student@example.com')).resolves.toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  test('a 401 from Spurti is treated as "no data", not an error', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    await expect(fetchLiveStanding('student@example.com', { chatengineToken: 'bad' })).resolves.toBeNull()
  })

  test('SPURTI_DISABLED=1 turns the mirror off', async () => {
    process.env.SPURTI_DISABLED = '1'
    await expect(fetchLiveStanding('student@example.com', { chatengineToken: 'tok' })).resolves.toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  describe('auto mode: Samagama when available, local otherwise', () => {
    test('no credentials and no cookie means local data with zero calls', async () => {
      await expect(fetchLiveStanding('student@example.com')).resolves.toBeNull()
      expect(global.fetch).not.toHaveBeenCalled()
      expect(spurtiStatus()).toMatchObject({ enabled: true, mode: 'sso', live: false })
    })

    test('adding admin credentials switches to the admin branch with no code change', async () => {
      process.env.SPURTI_ADMIN_EMAIL = 'admin@example.com'
      process.env.SPURTI_ADMIN_TOKEN = 'secret'
      global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ADMIN_PAYLOAD })

      const live = await fetchLiveStanding('asha@example.com')
      expect(live).toMatchObject({ source: 'spurti', spBalance: 1234 })
      expect(spurtiConfig()).toMatchObject({ mode: 'admin', enabled: true })
      expect(spurtiStatus().live).toBe(true)
    })

    test('SPURTI_MODE=off forces local data even when credentials exist', async () => {
      process.env.SPURTI_ADMIN_EMAIL = 'admin@example.com'
      process.env.SPURTI_ADMIN_TOKEN = 'secret'
      process.env.SPURTI_MODE = 'off'
      await expect(fetchLiveStanding('asha@example.com')).resolves.toBeNull()
      expect(global.fetch).not.toHaveBeenCalled()
      expect(spurtiConfig()).toMatchObject({ mode: 'off', enabled: false })
    })

    test('SPURTI_MODE=admin without credentials is off instead of guessing', () => {
      process.env.SPURTI_MODE = 'admin'
      expect(spurtiConfig()).toMatchObject({ mode: 'off', enabled: false })
      expect(describeSpurti()).toMatch(/using local/)
    })

    test('a failed admin call backs off instead of timing out on every request', async () => {
      process.env.SPURTI_ADMIN_EMAIL = 'admin@example.com'
      process.env.SPURTI_ADMIN_TOKEN = 'secret'
      global.fetch.mockRejectedValue(new Error('network down'))

      await expect(fetchLiveStanding('asha@example.com')).resolves.toBeNull()
      await expect(fetchLiveStanding('asha@example.com')).resolves.toBeNull()
      await expect(fetchLiveStanding('asha@example.com')).resolves.toBeNull()

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(spurtiStatus()).toMatchObject({ live: false, coolingDown: true })
      expect(warn).toHaveBeenCalledTimes(1)
    })

    test('it recovers automatically once access is restored', async () => {
      process.env.SPURTI_ADMIN_EMAIL = 'admin@example.com'
      process.env.SPURTI_ADMIN_TOKEN = 'secret'
      process.env.SPURTI_RETRY_MS = '0'
      global.fetch
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValue({ ok: true, status: 200, json: async () => ADMIN_PAYLOAD })

      await expect(fetchLiveStanding('asha@example.com')).resolves.toBeNull()
      const recovered = await fetchLiveStanding('asha@example.com')
      expect(recovered).toMatchObject({ source: 'spurti', spBalance: 1234 })
      expect(spurtiStatus().live).toBe(true)
    })
  })
})
