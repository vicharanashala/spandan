import useReactionStore, {
  _resetReactionStoreForTests,
  _hardResetReactionStoreForTests,
  REACTION_CONSTANTS
} from '../stores/reactionStore.js'
import {
  REACTION_LIST,
  RING_BUFFER_MAX,
  LANE_COUNT,
  FLOATER_LIFETIME_MS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_TRIGGERS,
  pickLane,
  isValidEmojiId,
  makeFloater,
  cullExpired,
  cullOldest,
  applyRateLimit,
  defaultReactionState
} from '../stores/reactionHelpers.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('reactionHelpers -- constants', () => {
  test('REACTION_LIST is the locked 6-emoji set, frozen', () => {
    expect(REACTION_LIST).toEqual(['\u{1F525}', '\u{1F44F}', '\u{1F602}', '\u{1F62E}', '\u{1F4AF}', '\u{1F914}'])
    expect(Object.isFrozen(REACTION_LIST)).toBe(true)
  })
  test('RING_BUFFER_MAX is 50', () => {
    expect(RING_BUFFER_MAX).toBe(50)
  })
  test('LANE_COUNT is 5', () => {
    expect(LANE_COUNT).toBe(5)
  })
  test('FLOATER_LIFETIME_MS is 2500', () => {
    expect(FLOATER_LIFETIME_MS).toBe(2500)
  })
  test('RATE_LIMIT_WINDOW_MS is 1000; RATE_LIMIT_MAX_TRIGGERS is 5', () => {
    expect(RATE_LIMIT_WINDOW_MS).toBe(1000)
    expect(RATE_LIMIT_MAX_TRIGGERS).toBe(5)
  })
  test('REACTION_CONSTANTS from store matches helpers', () => {
    expect(REACTION_CONSTANTS.REACTION_LIST).toBe(REACTION_LIST)
    expect(REACTION_CONSTANTS.RING_BUFFER_MAX).toBe(RING_BUFFER_MAX)
    expect(REACTION_CONSTANTS.FLOATER_LIFETIME_MS).toBe(FLOATER_LIFETIME_MS)
    expect(REACTION_CONSTANTS.RATE_LIMIT_WINDOW_MS).toBe(RATE_LIMIT_WINDOW_MS)
    expect(REACTION_CONSTANTS.RATE_LIMIT_MAX_TRIGGERS).toBe(RATE_LIMIT_MAX_TRIGGERS)
  })
})

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('reactionHelpers -- pickLane', () => {
  test('returns integer in [0, LANE_COUNT)', () => {
    for (let t = 0; t < 1000; t += 37) {
      const lane = pickLane(t)
      expect(Number.isInteger(lane)).toBe(true)
      expect(lane).toBeGreaterThanOrEqual(0)
      expect(lane).toBeLessThan(LANE_COUNT)
    }
  })
  test('non-finite input falls back to Date.now() (still in range)', () => {
    const a = pickLane(NaN)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(LANE_COUNT)
  })
  test('same timestamp yields same lane (deterministic)', () => {
    expect(pickLane(1234567890)).toBe(pickLane(1234567890))
  })
  test('consecutive timestamps spread across lanes (no single-lane clustering)', () => {
    // Hash-quality check: with 100 sequential timestamps and 5 lanes,
    // a uniform hash should produce ~20 hits per lane (max ~35). A
    // bad hash that maps everything to one lane gives max=100. We
    // assert that the max-per-lane stays below 60 (which is still
    // well above uniform but catches single-lane collapse). Note:
    // the literal collision count is 100 - uniqueLanes by pigeonhole,
    // so we cannot meaningfully test that.
    const counts = new Array(LANE_COUNT).fill(0)
    for (let t = 0; t < 100; t++) {
      const lane = pickLane(t)
      counts[lane] = (counts[lane] || 0) + 1
    }
    const uniqueLanes = counts.filter((c) => c > 0).length
    const maxCount = Math.max.apply(null, counts)
    expect(uniqueLanes).toBe(LANE_COUNT) // all 5 lanes touched
    expect(maxCount).toBeLessThan(60)     // no single-lane collapse
  })
})

describe('reactionHelpers -- isValidEmojiId', () => {
  test('valid emoji passes', () => {
    expect(isValidEmojiId('\u{1F525}')).toBe(true)
  })
  test('rejects non-string', () => {
    expect(isValidEmojiId(123)).toBe(false)
    expect(isValidEmojiId(null)).toBe(false)
    expect(isValidEmojiId(undefined)).toBe(false)
    expect(isValidEmojiId({})).toBe(false)
  })
  test('rejects unknown emoji', () => {
    expect(isValidEmojiId('xxx')).toBe(false)
  })
  test('honours a custom list override', () => {
    expect(isValidEmojiId('\u{1F525}', ['\u{1F525}'])).toBe(true)
    expect(isValidEmojiId('\u{1F44F}', ['\u{1F525}'])).toBe(false)
  })
})

describe('reactionHelpers -- makeFloater', () => {
  test('builds a floater with required fields', () => {
    const f = makeFloater('\u{1F525}', { now: 1000, lifetimeMs: 2500 })
    expect(f.emojiId).toBe('\u{1F525}')
    expect(f.spawnedAt).toBe(1000)
    expect(f.expiresAt).toBe(3500)
    expect(typeof f.id).toBe('string')
    expect(f.id.length).toBeGreaterThan(0)
  })
  test('lane in [0, LANE_COUNT)', () => {
    const f = makeFloater('\u{1F525}', { now: 42 })
    expect(f.lane).toBeGreaterThanOrEqual(0)
    expect(f.lane).toBeLessThan(LANE_COUNT)
  })
  test('default lifetime is FLOATER_LIFETIME_MS', () => {
    const f = makeFloater('\u{1F525}', { now: 1000 })
    expect(f.expiresAt - f.spawnedAt).toBe(FLOATER_LIFETIME_MS)
  })
  test('different emojis at same now produce different ids (likely)', () => {
    const a = makeFloater('\u{1F525}', { now: 1234 })
    const b = makeFloater('\u{1F44F}', { now: 1234 })
    expect(a.id).not.toBe(b.id)
  })
  test('two different nows produce different ids (likely)', () => {
    const a = makeFloater('\u{1F525}', { now: 1 })
    const b = makeFloater('\u{1F525}', { now: 2 })
    expect(a.id).not.toBe(b.id)
  })
})

describe('reactionHelpers -- cullExpired', () => {
  test('drops floaters with expiresAt <= now', () => {
    const list = [
      { id: 'a', emojiId: '\u{1F525}', lane: 0, spawnedAt: 0, expiresAt: 100 },
      { id: 'b', emojiId: '\u{1F525}', lane: 0, spawnedAt: 0, expiresAt: 200 },
      { id: 'c', emojiId: '\u{1F525}', lane: 0, spawnedAt: 0, expiresAt: 300 }
    ]
    const out = cullExpired(list, 200)
    expect(out.map((f) => f.id)).toEqual(['c'])
  })
  test('non-array input returns empty', () => {
    expect(cullExpired(null, 0)).toEqual([])
    expect(cullExpired(undefined, 0)).toEqual([])
    expect(cullExpired('x', 0)).toEqual([])
  })
  test('preserves order when nothing is dropped', () => {
    const list = [
      { id: 'a', expiresAt: 1500 },
      { id: 'b', expiresAt: 1600 },
      { id: 'c', expiresAt: 1700 }
    ]
    expect(cullExpired(list, 1000).map((f) => f.id)).toEqual(['a', 'b', 'c'])
  })
  test('preserves order when partial filter', () => {
    const list = [
      { id: 'a', expiresAt: 1500 },
      { id: 'b', expiresAt: 1000 },
      { id: 'c', expiresAt: 1700 },
      { id: 'd', expiresAt: 800 }
    ]
    // At now=1200: 'b'(1000), 'd'(800) are stale; 'a'(1500), 'c'(1700) survive.
    expect(cullExpired(list, 1200).map((f) => f.id)).toEqual(['a', 'c'])
  })
})

describe('reactionHelpers -- cullOldest', () => {
  test('drops oldest by spawnedAt when over cap', () => {
    const list = []
    for (let i = 0; i < 10; i++) {
      list.push({ id: 'f' + i, spawnedAt: i, expiresAt: i + 1000 })
    }
    const out = cullOldest(list, 5)
    expect(out.length).toBe(5)
    expect(out.map((f) => f.id)).toEqual(['f5', 'f6', 'f7', 'f8', 'f9'])
  })
  test('returns copy when under cap', () => {
    const list = [{ id: 'a', spawnedAt: 1, expiresAt: 2 }]
    const out = cullOldest(list, 50)
    expect(out).toEqual(list)
    expect(out).not.toBe(list) // copy
  })
  test('cap 0 returns empty', () => {
    const list = [{ id: 'a', spawnedAt: 1 }]
    expect(cullOldest(list, 0)).toEqual([])
  })
  test('cap < 0 returns empty', () => {
    const list = [{ id: 'a', spawnedAt: 1 }]
    expect(cullOldest(list, -3)).toEqual([])
  })
  test('non-array input returns empty', () => {
    expect(cullOldest(null, 5)).toEqual([])
  })
  test('cap NaN returns empty', () => {
    expect(cullOldest([{ id: 'a' }], NaN)).toEqual([])
  })
})

describe('reactionHelpers -- applyRateLimit', () => {
  test('first trigger is allowed', () => {
    const out = applyRateLimit(1000, [])
    expect(out.allowed).toBe(true)
    expect(out.history).toEqual([1000])
  })
  test('5 triggers within window allowed, 6th rejected', () => {
    let h = []
    let last
    for (let i = 0; i < 5; i++) {
      last = applyRateLimit(1000 + i, h)
      h = last.history
      expect(last.allowed).toBe(true)
    }
    const sixth = applyRateLimit(1005, h)
    expect(sixth.allowed).toBe(false)
    expect(sixth.history).toEqual(h)
  })
  test('after window passes, slot freed', () => {
    const h = [1, 2, 3, 4, 5]
    const out = applyRateLimit(2000, h)
    expect(out.allowed).toBe(true)
    expect(out.history).toEqual([2000])
  })
  test('non-array history is normalised', () => {
    const out = applyRateLimit(1000, null)
    expect(out.allowed).toBe(true)
    expect(out.history).toEqual([1000])
  })
  test('non-finite now falls back to a finite timestamp', () => {
    const out = applyRateLimit(NaN, [])
    expect(out.allowed).toBe(true)
    expect(out.history[0]).toBeGreaterThan(0)
  })
})

describe('reactionHelpers -- defaultReactionState', () => {
  test('shape and frozen', () => {
    const s = defaultReactionState()
    expect(s.floaters).toEqual([])
    expect(s.cooldowns).toEqual([])
    expect(s.muted).toBe(true)
    expect(s.audioReady).toBe(false)
    expect(Object.isFrozen(s)).toBe(true)
  })
  test('returns a fresh object each call', () => {
    const a = defaultReactionState()
    const b = defaultReactionState()
    expect(a).not.toBe(b)
    expect(a.floaters).not.toBe(b.floaters)
    expect(a.cooldowns).not.toBe(b.cooldowns)
  })
})

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

describe('reactionStore -- zustand store', () => {
  beforeEach(() => {
    _resetReactionStoreForTests()
  })

  test('initial state matches defaultReactionState()', () => {
    const s = useReactionStore.getState()
    expect(s.floaters).toEqual([])
    expect(s.cooldowns).toEqual([])
    expect(s.muted).toBe(true)
    expect(s.audioReady).toBe(false)
  })

  describe('spawnFloater', () => {
    test('rejects unknown emoji id', () => {
      const out = useReactionStore.getState().spawnFloater('xxx')
      expect(out).toBeNull()
      expect(useReactionStore.getState().floaters.length).toBe(0)
    })
    test('rejects non-string emoji id', () => {
      expect(useReactionStore.getState().spawnFloater(null)).toBeNull()
      expect(useReactionStore.getState().spawnFloater(42)).toBeNull()
    })
    test('happy path: appends to floaters, returns record', () => {
      const out = useReactionStore.getState().spawnFloater('\u{1F525}')
      expect(out).toBeTruthy()
      expect(out.emojiId).toBe('\u{1F525}')
      expect(useReactionStore.getState().floaters.length).toBe(1)
      expect(useReactionStore.getState().cooldowns.length).toBe(1)
    })
    test('enforces 5/sec rate limit', () => {
      // IMPORTANT: re-fetch state after each call. getState() returns
      // a snapshot; spawnFloater mutates internal state so subsequent
      // calls must come from a fresh getState() to read updated
      // cooldowns.
      for (let i = 0; i < 5; i++) {
        const out = useReactionStore.getState().spawnFloater('\u{1F525}')
        expect(out).toBeTruthy()
      }
      // 6th call should be rate-limited.
      const sixth = useReactionStore.getState().spawnFloater('\u{1F525}')
      expect(sixth).toBeNull()
      const { floaters } = useReactionStore.getState()
      expect(floaters.length).toBe(5)
    })
    test('culls oldest when ring buffer overflows (> 50)', () => {
      const floats = []
      for (let i = 0; i < 50; i++) {
        floats.push({
          id: 'seed_' + i,
          emojiId: '\u{1F525}',
          lane: 0,
          spawnedAt: i,
          expiresAt: i + 10000
        })
      }
      // Seed directly with empty cooldowns so spawnFloater isn't rate-limited.
      useReactionStore.setState({ floaters: floats, cooldowns: [] })
      const out = useReactionStore.getState().spawnFloater('\u{1F525}')
      expect(out).toBeTruthy()
      const after = useReactionStore.getState().floaters
      expect(after.length).toBe(50)
      expect(after.find((f) => f.id === 'seed_0')).toBeUndefined()
      // Newest seeded should still be present.
      expect(after.find((f) => f.id === 'seed_49')).toBeDefined()
    })
  })

  describe('expireFloater', () => {
    test('removes the matching floater by id', () => {
      useReactionStore.getState().spawnFloater('\u{1F525}')
      const f = useReactionStore.getState().floaters[0]
      const ok = useReactionStore.getState().expireFloater(f.id)
      expect(ok).toBe(true)
      expect(useReactionStore.getState().floaters.length).toBe(0)
    })
    test('idempotent: returns false on second call', () => {
      useReactionStore.getState().spawnFloater('\u{1F525}')
      const f = useReactionStore.getState().floaters[0]
      expect(useReactionStore.getState().expireFloater(f.id)).toBe(true)
      expect(useReactionStore.getState().expireFloater(f.id)).toBe(false)
    })
    test('rejects empty / non-string id', () => {
      expect(useReactionStore.getState().expireFloater('')).toBe(false)
      expect(useReactionStore.getState().expireFloater(null)).toBe(false)
      expect(useReactionStore.getState().expireFloater(42)).toBe(false)
    })
  })

  describe('tickCull', () => {
    test('drops floaters past their expiresAt', () => {
      const f = makeFloater('\u{1F525}', { now: 100, lifetimeMs: 200 })
      useReactionStore.setState({ floaters: [f], cooldowns: [] })
      const changed = useReactionStore.getState().tickCull(500)
      expect(changed).toBe(true)
      expect(useReactionStore.getState().floaters.length).toBe(0)
    })
    test('keeps live floaters', () => {
      const f = makeFloater('\u{1F525}', { now: 100, lifetimeMs: 5000 })
      useReactionStore.setState({ floaters: [f], cooldowns: [] })
      const changed = useReactionStore.getState().tickCull(500)
      expect(changed).toBe(false)
      expect(useReactionStore.getState().floaters.length).toBe(1)
    })
  })

  describe('setMuted / markAudioReady / clearAll', () => {
    test('setMuted flips the flag', () => {
      useReactionStore.getState().setMuted(false)
      expect(useReactionStore.getState().muted).toBe(false)
      useReactionStore.getState().setMuted(true)
      expect(useReactionStore.getState().muted).toBe(true)
    })
    test('setMuted coerces to boolean', () => {
      useReactionStore.getState().setMuted('yes')
      expect(useReactionStore.getState().muted).toBe(true)
      useReactionStore.getState().setMuted(0)
      expect(useReactionStore.getState().muted).toBe(false)
    })
    test('markAudioReady is idempotent', () => {
      expect(useReactionStore.getState().markAudioReady()).toBe(true)
      expect(useReactionStore.getState().markAudioReady()).toBe(false)
      expect(useReactionStore.getState().audioReady).toBe(true)
    })
    test('clearAll empties floaters and cooldowns', () => {
      useReactionStore.getState().spawnFloater('\u{1F525}')
      useReactionStore.getState().clearAll()
      const s = useReactionStore.getState()
      expect(s.floaters).toEqual([])
      expect(s.cooldowns).toEqual([])
    })
  })

  describe('methods preserved across reset (Phase 2 lesson)', () => {
    test('_resetReactionStoreForTests does NOT wipe methods', () => {
      _resetReactionStoreForTests()
      const s = useReactionStore.getState()
      expect(typeof s.spawnFloater).toBe('function')
      expect(typeof s.expireFloater).toBe('function')
      expect(typeof s.tickCull).toBe('function')
      expect(typeof s.setMuted).toBe('function')
      expect(typeof s.markAudioReady).toBe('function')
      expect(typeof s.clearAll).toBe('function')
    })
    test('_hardResetReactionStoreForTests also keeps methods', () => {
      _hardResetReactionStoreForTests()
      const s = useReactionStore.getState()
      expect(typeof s.spawnFloater).toBe('function')
      expect(typeof s.expireFloater).toBe('function')
    })
  })
})