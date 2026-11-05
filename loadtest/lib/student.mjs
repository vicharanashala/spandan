// One simulated student, following the real student client (frontend StudentRoomPage +
// socketStore) step for step:
//
//   POST /auth/login -> GET /rooms/join/:code -> socket connect (auth.token in the handshake)
//   -> emit 'authenticate' + 'room:join' -> wait for 'room:joined' for our room
//   -> GET /responses/room/:roomId/student/:id (past answers) -> GET /responses/leaderboard/:roomId
//   on 'new_question': think, freeze responseTime, 0-2 s jitter, POST /responses
//   when the poll's timer runs out: GET past answers again (the client does this for everyone)
//   on reconnect: re-emit 'authenticate' + 'room:join' and re-fetch past answers (self-heal)
import { io } from 'socket.io-client'
import { pickOptions, answerPlan } from './questions.mjs'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export class SimStudent {
  constructor({ index, email, cfg, api, rec, session }) {
    Object.assign(this, { index, email, cfg, api, rec, session })
    this.token = null
    this.userId = null
    this.socket = null
    this.closing = false
    this.joined = false
    this.everConnected = false
    this.disconnectedAt = null
    this.timers = new Set()
    this.leaderboardPushes = 0
    this.received = new Set() // questionIds received
    this.answered = new Set()
  }

  _later(ms, fn) {
    const t = setTimeout(() => { this.timers.delete(t); if (!this.closing) fn() }, ms)
    this.timers.add(t)
  }

  /** Log in, join over HTTP and the socket, then load past answers and the leaderboard. */
  async start() {
    const { rec, api, session, cfg } = this
    const login = await rec.time('login', () =>
      api('/auth/login', { method: 'POST', body: { email: this.email, password: cfg.password } }))
    this.token = login.token
    this.userId = login.user?._id || login.user?.id
    if (!this.token || !this.userId) throw new Error('login returned no token/user')

    await rec.time('join_http', () => api(`/rooms/join/${session.roomCode}`, { token: this.token }))
    await this._connect()
    await this._joinRoom()
    this.joined = true
    rec.count('studentsJoined')

    await rec.time('past_responses', () => this._pastResponses()).catch(() => {})
    await rec.time('leaderboard_get', () => this._leaderboard()).catch(() => {})
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

  _connect() {
    const { cfg, rec } = this
    return new Promise((resolve, reject) => {
      const started = performance.now()
      const socket = io(cfg.baseUrl, {
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
      const fail = (err) => {
        if (settled) return
        settled = true
        clearTimeout(guard)
        rec.failure('socket_connect', err)
        rec.count('connectFailures')
        socket.close()
        reject(err)
      }
      const guard = setTimeout(() => fail(Object.assign(new Error('socket connect timeout'), { name: 'TimeoutError' })), 20000)

      socket.on('connect', () => {
        if (!settled) {
          settled = true
          clearTimeout(guard)
          this.everConnected = true
          rec.success('socket_connect', performance.now() - started)
          resolve()
          return
        }
        // A reconnect: the real socketStore re-authenticates and re-joins the remembered room.
        rec.count('reconnects')
        if (this.disconnectedAt != null) rec.sample('reconnect_time', performance.now() - this.disconnectedAt)
        this.disconnectedAt = null
        socket.emit('authenticate', { token: this.token })
        if (this.joined) socket.emit('room:join', { roomCode: this.session.roomCode, userId: this.userId })
        rec.time('past_responses_after_reconnect', () => this._pastResponses()).catch(() => {})
      })
      socket.on('connect_error', (err) => {
        rec.count('connectErrors')
        // The first attempt keeps retrying (reconnection: true) until the guard times out.
        if (settled && !this.closing && this.disconnectedAt == null) this.disconnectedAt = performance.now()
        void err
      })
      socket.on('disconnect', (reason) => {
        if (this.closing) return
        rec.count('disconnects')
        rec.count(`disconnect:${reason}`)
        this.disconnectedAt = performance.now()
      })

      socket.on('room:error', (data) => rec.failure('room_join_socket', Object.assign(new Error(data?.error || 'room:error'), { code: data?.error })))
      socket.on('room:joined', () => rec.count('evt:room:joined'))
      socket.on('room:left', () => rec.count('evt:room:left'))
      socket.on('counts:updated', () => rec.count('evt:counts:updated'))
      socket.on('leaderboard:updated', () => this._onLeaderboardPush())
      socket.on('leaderboard:you', () => rec.count('evt:leaderboard:you'))
      socket.on('new_question', (q) => this._onQuestion(q))
      socket.on('room:ended', () => { rec.count('evt:room:ended'); this.session.noteRoomEnded() })
    })
  }

  _joinRoom() {
    const { socket, session, rec } = this
    return rec.time('join_socket', () => new Promise((resolve, reject) => {
      const t = setTimeout(() => { socket.off('room:joined', onJoined); reject(Object.assign(new Error('room:join timeout'), { name: 'TimeoutError' })) }, 15000)
      const onJoined = (data) => {
        if (data?.roomCode !== session.roomCode) return
        clearTimeout(t)
        socket.off('room:joined', onJoined)
        resolve()
      }
      socket.on('room:joined', onJoined)
      // The socket already authenticated in the handshake; the real client still re-sends both.
      socket.emit('authenticate', { token: this.token })
      socket.emit('room:join', { roomCode: session.roomCode, userId: this.userId })
    }))
  }

  _onLeaderboardPush() {
    this.rec.count('evt:leaderboard:updated')
    this.session.noteLeaderboardPush(this.leaderboardPushes++)
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
    for (const t of this.timers) clearTimeout(t)
    this.timers.clear()
    if (this.socket) this.socket.close()
    await sleep(0)
  }
}
