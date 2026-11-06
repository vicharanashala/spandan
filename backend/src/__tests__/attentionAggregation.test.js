// Pure aggregation rules for multi-tab attention. The important hardening here is that a tracked
// tab is authoritative: an untracked sibling (stale tab / duplicated socket / older cached bundle)
// can no longer keep a student marked present, and an untracked socket only counts during its join
// grace window.
import {
  ATTENTION_STALE_MS,
  ATTENTION_UNTRACKED_GRACE_MS,
  aggregateAttention,
  isSocketActiveForAttention,
  untrackedSocketExpiry
} from '../services/attentionAggregation.js'

const ROOM = 'ABC123'
const T0 = Date.UTC(2026, 0, 1, 9, 0, 0)

const makeSocket = ({ id = 's1', attention = undefined, joinedAt = undefined, inRoom = true } = {}) => ({
  id,
  rooms: new Set(inRoom ? [ROOM] : []),
  data: {
    attention: attention ? { [ROOM]: attention } : undefined,
    joinedRoomAt: joinedAt ? new Map([[ROOM, joinedAt]]) : undefined
  }
})

const active = (lastPingAt = T0) => ({ state: 'active', reason: null, since: null, lastPingAt })
const away = (reason = 'tab-hidden', since = T0) => ({ state: 'away', reason, since: new Date(since), lastPingAt: T0 })

describe('aggregateAttention', () => {
  it('keeps the student present while any tracked tab is active', () => {
    const sockets = [
      makeSocket({ id: 'a', attention: active() }),
      makeSocket({ id: 'b', attention: away() })
    ]

    expect(aggregateAttention(sockets, ROOM, { now: T0 + 1000 }).anyActive).toBe(true)
  })

  it('ignores an untracked sibling once a tracked tab reports away', () => {
    // This is the fix for the "switching to a pre-opened app stays present" case: the untracked
    // socket may be a stale/duplicate connection and must not override the tracked away tab.
    const sockets = [
      makeSocket({ id: 'tracked', attention: away('window-blur'), joinedAt: T0 }),
      makeSocket({ id: 'untracked', joinedAt: T0 })
    ]

    const result = aggregateAttention(sockets, ROOM, { now: T0 + 1000 })

    expect(result.tracked).toHaveLength(1)
    expect(result.anyActive).toBe(false)
  })

  it('trusts an untracked legacy socket only inside its join grace window', () => {
    const socket = makeSocket({ joinedAt: T0 })

    expect(isSocketActiveForAttention(socket, ROOM, T0 + ATTENTION_UNTRACKED_GRACE_MS)).toBe(true)
    expect(isSocketActiveForAttention(socket, ROOM, T0 + ATTENTION_UNTRACKED_GRACE_MS + 1)).toBe(false)
    expect(aggregateAttention([socket], ROOM, {
      now: T0 + ATTENTION_UNTRACKED_GRACE_MS + 1
    }).anyActive).toBe(false)
  })

  it('expires the grace of the newest untracked socket', () => {
    const older = makeSocket({ id: 'old', joinedAt: T0 })
    const newer = makeSocket({ id: 'new', joinedAt: T0 + 5000 })

    expect(untrackedSocketExpiry(older, ROOM)).toBe(T0 + ATTENTION_UNTRACKED_GRACE_MS)
    expect(untrackedSocketExpiry(newer, ROOM)).toBe(T0 + 5000 + ATTENTION_UNTRACKED_GRACE_MS)
    expect(aggregateAttention([older, newer], ROOM, {
      now: T0 + ATTENTION_UNTRACKED_GRACE_MS + 1
    }).anyActive).toBe(true)
    expect(aggregateAttention([older, newer], ROOM, {
      now: T0 + 5000 + ATTENTION_UNTRACKED_GRACE_MS + 1
    }).anyActive).toBe(false)
  })

  it('treats a tracked active socket with a stale heartbeat as away', () => {
    const socket = makeSocket({ attention: active(T0) })

    expect(isSocketActiveForAttention(socket, ROOM, T0 + ATTENTION_STALE_MS)).toBe(true)
    expect(isSocketActiveForAttention(socket, ROOM, T0 + ATTENTION_STALE_MS + 1)).toBe(false)
  })

  it('only considers sockets that are inside the room, minus the excluded socket', () => {
    const sockets = [
      makeSocket({ id: 'in', attention: active() }),
      makeSocket({ id: 'elsewhere', attention: active(), inRoom: false }),
      makeSocket({ id: 'excluded', attention: active() })
    ]

    const result = aggregateAttention(sockets, ROOM, { excludeId: 'excluded', now: T0 + 1000 })

    expect(result.inRoom.map((s) => s.id)).toEqual(['in'])
    expect(result.anyActive).toBe(true)
  })
})
