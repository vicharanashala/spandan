/**
 * Response Coordinator
 * --------------------
 * A backend utility for collapsing concurrent identical submissions into a
 * single in-flight write against the database. The motivating problem is the
 * dual submission path in Spandan's StudentRoomPage, where a student may end
 * up calling BOTH the HTTP POST /api/responses and the socket 'response:submit'
 * emit for the same logical answer. Both paths land in the same saveResponse
 * handler, which inserts a document keyed on (roomId, questionId, studentId).
 * MongoDB then throws E11000 duplicate-key on the second insert.
 *
 * This utility does NOT modify saveResponse or any other existing handler.
 * It is a wrapper the handler may opt to use. Behavior:
 *
 *   - coordinate(key, work) returns a Promise
 *   - the FIRST call for a given key runs `work` and caches its Promise
 *   - subsequent calls with the same key (before settle) receive the SAME
 *     Promise — same resolution, same value, same rejection
 *   - once `work` settles (resolve or reject), the slot is cleared so the
 *     NEXT legitimate retry can run cleanly
 *   - errors from `work` are propagated; the slot is cleared even on reject
 *
 * Operationally:
 *   - safe under concurrent same-key callers
 *   - safe under sequential retries (slot cleared on settle)
 *   - not intended to be used to mask genuine bugs — callers should pass
 *     a deterministic key derived from logical identity, not from request id
 *
 * Also exports:
 *   - key(...)         helper to build the canonical key string
 *   - buildResyncPayload(snapshot)  shape for socket re-sync broadcasts
 *   - buildAckPayload(saved)        shape for the HTTP / socket ACK frame
 *   - detectDuplicateKeyError(err)  true when err is a Mongo E11000 on the
 *                                   responses unique index
 *   - _inFlightSize / _resetInFlight  test-only inspection / reset
 */

export function key(roomId, questionId, studentId) {
  if (!roomId || !questionId || !studentId) {
    throw new Error('responseCoordinator.key: roomId, questionId, and studentId are all required');
  }
  return `${roomId}:${questionId}:${studentId}`;
}

const _inFlight = new Map();

function _safeGet(k) {
  return _inFlight.get(k);
}

function _safeSet(k, v) {
  _inFlight.set(k, v);
}

function _safeDelete(k) {
  _inFlight.delete(k);
}

export function _inFlightSize() {
  return _inFlight.size;
}

export function _resetInFlight() {
  _inFlight.clear();
}

export function coordinate(compositeKey, work) {
  if (typeof compositeKey !== 'string' || compositeKey.length === 0) {
    return Promise.reject(new Error('responseCoordinator.coordinate: compositeKey must be a non-empty string'));
  }
  if (typeof work !== 'function') {
    return Promise.reject(new Error('responseCoordinator.coordinate: work must be a function returning a Promise'));
  }

  const existing = _safeGet(compositeKey);
  if (existing) return existing;

  let promise;
  try {
    promise = Promise.resolve().then(() => work());
  } catch (syncErr) {
    return Promise.reject(syncErr);
  }

  _safeSet(compositeKey, promise);

  const settle = () => {
    if (_safeGet(compositeKey) === promise) {
      _safeDelete(compositeKey);
    }
  };
  promise.then(settle, settle);

  return promise;
}

export function buildResyncPayload(snapshot) {
  const s = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return {
    type: 'response:resync',
    roomId: typeof s.roomId === 'string' ? s.roomId : null,
    questionId: typeof s.questionId === 'string' ? s.questionId : null,
    studentId: typeof s.studentId === 'string' ? s.studentId : null,
    status: typeof s.status === 'string' ? s.status : 'recorded',
    receivedAt: typeof s.receivedAt === 'number' ? s.receivedAt : Date.now()
  };
}

export function buildAckPayload(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const savedAt = s.savedAt instanceof Date
    ? s.savedAt.toISOString()
    : (typeof s.savedAt === 'string' ? s.savedAt : new Date().toISOString());
  return {
    ok: true,
    responseId: s._id ? String(s._id) : null,
    roomId: typeof s.roomId === 'string' ? s.roomId : null,
    questionId: typeof s.questionId === 'string' ? s.questionId : null,
    studentId: typeof s.studentId === 'string' ? s.studentId : null,
    pointsAwarded: Number.isFinite(s.pointsAwarded) ? s.pointsAwarded : 0,
    correct: typeof s.correct === 'boolean' ? s.correct : null,
    savedAt
  };
}

export function detectDuplicateKeyError(err) {
  if (!err || typeof err !== 'object') return false;
  const code = err.code;
  const codeName = err.codeName;
  if (code === 11000 || code === 11001) return true;
  if (codeName === 'DuplicateKey' || codeName === 'DuplicateKeyError') return true;
  return false;
}
