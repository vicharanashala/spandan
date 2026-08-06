import { computePresenceSeconds } from '../services/presence.js'

describe('computePresenceSeconds', () => {
  const roomCreatedAt = new Date('2026-01-01T10:00:00Z')
  const sessionEnd = new Date('2026-01-01T11:00:00Z') // 1 hour session

  it('returns 0 for an empty intervals array', () => {
    expect(computePresenceSeconds([], roomCreatedAt, sessionEnd)).toBe(0)
  })

  it('sums a single closed interval', () => {
    const intervals = [{
      joinedAt: new Date('2026-01-01T10:00:00Z'),
      leftAt: new Date('2026-01-01T10:10:00Z')
    }]
    expect(computePresenceSeconds(intervals, roomCreatedAt, sessionEnd)).toBe(600)
  })

  it('clamps a still-open interval to sessionEnd', () => {
    const intervals = [{
      joinedAt: new Date('2026-01-01T10:50:00Z'),
      leftAt: null
    }]
    expect(computePresenceSeconds(intervals, roomCreatedAt, sessionEnd)).toBe(600)
  })

  it('sums two non-overlapping intervals', () => {
    const intervals = [
      { joinedAt: new Date('2026-01-01T10:00:00Z'), leftAt: new Date('2026-01-01T10:05:00Z') },
      { joinedAt: new Date('2026-01-01T10:20:00Z'), leftAt: new Date('2026-01-01T10:25:00Z') }
    ]
    expect(computePresenceSeconds(intervals, roomCreatedAt, sessionEnd)).toBe(600)
  })

  it('does not double-count two overlapping intervals (two tabs at once)', () => {
    const intervals = [
      { joinedAt: new Date('2026-01-01T10:00:00Z'), leftAt: new Date('2026-01-01T10:30:00Z') },
      { joinedAt: new Date('2026-01-01T10:10:00Z'), leftAt: new Date('2026-01-01T10:40:00Z') }
    ]
    // Union is 10:00-10:40 = 40 minutes, not 30+30 = 60.
    expect(computePresenceSeconds(intervals, roomCreatedAt, sessionEnd)).toBe(2400)
  })

  it('caps overlapping intervals spanning the whole session at the session length', () => {
    const intervals = [
      { joinedAt: roomCreatedAt, leftAt: sessionEnd },
      { joinedAt: roomCreatedAt, leftAt: sessionEnd }
    ]
    expect(computePresenceSeconds(intervals, roomCreatedAt, sessionEnd)).toBe(3600)
  })

  it('clamps an interval that starts before room.createdAt', () => {
    const intervals = [{
      joinedAt: new Date('2026-01-01T09:00:00Z'), // 1 hour before the room existed
      leftAt: new Date('2026-01-01T10:10:00Z')
    }]
    expect(computePresenceSeconds(intervals, roomCreatedAt, sessionEnd)).toBe(600)
  })

  it('floors fractional seconds and never goes negative', () => {
    const intervals = [{
      joinedAt: new Date('2026-01-01T10:00:00.000Z'),
      leftAt: new Date('2026-01-01T10:00:04.999Z')
    }]
    expect(computePresenceSeconds(intervals, roomCreatedAt, sessionEnd)).toBe(4)
  })
})
