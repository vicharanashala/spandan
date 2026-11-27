import {
  computePresenceBreakdown,
  computeReconnectUsage,
  getReconnectAllowanceSeconds,
  getReconnectAllowanceMs,
  DEFAULT_RECONNECT_ALLOWANCE_SECONDS,
  MIN_RECONNECT_ALLOWANCE_SECONDS
} from '../services/attendanceService.js'

const MINUTE = 60 * 1000
const at = (minutes) => new Date(Date.UTC(2026, 0, 1, 9, 0, 0) + minutes * MINUTE)
const interval = (startMin, endMin) => ({ start: at(startMin), end: endMin == null ? null : at(endMin) })

// 60-minute session used by every case below.
const sessionStart = at(0)
const sessionEnd = at(60)
const totalMs = sessionEnd.getTime() - sessionStart.getTime()
const breakdown = (intervals, allowanceSeconds) => computePresenceBreakdown({
  intervals,
  sessionStart,
  sessionEnd,
  totalMs,
  allowanceMs: allowanceSeconds * 1000
})

describe('reconnect allowance configuration', () => {
  const roomWith = (value) => ({ settings: { waitingRoom: { reconnectAllowanceSeconds: value } } })

  it('defaults to 60 seconds', () => {
    expect(getReconnectAllowanceSeconds({ settings: {} })).toBe(DEFAULT_RECONNECT_ALLOWANCE_SECONDS)
    expect(DEFAULT_RECONNECT_ALLOWANCE_SECONDS).toBe(60)
  })

  it('never drops below 60 seconds, even when the teacher sets 0', () => {
    expect(getReconnectAllowanceSeconds(roomWith(0))).toBe(MIN_RECONNECT_ALLOWANCE_SECONDS)
    expect(getReconnectAllowanceSeconds(roomWith(-30))).toBe(MIN_RECONNECT_ALLOWANCE_SECONDS)
    expect(getReconnectAllowanceSeconds(roomWith(null))).toBe(60)
  })

  it('accepts a larger teacher value and clamps the maximum', () => {
    expect(getReconnectAllowanceSeconds(roomWith(300))).toBe(300)
    expect(getReconnectAllowanceMs(roomWith(300))).toBe(300_000)
    expect(getReconnectAllowanceSeconds(roomWith(99999))).toBe(3600)
  })
})

describe('computePresenceBreakdown', () => {
  it('charges nothing when the student is present the whole session', () => {
    const result = breakdown([interval(0, 60)], 60)
    expect(result).toMatchObject({ presentMs: 60 * MINUTE, internalGapMs: 0, forgivenMs: 0, missedMs: 0 })
    expect(result.trailingGapMs).toBe(0)
    expect(result.leadingGapMs).toBe(0)
  })

  it('forgives an internal gap that fits inside the 60-second default', () => {
    // Present 0-20, dropped for 40 seconds, back at 20:40 through the end.
    const result = breakdown([interval(0, 20), { start: new Date(at(20).getTime() + 40_000), end: at(60) }], 60)
    expect(result.forgivenMs).toBe(40_000)
    expect(result.missedMs).toBe(0)
    expect(result.presentMs).toBe(60 * MINUTE - 40_000)
  })

  it('forgives a longer gap when the allowance allows it', () => {
    // Present 0-20, dropped 3 min, back 23-60, with a 3-minute allowance.
    const result = breakdown([interval(0, 20), interval(23, 60)], 180)
    expect(result.forgivenMs).toBe(3 * MINUTE)
    expect(result.missedMs).toBe(0)
    expect(result.presentMs).toBe(57 * MINUTE)
  })

  it('caps the total forgiveness at the allowance', () => {
    // 8-minute drop in a 60-minute session with a 5-minute allowance.
    const result = breakdown([interval(0, 20), interval(28, 60)], 300)
    expect(result.forgivenMs).toBe(5 * MINUTE)
    expect(result.missedMs).toBe(3 * MINUTE)
  })

  it('shares one budget across multiple drops', () => {
    // Gaps: 2 min + 5 min = 7 min total, allowance 5 min.
    const result = breakdown([interval(0, 10), interval(12, 20), interval(25, 60)], 300)
    expect(result.internalGapMs).toBe(7 * MINUTE)
    expect(result.forgivenMs).toBe(5 * MINUTE)
    expect(result.missedMs).toBe(2 * MINUTE)
  })

  it('never forgives the initial late-join gap', () => {
    // Joined 10 minutes late, then one 2-minute drop later.
    const result = breakdown([interval(10, 30), interval(32, 60)], 600)
    expect(result.forgivenMs).toBe(2 * MINUTE)
    expect(result.missedMs).toBe(10 * MINUTE) // the late join stays billed
  })

  it('forgives a final absence when the student leaves and never returns', () => {
    // Present 0-40, gone for the last 20 minutes, 10-minute allowance.
    const result = breakdown([interval(0, 40)], 600)
    expect(result.trailingGapMs).toBe(20 * MINUTE)
    expect(result.forgivenMs).toBe(10 * MINUTE)
    expect(result.missedMs).toBe(10 * MINUTE)
  })

  it('fully covers a short final absence when it fits inside the allowance', () => {
    // Present 0-40, gone for 20 minutes, 30-minute allowance.
    const result = breakdown([interval(0, 40)], 1800)
    expect(result.forgivenMs).toBe(20 * MINUTE)
    expect(result.missedMs).toBe(0)
  })

  it('shares one budget between internal gaps and the final absence', () => {
    // 2-minute drop, then a 40-minute final absence, 5-minute allowance.
    const result = breakdown([interval(0, 10), interval(12, 20)], 300)
    expect(result.internalGapMs).toBe(2 * MINUTE)
    expect(result.trailingGapMs).toBe(40 * MINUTE)
    expect(result.forgivenMs).toBe(5 * MINUTE)
    expect(result.missedMs).toBe(37 * MINUTE)
  })

  it('keeps the late join billed while still covering the final absence', () => {
    // Joined 10 minutes late, left at 30, never returned, 10-minute allowance.
    const result = breakdown([interval(10, 30)], 600)
    expect(result.leadingGapMs).toBe(10 * MINUTE)
    expect(result.trailingGapMs).toBe(30 * MINUTE)
    expect(result.forgivenMs).toBe(10 * MINUTE)
    expect(result.missedMs).toBe(30 * MINUTE)
  })

  it('forgives nothing for a student who never joined', () => {
    const result = breakdown([], 600)
    expect(result.presentMs).toBe(0)
    expect(result.forgivenMs).toBe(0)
    expect(result.missedMs).toBe(60 * MINUTE)
  })

  it('forgives nothing when the allowance is 0', () => {
    const result = breakdown([interval(0, 20), interval(25, 60)], 0)
    expect(result.forgivenMs).toBe(0)
    expect(result.missedMs).toBe(5 * MINUTE)
  })

  it('merges overlapping intervals before measuring gaps', () => {
    // Second tab overlap: 0-20 and 15-30 must count as 0-30, not as a gap.
    const result = breakdown([interval(0, 20), interval(15, 30), interval(31, 60)], 60)
    expect(result.internalGapMs).toBe(1 * MINUTE)
    expect(result.forgivenMs).toBe(1 * MINUTE)
    expect(result.missedMs).toBe(0)
  })

  it('falls back to the session end for an open interval', () => {
    const result = breakdown([interval(0, null)], 60)
    expect(result.presentMs).toBe(60 * MINUTE)
    expect(result.missedMs).toBe(0)
  })
})

describe('computeReconnectUsage', () => {
  const roomAt = ({ allowanceSeconds = 60, endedAt = null } = {}) => ({
    sessionStartedAt: sessionStart,
    endedAt,
    settings: { waitingRoom: { reconnectAllowanceSeconds: allowanceSeconds } }
  })
  const usage = (presence, options = {}) => computeReconnectUsage({
    member: { presence },
    room: roomAt(options),
    at: options.at || sessionEnd
  })

  it('turns a closed internal gap into a join/leave/rejoin history with budget accounting', () => {
    const result = usage([interval(0, 20), interval(20.5, 60)], { allowanceSeconds: 120 })
    expect(result.rejoins).toBe(1)
    expect(result.usedSeconds).toBe(30)
    expect(result.remainingSeconds).toBe(90)
    expect(result.events.map((e) => e.type)).toEqual(['joined', 'left', 'joined'])
    expect(result.gaps).toHaveLength(1)
    expect(result.gaps[0]).toMatchObject({ seconds: 30, forgivenSeconds: 30, billedSeconds: 0 })
  })

  it('caps the total budget and marks the excess as billed', () => {
    const result = usage([interval(0, 20), interval(22.5, 60)], { allowanceSeconds: 90 })
    expect(result.usedSeconds).toBe(90)
    expect(result.remainingSeconds).toBe(0)
    expect(result.gaps[0]).toMatchObject({ seconds: 150, forgivenSeconds: 90, billedSeconds: 60 })
    expect(result.missedSeconds).toBe(60)
  })

  it('shares the one budget across several gaps in chronological order', () => {
    const result = usage(
      [interval(0, 10), interval(10.667, 20), interval(21.333, 60)],
      { allowanceSeconds: 60 }
    )
    expect(result.gaps).toHaveLength(2)
    expect(result.gaps[0]).toMatchObject({ seconds: 40, forgivenSeconds: 40, billedSeconds: 0 })
    expect(result.gaps[1]).toMatchObject({ seconds: 80, forgivenSeconds: 20, billedSeconds: 60 })
    expect(result.usedSeconds).toBe(60)
  })

  it('never lists or forgives the initial late-join gap', () => {
    const result = usage([interval(10, 30), interval(31, 60)], { allowanceSeconds: 600 })
    expect(result.gaps).toHaveLength(1)
    expect(result.gaps[0].seconds).toBe(60)
    expect(result.usedSeconds).toBe(60)
    // The 10 minutes before the first join stay billed.
    expect(result.missedSeconds).toBe(10 * 60)
    expect(result.events[0].type).toBe('joined')
  })

  it('reports a student as present only while the room is live and the interval is open', () => {
    const live = usage([interval(0, null)], { at: at(30) })
    expect(live.present).toBe(true)
    expect(live.usedSeconds).toBe(0)
    expect(live.presentSeconds).toBe(30 * 60)

    const ended = usage([interval(0, null)], { endedAt: sessionEnd })
    expect(ended.present).toBe(false)
  })

  it('charges the open trailing absence while the student is still away', () => {
    const result = usage([interval(0, 20)], { at: at(40), allowanceSeconds: 600 })
    expect(result.usedSeconds).toBe(600)
    expect(result.remainingSeconds).toBe(0)
    expect(result.gaps).toHaveLength(1)
    expect(result.gaps[0]).toMatchObject({ seconds: 20 * 60, forgivenSeconds: 600, billedSeconds: 600, open: true })
    expect(result.present).toBe(false)
    expect(result.missedSeconds).toBe(10 * 60)
  })

  it('covers a final absence in a room that already ended', () => {
    const result = usage([interval(0, 40)], { endedAt: at(60), allowanceSeconds: 600 })
    expect(result.usedSeconds).toBe(600)
    expect(result.gaps).toHaveLength(1)
    expect(result.gaps[0]).toMatchObject({ seconds: 20 * 60, forgivenSeconds: 600, billedSeconds: 600, open: false, final: true })
    expect(result.missedSeconds).toBe(10 * 60)
  })

  it('stops an ended room at endedAt even when the serializer passes a later now', () => {
    const result = usage([interval(0, 40)], { endedAt: at(60), at: at(75), allowanceSeconds: 600 })
    expect(result.sessionSeconds).toBe(60 * 60)
    expect(result.gaps[0]).toMatchObject({ seconds: 20 * 60, final: true })
  })

  it('shows a short final absence capped by the budget', () => {
    // The reported case: 28s present of a 41s session, never rejoined, 60s allowance.
    const start = at(0)
    const end = new Date(start.getTime() + 41_000)
    const result = computeReconnectUsage({
      member: { presence: [{ start, end: new Date(start.getTime() + 28_000) }] },
      room: {
        sessionStartedAt: start,
        endedAt: end,
        settings: { waitingRoom: { reconnectAllowanceSeconds: 60 } }
      },
      at: end
    })
    expect(result.usedSeconds).toBe(13)
    expect(result.remainingSeconds).toBe(47)
    expect(result.missedSeconds).toBe(0)
    expect(result.gaps[0]).toMatchObject({ seconds: 13, forgivenSeconds: 13, billedSeconds: 0, final: true })
  })
})
