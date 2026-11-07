// Shared state for one simulated classroom, plus the simulated teacher.
//
// The teacher follows the real teacher client (frontend RoomDetailPage "Create Q" path):
//   POST /auth/login -> POST /rooms -> socket connect + 'room:join' (owner)
//   per poll: POST /questions {status:'approved'} -> emit 'new_question' {roomCode, question}
//             -> wait timeToAnswer -> POST /responses/leaderboard/:roomId/segment-done
//   end:      PUT /rooms/:id {isActive:false, endedAt}  (server emits 'room:ended')
//
// Teacher and students run in this one process, so the teacher's launch time and each student's
// receive time share a clock: poll_delivery is a true end-to-end fan-out latency.
import { io } from 'socket.io-client'
import { questionFor } from './questions.mjs'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export class Session {
  constructor() {
    this.roomId = null
    this.roomCode = null
    this.polls = new Map()   // questionId -> { index, type, launchedAt, received, accepted, rejected }
    // Leaderboard broadcasts, grouped so the fan-out spread compares receipts of the SAME broadcast.
    // (A time window would merge two broadcasts that land close together, e.g. the last segment fold
    // and the room-end recompute.)
    //   traced (SERVER_EVENT_TRACE=on): by the broadcast's own sequence number (__lt s:n). Exact,
    //     even when a student misses a push or one arrives late.
    //   untraced: by each student's receipt order, a student's k-th push belongs to broadcast k.
    //     A student who missed one (e.g. while disconnected) shifts every later receipt by one,
    //     so after any disconnect the grouping is reported as approximate.
    this.pushes = []                // untraced: pushes[k] = [receipt times]
    this.tracedPushes = new Map()   // traced: "stream:seq" -> { stream, seq, times: [receipt times] }
    this.disconnects = 0
    this.roomEndedReceipts = 0
  }

  /** Record a student's `nth` (0-based) untraced leaderboard receipt. */
  noteLeaderboardPush(nth, now = performance.now()) {
    if (!this.pushes[nth]) this.pushes[nth] = []
    this.pushes[nth].push(now)
  }

  /** Record a receipt of the traced broadcast `trace` ({ s: streamId, n: seq }). */
  noteTracedLeaderboardPush(trace, now = performance.now()) {
    const key = `${trace.s}:${trace.n}`
    let g = this.tracedPushes.get(key)
    if (!g) { g = { stream: trace.s, seq: trace.n, times: [] }; this.tracedPushes.set(key, g) }
    g.times.push(now)
  }

  /** A student's socket dropped mid-run (makes untraced grouping approximate). */
  noteDisconnect() { this.disconnects++ }

  // Every broadcast group: traced ones in order of first receipt, then any untraced ones in order.
  _groups() {
    const traced = [...this.tracedPushes.values()]
      .map(g => ({ seq: g.seq, times: g.times, first: Math.min(...g.times) }))
      .sort((a, b) => a.first - b.first || a.seq - b.seq)
    const untraced = this.pushes.filter(Boolean).map(times => ({ seq: null, times, first: Math.min(...times) }))
    return [...traced, ...untraced]
  }

  /** Earliest first-receipt time of any broadcast first received after `t`, or null. */
  firstPushAfter(t) {
    let best = null
    for (const g of this._groups()) if (g.first > t && (best === null || g.first < best)) best = g.first
    return best
  }

  /** Per broadcast: its seq (traced) or null, how many students got it, and the fan-out spread. */
  pushStats() {
    return this._groups().map(({ seq, times, first }) => ({
      seq,
      receipts: times.length,
      spreads: times.map(t => t - first),
      spreadMs: Math.round(Math.max(...times) - first)
    }))
  }

  /** How the broadcasts were grouped, and whether the per-broadcast figures are exact. */
  pushGrouping() {
    const traced = this.tracedPushes.size > 0
    const untraced = this.pushes.length > 0
    if (traced && untraced) {
      return { mode: 'mixed', approximate: true, reason: 'some leaderboard pushes carried no trace sequence number and were grouped by receipt order' }
    }
    if (traced) return { mode: 'sequence', approximate: false, reason: null }
    if (!untraced) return { mode: 'none', approximate: false, reason: null }
    if (this.disconnects > 0) {
      return {
        mode: 'receipt-order',
        approximate: true,
        reason: `grouped by each student's receipt order; ${this.disconnects} disconnect(s) may have shifted a student's later pushes into the wrong broadcast (run with SERVER_EVENT_TRACE=on for exact grouping)`
      }
    }
    return { mode: 'receipt-order', approximate: false, reason: null }
  }

  noteRoomEnded() { this.roomEndedReceipts++ }
}

export class SimTeacher {
  // `connect` and `joinTimeoutMs` exist for the unit tests (a fake socket, a short timeout).
  constructor({ email, cfg, api, rec, session, connect = io, joinTimeoutMs = 20000 }) {
    Object.assign(this, { email, cfg, api, rec, session, connect, joinTimeoutMs })
    this.token = null
    this.socket = null
    this.segmentDoneAt = []
  }

  async setup() {
    const { rec, api, cfg, session } = this
    const login = await rec.time('teacher_login', () =>
      api('/auth/login', { method: 'POST', body: { email: this.email, password: cfg.password } }))
    this.token = login.token

    const created = await rec.time('teacher_create_room', () => api('/rooms', {
      method: 'POST',
      token: this.token,
      body: { name: `Load test ${new Date().toISOString().slice(0, 19).replace('T', ' ')}` }
    }))
    session.roomId = created.room._id
    session.roomCode = created.room.code

    await new Promise((resolve, reject) => {
      const socket = this.connect(cfg.baseUrl, { path: cfg.socketPath, auth: { token: this.token }, transports: ['websocket', 'polling'], timeout: 20000 })
      this.socket = socket
      // Settles exactly once. On failure the socket is closed here, so a failed setup never leaves
      // a socket reconnecting in the background (which would keep the process alive).
      let settled = false
      const finish = (err) => {
        if (settled) return
        settled = true
        clearTimeout(t)
        socket.off('room:joined', onJoined)
        socket.off('room:error', onError)
        if (!err) return resolve()
        socket.close()
        reject(err)
      }
      const t = setTimeout(() => finish(new Error('teacher socket/join timeout')), this.joinTimeoutMs)
      const onJoined = (d) => { if (d?.roomCode === session.roomCode) finish() }
      const onError = (d) => finish(new Error(`teacher room:error ${d?.error}`))
      socket.on('connect', () => {
        socket.emit('authenticate', { token: this.token })
        socket.emit('room:join', { roomCode: session.roomCode })
      })
      socket.on('room:joined', onJoined)
      socket.on('room:error', onError)
      socket.on('connect_error', () => rec.count('teacherConnectErrors'))
    })
  }

  /** Create + launch one hand-written poll, wait out its answer window, then close the segment. */
  async runPoll(index) {
    const { rec, api, cfg, session } = this
    const tpl = questionFor(index)
    const created = await rec.time('teacher_create_question', () => api('/questions', {
      method: 'POST',
      token: this.token,
      body: {
        roomId: session.roomId,
        type: tpl.type,
        question: `${tpl.question} (#${index + 1})`,
        options: tpl.options,
        timeToAnswer: cfg.answerSeconds,
        points: 100,
        status: 'approved',
        segmentIndex: index
      }
    }))
    const q = created.question
    // recovered: students who missed the socket push during an outage but got the poll from the resync.
    const entry = { index, questionId: String(q._id), type: q.type, launchedAt: performance.now(), received: 0, recovered: 0, accepted: 0, rejected: 0 }
    session.polls.set(entry.questionId, entry)
    this.socket.emit('new_question', { roomCode: session.roomCode, question: q })
    rec.count('pollsLaunched')

    // The teacher's pop-up closes when the timer ends; the frontend then posts segment-done.
    await sleep(cfg.answerSeconds * 1000 + 1500) // + grace for the last jittered submits to land
    await rec.time('teacher_segment_done', () =>
      api(`/responses/leaderboard/${session.roomId}/segment-done`, { method: 'POST', token: this.token })).catch(() => {})
    this.segmentDoneAt.push(performance.now())
    return entry
  }

  /**
   * Wait (up to settleSeconds) for a leaderboard broadcast that started after the last segment-done.
   * Returns the outcome for the verdict:
   *   { status: 'received', afterMs } | { status: 'missing', waitedSeconds } | { status: 'not_checked', reason }
   * 'not_checked' (no poll ever sent segment-done) returns at once; there is nothing to wait for.
   */
  async waitForFinalLeaderboard() {
    const last = this.segmentDoneAt[this.segmentDoneAt.length - 1]
    if (last == null) return { status: 'not_checked', reason: 'no poll completed, so no segment-done was sent' }
    const deadline = performance.now() + this.cfg.settleSeconds * 1000
    while (performance.now() < deadline) {
      const first = this.session.firstPushAfter(last)
      if (first != null) {
        this.rec.sample('leaderboard_push_after_segment_done', first - last)
        await sleep(2000) // let the rest of the fan-out land
        return { status: 'received', afterMs: Math.round(first - last) }
      }
      await sleep(250)
    }
    this.rec.count('leaderboardPushMissing')
    return { status: 'missing', waitedSeconds: this.cfg.settleSeconds }
  }

  // Same body as the teacher console's "End session" (RoomDetailPage): the server only treats the
  // room as ended, emits 'room:ended' and pre-warms results when endedAt is set alongside isActive.
  async endRoom() {
    await this.rec.time('teacher_end_room', () => this.api(`/rooms/${this.session.roomId}`, {
      method: 'PUT', token: this.token, body: { isActive: false, endedAt: new Date().toISOString() }
    })).catch(() => {})
  }

  stop() { this.socket?.close() } // idempotent: also safe after a failed setup already closed it
}
