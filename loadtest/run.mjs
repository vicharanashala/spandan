// Load test: simulate a surge of USERS students each doing the full live-session flow —
// login → socket connect → room:join → answer → read leaderboard — then hold the socket open.
// Reproduces the two failure modes we fixed: the login surge and the live-session O(N^2) fan-out.
//
//   BASE_URL=https://staging.spandan.fun API_PREFIX=/spandan USERS=1000 RAMP_MS=10000 node run.mjs
//
// Run `node seed.mjs` first. Point this at STAGING, never production.

import { readFile } from 'node:fs/promises'
import { io } from 'socket.io-client'
import { API, BASE_URL, SOCKET_PATH, USERS, RAMP_MS, STUDENT_PASSWORD, studentEmail, SEED_FILE } from './config.mjs'

const seed = JSON.parse(await readFile(SEED_FILE, 'utf8'))
const { roomId, roomCode, questionId } = seed

// ---- metrics ----
const samples = { login: [], connect: [], join: [], answer: [], leaderboard: [] }
const errors = { login: 0, connect: 0, join: 0, answer: 0, leaderboard: 0 }
let completed = 0
const sockets = []

const now = () => performance.now()
const pct = (arr, p) => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))])
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function apiJson(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, data }
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, { path: SOCKET_PATH, transports: ['websocket'], auth: { token }, reconnection: false, timeout: 20000 })
    const t = setTimeout(() => { socket.close(); reject(new Error('connect timeout')) }, 20000)
    socket.on('connect', () => { clearTimeout(t); resolve(socket) })
    socket.on('connect_error', (e) => { clearTimeout(t); reject(e) })
  })
}

function joinRoom(socket, userId, token) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('join timeout')), 15000)
    const onJoined = (data) => {
      if (data?.roomCode === roomCode) { clearTimeout(t); socket.off('room:joined', onJoined); resolve() }
    }
    socket.on('room:joined', onJoined)
    socket.emit('authenticate', { token })
    socket.emit('room:join', { roomCode, userId })
  })
}

async function student(i) {
  // 1. login (stresses bcrypt)
  let token, userId
  {
    const t0 = now()
    const r = await apiJson('/auth/login', { method: 'POST', body: { email: studentEmail(i), password: STUDENT_PASSWORD } })
    if (!r.ok) { errors.login++; return }
    samples.login.push(now() - t0)
    token = r.data.token
    userId = r.data.user?._id || r.data.user?.id
  }

  // 2. socket connect
  let socket
  try {
    const t0 = now()
    socket = await connectSocket(token)
    samples.connect.push(now() - t0)
    sockets.push(socket)
  } catch { errors.connect++; return }

  // 3. room:join (the join storm)
  try {
    const t0 = now()
    await joinRoom(socket, userId, token)
    samples.join.push(now() - t0)
  } catch { errors.join++ }

  // 4. answer (creates Response, invalidates leaderboard)
  try {
    const t0 = now()
    const r = await apiJson('/responses', {
      method: 'POST', token,
      body: { roomId, questionId, selectedOptions: [Math.floor(Math.random() * 4)], responseTime: 1 + Math.floor(Math.random() * 25) }
    })
    // 409 = already answered (on re-runs) is a valid, non-error outcome
    if (r.ok || r.status === 409) samples.answer.push(now() - t0)
    else errors.answer++
    // nudge the leaderboard refresh path like the real client does
    socket.emit('points:update', { roomCode })
  } catch { errors.answer++ }

  // 5. leaderboard read (the O(N^2)/cache path)
  try {
    const t0 = now()
    const r = await apiJson(`/responses/leaderboard/${roomId}`, { token })
    if (r.ok) samples.leaderboard.push(now() - t0)
    else errors.leaderboard++
  } catch { errors.leaderboard++ }

  completed++
}

function report() {
  const line = (name, arr, errs, thresholdP95) => {
    const p95 = pct(arr, 95)
    const okLat = thresholdP95 == null || p95 <= thresholdP95
    console.log(
      `${name.padEnd(12)} n=${String(arr.length).padStart(5)}  ` +
      `p50=${String(pct(arr, 50)).padStart(5)}ms  p95=${String(p95).padStart(5)}ms  ` +
      `p99=${String(pct(arr, 99)).padStart(6)}ms  max=${String(pct(arr, 100)).padStart(6)}ms  ` +
      `err=${errs}${thresholdP95 != null ? `   ${okLat ? 'PASS' : 'FAIL'} (p95<=${thresholdP95})` : ''}`
    )
    return okLat && errs <= USERS * 0.01
  }
  console.log('\n================ RESULTS ================')
  console.log(`target users: ${USERS}   completed full flow: ${completed}   ramp: ${RAMP_MS}ms`)
  console.log('----------------------------------------')
  const pass = [
    line('login', samples.login, errors.login, 2000),
    line('connect', samples.connect, errors.connect, 3000),
    line('join', samples.join, errors.join, 3000),
    line('answer', samples.answer, errors.answer, 1500),
    line('leaderboard', samples.leaderboard, errors.leaderboard, 1500)
  ]
  const successRate = completed / USERS
  const overall = pass.every(Boolean) && successRate >= 0.99
  console.log('----------------------------------------')
  console.log(`success rate: ${(successRate * 100).toFixed(1)}%   OVERALL: ${overall ? '✅ PASS' : '❌ FAIL'}`)
  console.log('========================================\n')
  return overall
}

async function main() {
  console.log(`Load test → ${API}  (socket path ${SOCKET_PATH})`)
  console.log(`Simulating ${USERS} students over a ${RAMP_MS}ms ramp...\n`)
  const t0 = now()
  await Promise.all(Array.from({ length: USERS }, async (_, i) => {
    await sleep((i / USERS) * RAMP_MS) // stagger the surge
    await student(i)
  }))
  console.log(`\nAll flows finished in ${((now() - t0) / 1000).toFixed(1)}s. ${sockets.length} sockets held open.`)
  const ok = report()
  for (const s of sockets) s.close()
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error('RUN FAILED:', e.message); process.exit(1) })
