/**
 * Tests for responseCoordinator.
 *
 * Run with the existing backend Jest setup. No DB connection is required —
 * every test substitutes a fake `work` function that returns a controllable
 * Promise.
 */

import {
  key,
  coordinate,
  buildResyncPayload,
  buildAckPayload,
  detectDuplicateKeyError,
  _inFlightSize,
  _resetInFlight
} from '../utils/responseCoordinator.js';

const flush = () => new Promise((r) => setImmediate(r));

describe('responseCoordinator.key', () => {
  test('builds canonical colon-joined string from valid ids', () => {
    expect(key('r1', 'q1', 's1')).toBe('r1:q1:s1');
  });

  test('throws when roomId is missing', () => {
    expect(() => key('', 'q1', 's1')).toThrow(/roomId/);
  });

  test('throws when questionId is missing', () => {
    expect(() => key('r1', null, 's1')).toThrow(/questionId/);
  });

  test('throws when studentId is missing', () => {
    expect(() => key('r1', 'q1', undefined)).toThrow(/studentId/);
  });
});

describe('responseCoordinator.coordinate — happy path', () => {
  beforeEach(() => _resetInFlight());

  test('runs work exactly once for a single caller', async () => {
    let calls = 0;
    const work = () => {
      calls += 1;
      return Promise.resolve({ _id: 'r1', correct: true });
    };
    const out = await coordinate(key('r1', 'q1', 's1'), work);
    expect(calls).toBe(1);
    expect(out).toEqual({ _id: 'r1', correct: true });
  });

  test('collapses concurrent identical-key callers to one work() invocation', async () => {
    let calls = 0;
    let resolveWork;
    const work = () => {
      calls += 1;
      return new Promise((resolve) => {
        resolveWork = resolve;
      });
    };

    const k = key('r2', 'q2', 's2');
    const p1 = coordinate(k, work);
    const p2 = coordinate(k, work);
    const p3 = coordinate(k, work);

    // Drain the microtask queue so the deferred work() actually runs.
    await flush();

    expect(calls).toBe(1);

    resolveWork({ _id: 'r2', correct: false });
    const [a, b, c] = await Promise.all([p1, p2, p3]);

    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toEqual({ _id: 'r2', correct: false });
  });

  test('slot is cleared after work resolves, allowing a subsequent retry to run', async () => {
    let calls = 0;
    const work = () => {
      calls += 1;
      return Promise.resolve(calls);
    };
    const k = key('r3', 'q3', 's3');
    const first = await coordinate(k, work);
    expect(first).toBe(1);

    const second = await coordinate(k, work);
    expect(second).toBe(2);
    expect(calls).toBe(2);
  });

  test('slot is cleared after work rejects, allowing a subsequent retry to run', async () => {
    let calls = 0;
    const work = () => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('boom'));
      return Promise.resolve({ ok: true });
    };
    const k = key('r4', 'q4', 's4');

    await expect(coordinate(k, work)).rejects.toThrow('boom');

    const after = await coordinate(k, work);
    expect(after).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  test('all concurrent callers see the rejection when work fails', async () => {
    let calls = 0;
    let rejectWork;
    const work = () => {
      calls += 1;
      return new Promise((_, reject) => {
        rejectWork = reject;
      });
    };

    const k = key('r5', 'q5', 's5');
    const p1 = coordinate(k, work);
    const p2 = coordinate(k, work);
    const p3 = coordinate(k, work);

    await flush();

    expect(calls).toBe(1);

    rejectWork(new Error('db down'));
    await expect(p1).rejects.toThrow('db down');
    await expect(p2).rejects.toThrow('db down');
    await expect(p3).rejects.toThrow('db down');
  });
});

describe('responseCoordinator.coordinate — argument validation', () => {
  beforeEach(() => _resetInFlight());

  test('rejects when compositeKey is empty', async () => {
    await expect(coordinate('', () => Promise.resolve(1))).rejects.toThrow(/compositeKey/);
  });

  test('rejects when work is not a function', async () => {
    await expect(coordinate(key('r6', 'q6', 's6'), null)).rejects.toThrow(/work/);
  });

  test('surfaces synchronous throws from work without caching them', async () => {
    const k = key('r7', 'q7', 's7');
    await expect(coordinate(k, () => { throw new Error('sync-boom'); })).rejects.toThrow('sync-boom');
    const out = await coordinate(k, () => Promise.resolve(42));
    expect(out).toBe(42);
  });
});

describe('responseCoordinator.buildResyncPayload', () => {
  test('produces a stable resync shape from a snapshot', () => {
    const snap = {
      roomId: 'r1',
      questionId: 'q1',
      studentId: 's1',
      status: 'recorded',
      receivedAt: 1700000000000
    };
    expect(buildResyncPayload(snap)).toEqual({
      type: 'response:resync',
      roomId: 'r1',
      questionId: 'q1',
      studentId: 's1',
      status: 'recorded',
      receivedAt: 1700000000000
    });
  });

  test('fills in defaults when snapshot is empty', () => {
    const before = Date.now();
    const out = buildResyncPayload({});
    const after = Date.now();
    expect(out.type).toBe('response:resync');
    expect(out.roomId).toBeNull();
    expect(out.questionId).toBeNull();
    expect(out.studentId).toBeNull();
    expect(out.status).toBe('recorded');
    expect(out.receivedAt).toBeGreaterThanOrEqual(before);
    expect(out.receivedAt).toBeLessThanOrEqual(after);
  });
});

describe('responseCoordinator.buildAckPayload', () => {
  test('serialises a saved response into the ACK shape', () => {
    const saved = {
      _id: 'abc123',
      roomId: 'r1',
      questionId: 'q1',
      studentId: 's1',
      pointsAwarded: 100,
      correct: true,
      savedAt: new Date('2026-01-01T00:00:00.000Z')
    };
    expect(buildAckPayload(saved)).toEqual({
      ok: true,
      responseId: 'abc123',
      roomId: 'r1',
      questionId: 'q1',
      studentId: 's1',
      pointsAwarded: 100,
      correct: true,
      savedAt: '2026-01-01T00:00:00.000Z'
    });
  });

  test('coerces non-Date savedAt to an ISO string', () => {
    const out = buildAckPayload({ savedAt: '2026-02-02T02:02:02.000Z' });
    expect(out.savedAt).toBe('2026-02-02T02:02:02.000Z');
  });

  test('returns null for missing identity fields rather than throwing', () => {
    const out = buildAckPayload({});
    expect(out.ok).toBe(true);
    expect(out.responseId).toBeNull();
    expect(out.roomId).toBeNull();
    expect(out.questionId).toBeNull();
    expect(out.studentId).toBeNull();
    expect(out.pointsAwarded).toBe(0);
    expect(out.correct).toBeNull();
    expect(typeof out.savedAt).toBe('string');
  });
});

describe('responseCoordinator.detectDuplicateKeyError', () => {
  test('matches MongoDB driver code 11000', () => {
    expect(detectDuplicateKeyError({ code: 11000 })).toBe(true);
  });

  test('matches codeName "DuplicateKey"', () => {
    expect(detectDuplicateKeyError({ codeName: 'DuplicateKey' })).toBe(true);
  });

  test('matches codeName "DuplicateKeyError"', () => {
    expect(detectDuplicateKeyError({ codeName: 'DuplicateKeyError' })).toBe(true);
  });

  test('matches code 11001 (legacy duplicate)', () => {
    expect(detectDuplicateKeyError({ code: 11001 })).toBe(true);
  });

  test('returns false for unrelated errors', () => {
    expect(detectDuplicateKeyError(new Error('nope'))).toBe(false);
    expect(detectDuplicateKeyError({ code: 121 })).toBe(false);
    expect(detectDuplicateKeyError(null)).toBe(false);
    expect(detectDuplicateKeyError(undefined)).toBe(false);
    expect(detectDuplicateKeyError('not an error')).toBe(false);
  });
});

describe('responseCoordinator — internal map hygiene', () => {
  beforeEach(() => _resetInFlight());

  test('in-flight size grows during pending work and shrinks after settle', async () => {
    let resolveWork;
    const work = () => new Promise((r) => { resolveWork = r; });
    const k = key('r8', 'q8', 's8');

    expect(_inFlightSize()).toBe(0);
    const p = coordinate(k, work);
    // Slot is set synchronously by coordinate() before work() runs.
    expect(_inFlightSize()).toBe(1);

    // Allow the deferred work() to actually run, populating resolveWork.
    await flush();
    expect(typeof resolveWork).toBe('function');

    resolveWork({ done: true });
    await p;
    await flush();
    expect(_inFlightSize()).toBe(0);
  });
});
