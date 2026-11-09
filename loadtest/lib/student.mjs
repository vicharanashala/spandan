// One simulated student, following the real student client (frontend StudentRoomPage +
// socketStore) step for step:
//
//   POST /auth/login -> GET /rooms/join/:code -> socket connect (auth.token in the handshake)
//   -> emit 'authenticate' + 'room:join' -> wait for 'room:joined' for our room
//   -> GET /responses/room/:roomId/student/:id (past answers) -> GET /responses/leaderboard/:roomId
//   on 'new_question': think, freeze responseTime, 0-2 s jitter, POST /responses
//   when the poll's timer runs out: GET past answers again (the client does this for everyone)
//   on reconnect: re-emit 'authenticate' + 'room:join' and re-fetch past answers (self-heal)
//
// Delivery tracking (only when the backend runs with SERVER_EVENT_TRACE=on): every stamped room
// broadcast goes through a DeliveryTracker (lib/delivery.mjs), 'lt:hello' sets its baseline, and
// each disconnect becomes an outage record: how long the socket was down, how long the re-join and
// the resync took, how many broadcasts were missed, and whether missed polls came back via the resync.
import { io } from 'socket.io-client'
import { pickOptions, answerPlan } from './questions.mjs'
import { DeliveryTracker, DEFAULT_LATE_MS } from './delivery.mjs'
import { isLocalUrl } from './config.mjs'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export const HELLO_EVENT = 'lt:hello'
export const TRACE_FIELD = '__lt'
export const REJOIN_TIMEOUT_MS = 15000 // traced: no lt:hello this long after a reconnect = stuck
const MAX_OUTAGES_PER_STUDENT = 50

const questionIdOf = (q) => String(q?._id ?? q?.id ?? q?.questionId ?? '')

// A start abandoned because the run is shutting down. It is NOT a failure: callers must not record
// it as a failed operation or a failed student (see isStopped).
export const STOPPED = 'STUDENT_STOPPED'
const stoppedError = (during) => Object.assign(new Error(`student stopped during ${during}`), { name: 'AbortError', code: STOPPED })
export const isStopped = (err) => err?.code === STOPPED

export class SimStudent {
  // `connect` (the socket.io-client factory) and the two timeouts exist for the unit tests.
  constructor({ index, email, cfg, api, rec, session, connect = io, connectTimeoutMs = 20000, joinTimeoutMs = 15000 }) {
    Object.assign(this, { index, email, cfg, api, rec, session, connect, connectTimeoutMs, joinTimeoutMs })
    this.token = null
    this.userId = null
    this.socket = null
    this.closing = false
    this.joined = false
    this.joinedAt = null
    this.everConnected = false
    this.disconnectedAt = null
    this.timers = new Set()
    this.aborts = new Set()   // settle a pending connect / join when stop() is called
    this.closedOut = false    // finishDelivery() ran: the saved records must not change after this
    this.leaderboardPushes = 0          // untraced pushes received (receipt-order grouping)
    this.leaderboardSeqs = new Set()    // traced pushes received, as "stream:seq"
    this.received = new Set() // questionIds received
    this.answered = new Set()
    this.recoveredIds = new Set() // questionIds missed on the socket but returned by a resync
    // Latency against the server's stamp is only meaningful when both share this machine's clock.
    this.delivery = new DeliveryTracker({
      lateMs: cfg?.lateMs ?? DEFAULT_LATE_MS,
      clockComparable: isLocalUrl(cfg?.baseUrl)
    })
    // One resync retry after the backend's question-cache lifetime (0 = no retry); see config.mjs.
    this.resyncRetryMs = Number(cfg?.resyncRetryMs) > 0 ? Number(cfg.resyncRetryMs) : 0
    this.hellos = 0
    this.outages = []        // finished and open outage records
    this.outage = null       // the open outage: socket down, not reconnected yet
    this.pendingRejoin = null // reconnected, waiting for lt:hello
  }

  _later(ms, fn) {
    const t = setTimeout(() => { this.timers.delete(t); if (!this.closing) fn() }, ms)
    this.timers.add(t)
  }

  /**
   * Log in, join over HTTP and the socket, then load past answers and the leaderboard.
   * Abandons (throws) as soon as stop() has been called, so a start still in flight when the run shuts
   * down never opens a socket afterwards.
   */
  async start() {
    const { rec, api, session, cfg } = this
    const login = await rec.time('login', () =>
      api('/auth/login', { method: 'POST', body: { email: this.email, password: cfg.password } }))
    this._throwIfClosing()
    this.token = login.token
    this.userId = login.user?._id || login.user?.id
    if (!this.token || !this.userId) throw new Error('login returned no token/user')

    await rec.time('join_http', () => api(`/rooms/join/${session.roomCode}`, { token: this.token }))
    this._throwIfClosing()
    await this._connect()
    this._throwIfClosing()
    await this._joinRoom()
    this._throwIfClosing()
    this.joined = true
    this.joinedAt = performance.now()
    rec.count('studentsJoined')

    await rec.time('past_responses', () => this._pastResponses()).catch(() => {})
    await rec.time('leaderboard_get', () => this._leaderboard()).catch(() => {})
  }

  _throwIfClosing() {
    if (this.closing) throw stoppedError('start')
  }

  _pastResponses() {
    return this.api(`/responses/room/${this.session.roomId}/student/${this.userId}`, { token: this.token })
  }

  _leaderboard() {
    return this.api(`/responses/leaderboard/${this.session.roomId}`, { token: this.token })
  }

  /** Extra leaderboard check after the polls, so the read path is measured under a populated board. */
  async checkLeaderboard() {
    if (!this.joined || this.closing) return
    await this.rec.time('leaderboard_get_final', () => this._leaderboard()).catch(() => {})
  }

  _connect({ connect = this.connect, timeoutMs = this.connectTimeoutMs } = {}) {
    const { cfg, rec } = this
    return new Promise((resolve, reject) => {
      if (this.closing) return reject(stoppedError('socket connect'))
      const started = performance.now()
      const socket = connect(cfg.baseUrl, {
        path: cfg.socketPath,
        auth: { token: this.token },
        transports: ['websocket', 'polling'], // same order as the real client
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
      })
      this.socket = socket
      let settled = false
      // Exactly one of: connected, failed (recorded), or stopped by stop() (NOT recorded).
      const settle = () => {
        settled = true
        clearTimeout(guard)
        this.timers.delete(guard)
        this.aborts.delete(abort)
      }
      const fail = (err) => {
        if (settled) return
        settle()
        rec.failure('socket_connect', err)
        rec.count('connectFailures')
        socket.close()
        reject(err)
      }
      const abort = () => {
        if (settled) return
        settle()
        socket.close()
        reject(stoppedError('socket connect'))
      }
      const guard = setTimeout(() => fail(Object.assign(new Error('socket connect timeout'), { name: 'TimeoutError' })), timeoutMs)
      this.timers.add(guard)
      this.aborts.add(abort)

      socket.on('connect', () => {
        if (!settled) {
          settle()
          this.everConnected = true
          rec.success('socket_connect', performance.now() - started)
          resolve()
          return
        }
        this._onReconnect()
      })
      socket.on('connect_error', (err) => {
        rec.count('connectErrors')
        // The first attempt keeps retrying (reconnection: true) until the guard times out.
        if (settled && !this.closing && this.disconnectedAt == null) this.disconnectedAt = performance.now()
        void err
      })
      socket.on('disconnect', (reason) => this._onDisconnect(reason))

      // Traced broadcasts carry __lt; the tracker ignores everything else. Registered before any
      // room:join, so the first lt:hello and every broadcast after it are seen.
      socket.on(HELLO_EVENT, (h) => this._onHello(h))
      socket.onAny((event, payload) => this._onTraced(event, payload))

      socket.on('room:error', (data) => rec.failure('room_join_socket', Object.assign(new Error(data?.error || 'room:error'), { code: data?.error })))
      socket.on('room:joined', () => rec.count('evt:room:joined'))
      socket.on('room:left', () => rec.count('evt:room:left'))
      socket.on('counts:updated', () => rec.count('evt:counts:updated'))
      socket.on('leaderboard:updated', (payload) => this._onLeaderboardPush(payload))
      socket.on('leaderboard:you', () => rec.count('evt:leaderboard:you'))
      socket.on('new_question', (q) => this._onQuestion(q))
      socket.on('room:ended', () => { rec.count('evt:room:ended'); this.session.noteRoomEnded() })
    })
  }

  _onDisconnect(reason, now = performance.now()) {
    if (this.closing) return
    const { rec } = this
    rec.count('disconnects')
    rec.count(`disconnect:${reason}`)
    this.disconnectedAt = now
    this.delivery.disconnected()
    this.session.noteDisconnect()
    // A drop while still waiting for the re-join: that outage is over, unfinished.
    if (this.pendingRejoin) { this.pendingRejoin.stuck = this.hellos > 0; this.pendingRejoin = null }
    if (this.outage) return
    this.outage = {
      student: this.index,
      atSec: Math.round(rec.elapsedSeconds() * 10) / 10,
      reason: String(reason),
      outageMs: null, rejoinMs: null, resyncMs: null,
      missedSeqs: null, missedQuestions: [], recovered: null, stuck: false,
      _startedAt: now, _connectedAt: null, _rejoinedAt: null
    }
    if (this.outages.length < MAX_OUTAGES_PER_STUDENT) this.outages.push(this.outage)
  }

  // A reconnect: the real socketStore re-authenticates and re-joins the remembered room.
  _onReconnect(now = performance.now()) {
    const { rec, socket } = this
    rec.count('reconnects')
    if (this.disconnectedAt != null) rec.sample('reconnect_time', now - this.disconnectedAt)
    this.disconnectedAt = null
    const o = this.outage
    this.outage = null
    if (o) {
      o.outageMs = Math.round(now - o._startedAt)
      o._connectedAt = now
      this.pendingRejoin = o
      // Traced runs know when the re-join landed (lt:hello); without tracing there is no reliable
      // own-join signal (room:joined is a room-wide broadcast), so rejoinMs stays null.
      this._later(REJOIN_TIMEOUT_MS, () => {
        if (this.pendingRejoin === o && this.hellos > 0) { o.stuck = true; this.pendingRejoin = null; rec.count('rejoinStuck') }
      })
    }
    socket.emit('authenticate', { token: this.token })
    if (this.joined) socket.emit('room:join', { roomCode: this.session.roomCode, userId: this.userId })
    rec.time('past_responses_after_reconnect', () => this._pastResponses())
      .then((data) => { if (o) this._onResync(o, data) })
      .catch(() => {})
  }

  _onHello(h, now = performance.now()) {
    this.hellos++
    const missed = this.delivery.hello(h)
    const o = this.pendingRejoin
    if (o) {
      o.rejoinMs = Math.round(now - o._connectedAt)
      o._rejoinedAt = now
      o.missedSeqs = missed
      o.stuck = false
      this.pendingRejoin = null
    }
  }

  _onTraced(event, payload) {
    const trace = payload && typeof payload === 'object' ? payload[TRACE_FIELD] : undefined
    if (trace) this.delivery.receive(event, trace, Date.now())
  }

  /**
   * Resync after a reconnect: which polls had we not received by now, and did the resync return them?
   * Each missed poll becomes { questionId, poll, recovered, recoveredAfterMs, retry }:
   *   recoveredAfterMs  reconnect -> the fetch that returned it (null while not recovered)
   *   retry             'none'          not needed, or retries are off (--resync-retry-ms 0)
   *                     'recovered'     the first fetch missed it, the one retry returned it
   *                     'still_missing' the retry did not return it either   -> stays a FAIL
   *                     'not_completed' the run ended before the retry ran   -> stays a FAIL
   * The backend caches each room's question list (default 10 s) without invalidating it on launch, so
   * the first fetch can miss a just-launched poll; the retry waits that out. A poll counts as
   * recovered only when a fetch actually returned it.
   */
  _onResync(o, data, now = performance.now()) {
    // A resync still in flight at close-out must not change the saved records or poll counts.
    if (this.closedOut) return
    o.resyncMs = o._connectedAt != null ? Math.round(now - o._connectedAt) : null
    const returned = new Set((data?.questions || []).map(questionIdOf))
    // Polls launched after the re-join reach this socket normally, so only earlier ones can be missed.
    const until = o._rejoinedAt ?? now
    const pending = []
    for (const p of this.session.polls.values()) {
      if (p.launchedAt > until || (this.joinedAt != null && p.launchedAt < this.joinedAt)) continue
      if (this.received.has(p.questionId) || this.recoveredIds.has(p.questionId)) continue
      const back = returned.has(p.questionId)
      const entry = { questionId: p.questionId, poll: p.index + 1, recovered: back, recoveredAfterMs: back ? o.resyncMs : null, retry: 'none' }
      o.missedQuestions.push(entry)
      if (back) this._markRecovered(p)
      else pending.push({ entry, p })
    }
    if (!pending.length || !this.resyncRetryMs) { o.recovered = pending.length === 0; return }

    // Undecided until the retry: neither a pass nor a fail yet.
    o.recovered = null
    o._retry = pending
    for (const { entry } of pending) entry.retry = 'not_completed' // stays so if the run ends first
    this._later(this.resyncRetryMs, () => {
      this.rec.time('past_responses_resync_retry', () => this._pastResponses())
        .then((d) => this._onResyncRetry(o, d), () => this._onResyncRetry(o, null))
    })
  }

  _onResyncRetry(o, data, now = performance.now()) {
    if (this.closedOut || !o._retry) return
    const returned = new Set((data?.questions || []).map(questionIdOf))
    for (const { entry, p } of o._retry) {
      if (returned.has(p.questionId)) {
        entry.recovered = true
        entry.recoveredAfterMs = o._connectedAt != null ? Math.round(now - o._connectedAt) : null
        entry.retry = 'recovered'
        if (!this.recoveredIds.has(p.questionId)) this._markRecovered(p)
      } else {
        entry.retry = 'still_missing'
      }
    }
    o._retry = null
    o.recovered = o.missedQuestions.every(q => q.recovered)
  }

  _markRecovered(p) {
    this.recoveredIds.add(p.questionId)
    p.recovered = (p.recovered || 0) + 1
  }

  /**
   * Close out delivery tracking. Call after the last broadcast and the server ledger read, but BEFORE
   * stop(): a socket still open here is connected, so a normal shutdown never looks like an outage.
   */
  finishDelivery(ledger, now = performance.now()) {
    if (this.outage) {
      // Still down at the end of the run (e.g. 'io server disconnect' never auto-reconnects).
      this.outage.outageMs = Math.round(now - this.outage._startedAt)
      this.outage.stuck = true
    }
    if (this.pendingRejoin && this.hellos > 0) this.pendingRejoin.stuck = true
    // A retry the run ended before: those polls were never returned, so they are not recovered.
    for (const o of this.outages) if (o._retry) { o._retry = null; o.recovered = false }
    this.closedOut = true
    // Deep copies: nothing that happens after close-out can reach the saved records.
    const outages = this.outages.map(o => ({
      ...Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_'))),
      missedQuestions: o.missedQuestions.map(q => ({ ...q }))
    }))
    return { delivery: this.delivery.summary(ledger), outages, traced: this.hellos > 0 }
  }

  // Timed like rec.time('join_socket'), except that a stop() during the join is not a failure.
  async _joinRoom({ timeoutMs = this.joinTimeoutMs } = {}) {
    const started = performance.now()
    try {
      await this._joinRoomOnce(timeoutMs)
      this.rec.success('join_socket', performance.now() - started)
    } catch (err) {
      if (!isStopped(err)) this.rec.failure('join_socket', err)
      throw err
    }
  }

  _joinRoomOnce(timeoutMs) {
    const { socket, session } = this
    return new Promise((resolve, reject) => {
      if (this.closing) return reject(stoppedError('room join'))
      let settled = false
      const finish = (err) => {
        if (settled) return
        settled = true
        clearTimeout(t)
        this.timers.delete(t)
        this.aborts.delete(abort)
        socket.off('room:joined', onJoined)
        if (err) reject(err); else resolve()
      }
      const onJoined = (data) => { if (data?.roomCode === session.roomCode) finish() }
      const abort = () => finish(stoppedError('room join'))
      const t = setTimeout(() => finish(Object.assign(new Error('room:join timeout'), { name: 'TimeoutError' })), timeoutMs)
      this.timers.add(t)
      this.aborts.add(abort)
      socket.on('room:joined', onJoined)
      // The socket already authenticated in the handshake; the real client still re-sends both.
      socket.emit('authenticate', { token: this.token })
      socket.emit('room:join', { roomCode: session.roomCode, userId: this.userId })
    })
  }

  // Traced pushes are grouped by their own seq (exact); untraced ones by this student's receipt order.
  // A repeated seq is a duplicate delivery (the delivery tracker counts it) and must not add a second
  // receipt to its broadcast.
  _onLeaderboardPush(payload, now = performance.now()) {
    this.rec.count('evt:leaderboard:updated')
    const t = payload && typeof payload === 'object' ? payload[TRACE_FIELD] : null
    if (t && typeof t.s === 'string' && Number.isInteger(t.n) && t.n >= 0) {
      const key = `${t.s}:${t.n}`
      if (this.leaderboardSeqs.has(key)) return
      this.leaderboardSeqs.add(key)
      this.session.noteTracedLeaderboardPush(t, now)
      return
    }
    this.session.noteLeaderboardPush(this.leaderboardPushes++, now)
  }

  _onQuestion(q) {
    const { rec, session, cfg } = this
    const qid = q?._id || q?.id
    rec.count('evt:new_question')
    if (!qid || this.received.has(qid)) return
    this.received.add(qid)
    const launch = session.polls.get(String(qid))
    if (launch) {
      launch.received++
      rec.sample('poll_delivery', performance.now() - launch.launchedAt)
    }
    if (q.options?.some(o => o && 'isCorrect' in o)) rec.count('answerKeyLeaked') // must stay 0

    const tta = Number(q.timeToAnswer) || 30
    // Timer expiry: the client re-fetches past answers for every student (frontend handleNewQuestion).
    this._later(tta * 1000, () => {
      rec.time('poll_expiry_refetch', () => this._pastResponses()).catch(() => {})
    })

    if (Math.random() >= cfg.answerRate) { rec.count('answersSkipped'); return }
    const plan = answerPlan(tta)
    this._later(plan.sendAtMs, () => this._answer(qid, q, plan, launch))
  }

  async _answer(qid, q, plan, launch) {
    const { rec, session } = this
    if (this.answered.has(qid)) return
    this.answered.add(qid)
    try {
      await rec.time('answer', () => this.api('/responses', {
        method: 'POST',
        token: this.token,
        body: {
          roomId: session.roomId,
          questionId: qid,
          studentId: this.userId,
          selectedOptions: pickOptions(q),
          responseTime: plan.responseTime
        }
      }))
      if (launch) launch.accepted++
    } catch {
      if (launch) launch.rejected++
    }
  }

  async stop() {
    this.closing = true
    // Settle a connect / join still pending (as "stopped", not a failure) before its timers go.
    for (const abort of [...this.aborts]) abort()
    for (const t of this.timers) clearTimeout(t)
    this.timers.clear()
    if (this.socket) this.socket.close()
    await sleep(0)
  }
}
