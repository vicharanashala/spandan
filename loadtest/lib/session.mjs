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
    // Leaderboard broadcasts, grouped by each student's receipt order: a student's k-th
    // 'leaderboard:updated' belongs to broadcast k. (A time window would merge two broadcasts that
    // land close together, e.g. the last segment fold and the room-end recompute.)
    this.pushes = []         // pushes[k] = [receipt times]
    this.roomEndedReceipts = 0
  }

  /** Record a student's `nth` (0-based) leaderboard receipt. */
  noteLeaderboardPush(nth, now = performance.now()) {
    if (!this.pushes[nth]) this.pushes[nth] = []
    this.pushes[nth].push(now)
  }

  /** First receipt time of any broadcast whose first receipt is after `t`, or null. */
  firstPushAfter(t) {
    for (const times of this.pushes) {
      const first = Math.min(...times)
      if (first > t) return first
    }
    return null
  }

  /** Per broadcast: how many students got it and the fan-out spread (first to each receipt). */
  pushStats() {
    return this.pushes.map((times) => {
      const first = Math.min(...times)
      return { receipts: times.length, spreads: times.map(t => t - first), spreadMs: Math.round(Math.max(...times) - first) }
    })
  }

  noteRoomEnded() { this.roomEndedReceipts++ }
}

export class SimTeacher {
  constructor({ email, cfg, api, rec, session }) {
    Object.assign(this, { email, cfg, api, rec, session })
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
      const socket = io(cfg.baseUrl, { path: cfg.socketPath, auth: { token: this.token }, transports: ['websocket', 'polling'], timeout: 20000 })
      this.socket = socket
      const t = setTimeout(() => reject(new Error('teacher socket/join timeout')), 20000)
      socket.on('connect', () => {
        socket.emit('authenticate', { token: this.token })
        socket.emit('room:join', { roomCode: session.roomCode })
      })
      const onJoined = (d) => {
        if (d?.roomCode !== session.roomCode) return
        clearTimeout(t)
        socket.off('room:joined', onJoined)
        resolve()
      }
      socket.on('room:joined', onJoined)
      socket.on('room:error', (d) => { clearTimeout(t); reject(new Error(`teacher room:error ${d?.error}`)) })
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
    const entry = { index, questionId: String(q._id), type: q.type, launchedAt: performance.now(), received: 0, accepted: 0, rejected: 0 }
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

  /** Wait (up to settleSeconds) for a leaderboard fold that started after the last segment-done. */
  async waitForFinalLeaderboard() {
    const last = this.segmentDoneAt[this.segmentDoneAt.length - 1]
    const deadline = performance.now() + this.cfg.settleSeconds * 1000
    while (performance.now() < deadline) {
      const first = last != null ? this.session.firstPushAfter(last) : null
      if (first != null) {
        this.rec.sample('leaderboard_push_after_segment_done', first - last)
        await sleep(2000) // let the rest of the fan-out land
        return true
      }
      await sleep(250)
    }
    this.rec.count('leaderboardPushMissing')
    return false
  }

  // Same body as the teacher console's "End session" (RoomDetailPage): the server only treats the
  // room as ended, emits 'room:ended' and pre-warms results when endedAt is set alongside isActive.
  async endRoom() {
    await this.rec.time('teacher_end_room', () => this.api(`/rooms/${this.session.roomId}`, {
      method: 'PUT', token: this.token, body: { isActive: false, endedAt: new Date().toISOString() }
    })).catch(() => {})
  }

  stop() { if (this.socket) this.socket.close() }
}
