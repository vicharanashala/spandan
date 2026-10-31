// Real-schema tests for PUT /rooms/:id validation (roomUpdateSchema / roomSettingsSchema).
// The ranges must match what RoomSettingsModal.jsx lets a teacher pick.
import { roomUpdateSchema, roomSettingsSchema } from '../middleware/validation.js'

const ok = (body) => roomUpdateSchema.safeParse(body).success
const firstError = (body) => roomUpdateSchema.safeParse(body).error.issues[0]

// Everything the Settings dialog sends on Save.
const fullSettings = {
  segmentTime: 2, questionsPerSegment: 2, difficulty: 'medium', questionProvider: 'minimax',
  questionTypeMix: { MCQ: 0, TF: 100, MSQ: 0 }, timeToAnswer: 30, points: 100,
  anonymousLeaderboard: false, anonymityPercent: 20, revealBottomToStudents: false,
  mode: 'normal', videoUrl: ''
}

describe('PUT /rooms/:id body (roomUpdateSchema)', () => {
  it('accepts the full Settings dialog payload', () => {
    expect(ok({ settings: fullSettings })).toBe(true)
  })

  it('accepts every dialog extreme (TTA 0/300, points 1/500, Q/seg 1/10, segment 1/15, anonymity 0/100)', () => {
    expect(ok({ settings: { ...fullSettings, timeToAnswer: 0, points: 1, questionsPerSegment: 1, segmentTime: 1, anonymityPercent: 0 } })).toBe(true)
    expect(ok({ settings: { ...fullSettings, timeToAnswer: 300, points: 500, questionsPerSegment: 10, segmentTime: 15, anonymityPercent: 100 } })).toBe(true)
  })

  it('accepts the end-room body (isActive false + ISO endedAt)', () => {
    expect(ok({ isActive: false, endedAt: new Date().toISOString() })).toBe(true)
    expect(ok({ isActive: false, endedAt: new Date() })).toBe(true)
  })

  it('accepts the video-link edit body', () => {
    expect(ok({ settings: { ...fullSettings, mode: 'video', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } })).toBe(true)
  })

  it('ignores unknown keys rather than failing (route still applies req.body)', () => {
    expect(ok({ settings: { ...fullSettings, somethingNew: 1 }, extra: true })).toBe(true)
  })

  describe('segmentTime', () => {
    it.each([1, 2, 7, 15])('accepts %i', (v) => expect(ok({ settings: { segmentTime: v } })).toBe(true))
    it.each([0, 16, 30, 60])('rejects %i (out of 1-15)', (v) => {
      expect(ok({ settings: { segmentTime: v } })).toBe(false)
      expect(firstError({ settings: { segmentTime: v } }).path).toEqual(['settings', 'segmentTime'])
    })
    it('rejects fractional minutes', () => {
      expect(ok({ settings: { segmentTime: 2.5 } })).toBe(false)
      expect(firstError({ settings: { segmentTime: 2.5 } }).message).toMatch(/integer/i)
    })
    it('rejects a string', () => expect(ok({ settings: { segmentTime: '5' } })).toBe(false))
  })

  describe('other ranges mirror the dialog', () => {
    it('rejects TTA above 300 and below 0', () => {
      expect(ok({ settings: { timeToAnswer: 301 } })).toBe(false)
      expect(ok({ settings: { timeToAnswer: -1 } })).toBe(false)
    })
    it('rejects points 0 and 501', () => {
      expect(ok({ settings: { points: 0 } })).toBe(false)
      expect(ok({ settings: { points: 501 } })).toBe(false)
    })
    it('rejects questionsPerSegment 0 and 11', () => {
      expect(ok({ settings: { questionsPerSegment: 0 } })).toBe(false)
      expect(ok({ settings: { questionsPerSegment: 11 } })).toBe(false)
    })
    it('rejects an unknown difficulty, provider or mode', () => {
      expect(ok({ settings: { difficulty: 'brutal' } })).toBe(false)
      expect(ok({ settings: { questionProvider: 'llama' } })).toBe(false)
      expect(ok({ settings: { mode: 'audio' } })).toBe(false)
    })
    it('rejects a type-mix share outside 0-100', () => {
      expect(ok({ settings: { questionTypeMix: { MCQ: 120 } } })).toBe(false)
    })
    it('rejects anonymityPercent outside 0-100', () => {
      expect(ok({ settings: { anonymityPercent: 101 } })).toBe(false)
    })
    it('rejects a non-boolean isActive and a garbage endedAt', () => {
      expect(ok({ isActive: 'no' })).toBe(false)
      expect(ok({ endedAt: 'yesterday' })).toBe(false)
    })
  })

  it('roomSettingsSchema alone still validates a bare settings object', () => {
    expect(roomSettingsSchema.safeParse(fullSettings).success).toBe(true)
    expect(roomSettingsSchema.safeParse({ segmentTime: 30 }).success).toBe(false)
  })
})
