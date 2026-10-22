// Attention chimes (lib/sounds.js): mute preference, autoplay blocking, and tone scheduling.
class FakeContext {
  constructor() {
    this.state = FakeContext.initialState
    this.currentTime = 0
    this.destination = {}
    this.oscillators = []
    FakeContext.instances.push(this)
  }
  resume() { if (FakeContext.resumable) this.state = 'running'; return Promise.resolve() }
  createOscillator() {
    const o = { type: '', frequency: { setValueAtTime: jest.fn() }, connect: jest.fn(), start: jest.fn(), stop: jest.fn() }
    this.oscillators.push(o)
    return o
  }
  createGain() {
    return { gain: { setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() }, connect: jest.fn() }
  }
}
FakeContext.instances = []
FakeContext.initialState = 'running'
FakeContext.resumable = true

const load = () => {
  jest.resetModules()
  return require('../lib/sounds')
}

beforeEach(() => {
  window.localStorage.clear()
  FakeContext.instances = []
  FakeContext.initialState = 'running'
  FakeContext.resumable = true
  window.AudioContext = FakeContext
})

describe('mute preference', () => {
  it('is ON by default and persists OFF per browser', () => {
    const s = load()
    expect(s.isSoundEnabled()).toBe(true)
    s.setSoundEnabled(false)
    expect(s.isSoundEnabled()).toBe(false)
    expect(window.localStorage.getItem('spandan.soundEnabled')).toBe('off')
    s.setSoundEnabled(true)
    expect(s.isSoundEnabled()).toBe(true)
    expect(window.localStorage.getItem('spandan.soundEnabled')).toBeNull()
  })

  it('announces changes on the window so toggles elsewhere stay in sync', () => {
    const s = load()
    const seen = []
    window.addEventListener(s.SOUND_CHANGE_EVENT, (e) => seen.push(e.detail.enabled))
    s.setSoundEnabled(false); s.setSoundEnabled(true)
    expect(seen).toEqual([false, true])
  })

  it('does not play while muted', async () => {
    const s = load()
    s.setSoundEnabled(false)
    expect(await s.playTeacherReady()).toBe('muted')
    expect(FakeContext.instances).toHaveLength(0)
  })
})

describe('playing', () => {
  it('teacher cue = 10 tones over ~5 s, student cue = 18 tones over ~5 s, preview = 1 short tone', async () => {
    const s = load()
    const last = (notes) => Math.max(...notes.map(([, at, dur]) => at + dur))
    expect(s.TEACHER_READY_NOTES).toHaveLength(10)
    expect(last(s.TEACHER_READY_NOTES)).toBeGreaterThanOrEqual(4.9)
    expect(s.STUDENT_QUESTION_NOTES).toHaveLength(18)
    expect(last(s.STUDENT_QUESTION_NOTES)).toBeGreaterThanOrEqual(4.9)
    expect(last(s.STUDENT_QUESTION_NOTES)).toBeLessThanOrEqual(s.CUE_DURATION_SECONDS)

    expect(await s.playTeacherReady()).toBe('played')
    expect(await s.playStudentQuestion()).toBe('played')
    expect(await s.playPreview()).toBe('played')
    const ctx = FakeContext.instances[0]
    expect(FakeContext.instances).toHaveLength(1) // one shared context
    expect(ctx.oscillators).toHaveLength(10 + 18 + 1)
    for (const o of ctx.oscillators) { expect(o.start).toHaveBeenCalled(); expect(o.stop).toHaveBeenCalled() }
  })

  it('reports "blocked" while the context is suspended and no gesture has happened', async () => {
    FakeContext.initialState = 'suspended'
    FakeContext.resumable = false
    const s = load()
    expect(await s.playStudentQuestion()).toBe('blocked')
    expect(FakeContext.instances[0].oscillators).toHaveLength(0)
  })

  it('plays once a gesture (unlockAudio) resumed the context', async () => {
    FakeContext.initialState = 'suspended'
    FakeContext.resumable = true
    const s = load()
    expect(await s.unlockAudio()).toBe(true)
    expect(await s.playStudentQuestion()).toBe('played')
  })

  it('installUnlockOnInteraction resumes on the first pointerdown', async () => {
    FakeContext.initialState = 'suspended'
    const s = load()
    s.installUnlockOnInteraction()
    s.installUnlockOnInteraction() // idempotent
    window.dispatchEvent(new Event('pointerdown'))
    await Promise.resolve()
    expect(FakeContext.instances[0].state).toBe('running')
  })

  it('reports "unsupported" when the browser has no AudioContext', async () => {
    delete window.AudioContext
    const s = load()
    expect(await s.playTeacherReady()).toBe('unsupported')
  })
})
