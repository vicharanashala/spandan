// POLL-LIFECYCLE FIX VERIFICATION
// Tests that the poll-lifecycle fix correctly resets state between polls.
// Pre-fix this script would show:
//   - Poll #2 reusing Poll #1's event id
//   - feedbackTallies persisting
//   - student clicks on Poll #2 returning {ok: false, reason: 'anti_spam'}
//
// Post-fix expectations:
//   - Poll #2 closes any active event for the room (active event = null)
//   - feedbackTallies Map cleared for that room's events
//   - student clicks on Poll #2 succeed (no anti_spam)
//   - confusion:update shows fresh count starting from 0
//   - This holds for 5 consecutive polls

import http from 'http'
import { io as ioClient } from 'socket.io-client'

const baseUrl = 'http://localhost:3001'
const wsUrl = 'http://localhost:3001'

function req(method, path, opts) {
  opts = opts || {}
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path)
    const headers = { 'Content-Type': 'application/json' }
    if (opts.cookie) headers['Authorization'] = opts.cookie.startsWith('Bearer ') ? opts.cookie : `Bearer ${opts.cookie}`
    const r = http.request({
      hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers
    }, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        const out = { status: res.statusCode, headers: res.headers, body: data }
        try { out.json = JSON.parse(data) } catch (e) {}
        resolve(out)
      })
    })
    r.on('error', reject)
    if (opts.body) r.write(JSON.stringify(opts.body))
    r.end()
  })
}

let pass = 0
let fail = 0
const failures = []
function assert (cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; failures.push(label); console.log('  ✗ ' + label) }
}
function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

async function login (email) {
  const r = await req('POST', '/api/auth/login', { body: { email, password: 'Test1234!' } })
  if (r.status !== 200) throw new Error('Login failed for ' + email + ': ' + r.body)
  return { token: r.json.token, user: r.json.user, cookie: 'Bearer ' + r.json.token }
}

async function createRoom (teacherCookie, name) {
  const r = await req('POST', '/api/rooms', {
    cookie: teacherCookie,
    body: { name: name || ('FIX-ROOM-' + Date.now()), description: 'poll fix verification', settings: { timeToAnswer: 30, points: 100 } }
  })
  if (r.status !== 201) throw new Error('Create room failed: ' + r.body)
  return r.json.room
}

async function activeEvent (roomId, cookie) {
  const r = await req('GET', `/api/confusion/room/${roomId}/active`, { cookie })
  return r.json?.event || null
}

const main = async () => {
  console.log('============================================================')
  console.log('POLL LIFECYCLE FIX VERIFICATION (5 consecutive polls)')
  console.log('============================================================')
  console.log('')

  const teacher = await login('rashmi@spandan.local')
  const s1 = await login('student@spandan.local')
  const s2 = await login('student2@spandan.local')
  const room = await createRoom(teacher.cookie, 'FIX-VERIFY-' + Date.now())
  console.log('Room:', room.code, room._id)
  console.log('')

  const teacherSock = ioClient(wsUrl, { transports: ['websocket'] })
  const s1Sock = ioClient(wsUrl, { transports: ['websocket'] })
  const s2Sock = ioClient(wsUrl, { transports: ['websocket'] })
  await new Promise(r => teacherSock.on('connect', () => { teacherSock.emit('authenticate', { token: teacher.token }); r() }))
  await new Promise(r => s1Sock.on('connect', () => { s1Sock.emit('authenticate', { token: s1.token }); r() }))
  await new Promise(r => s2Sock.on('connect', () => { s2Sock.emit('authenticate', { token: s2.token }); r() }))
  await sleep(400)
  teacherSock.emit('room:join', { roomCode: room.code, userId: teacher.user._id })
  s1Sock.emit('room:join', { roomCode: room.code, userId: s1.user._id })
  s2Sock.emit('room:join', { roomCode: room.code, userId: s2.user._id })
  await sleep(400)

  // Track events per poll
  const tracked = { s1Ignored: [], s1Confirmed: [], teacherReset: [], s2Confirmed: [] }
  s1Sock.on('doubt:ignored', d => tracked.s1Ignored.push(d))
  s1Sock.on('doubt:confirmed', d => tracked.s1Confirmed.push(d))
  s2Sock.on('doubt:confirmed', d => tracked.s2Confirmed.push(d))
  teacherSock.on('poll:reset', d => tracked.teacherReset.push(d))

  let priorActiveEventId = null

  for (let pollN = 1; pollN <= 5; pollN++) {
    console.log('============================================================')
    console.log('POLL #' + pollN)
    console.log('============================================================')

    // Step 1: teacher starts a new poll
    const pollQ = {
      _id: 'poll' + pollN + '-' + Date.now(),
      type: 'MCQ',
      question: 'Are you understanding Poll #' + pollN + '?',
      options: ['Yes', 'No'],
      timeToAnswer: 60,
      points: 100,
      segmentIndex: pollN
    }
    teacherSock.emit('new_question', { roomCode: room.code, question: pollQ })
    await sleep(400)

    // (BUG 2 assertion) After Poll #N starts, active event must be NULL
    // (Poll #N-1's event should have been closed by resetPollStateForRoom)
    const activeAfterStart = await activeEvent(room._id, teacher.cookie)
    assert(activeAfterStart === null, `Poll #${pollN} start: active ConfusionEvent is null (was: ${activeAfterStart ? activeAfterStart.id : 'null'})`)
    // (BUG 2 assertion) poll:reset must have been emitted
    const resetCount = tracked.teacherReset.filter(r => String(r.roomId) === String(room._id)).length
    assert(resetCount >= pollN, `poll:reset emitted >= ${pollN} times (got ${resetCount})`)

    // Step 2: s1 presses Confused
    tracked.s1Ignored = []
    tracked.s1Confirmed = []
    s1Sock.emit('doubt:signal', {
      roomId: room._id,
      roomCode: room.code,
      segmentIndex: pollN,
      transcriptOffsetMs: 0,
      recordingOffsetMs: 1000,
      utteranceSnapshot: 'I am confused about Photosynthesis',
      clientSentAt: new Date().toISOString()
    })
    await sleep(500)

    // (BUG 1 assertion) s1 must NOT be rejected with anti_spam on Poll #N
    const s1IgnoredOnPoll = tracked.s1Ignored.filter(d => d.reason === 'anti_spam').length
    assert(s1IgnoredOnPoll === 0, `Poll #${pollN}: s1 NOT rejected with anti_spam (got ${s1IgnoredOnPoll})`)
    assert(tracked.s1Confirmed.length >= 1, `Poll #${pollN}: s1 got doubt:confirmed (got ${tracked.s1Confirmed.length})`)

    // (BUG 2 assertion) After s1 click, active event should have count=1
    const afterS1 = await activeEvent(room._id, teacher.cookie)
    assert(afterS1 !== null, `Poll #${pollN}: active event exists after s1 click`)
    assert(afterS1 && afterS1.confusedStudentCount === 1, `Poll #${pollN}: confusedStudentCount=1 (got ${afterS1?.confusedStudentCount})`)
    assert(afterS1 && String(afterS1.id) !== String(priorActiveEventId || ''), `Poll #${pollN}: NEW active event id (prior=${priorActiveEventId}, current=${afterS1?.id})`)
    priorActiveEventId = afterS1?.id || null

    // Step 3: s2 presses Confused with same topic (counts → 2)
    s2Sock.emit('doubt:signal', {
      roomId: room._id,
      roomCode: room.code,
      segmentIndex: pollN,
      transcriptOffsetMs: 0,
      recordingOffsetMs: 2000,
      utteranceSnapshot: 'photosynthesis too',
      clientSentAt: new Date().toISOString()
    })
    await sleep(500)
    const afterS2 = await activeEvent(room._id, teacher.cookie)
    assert(afterS2 && afterS2.confusedStudentCount === 2, `Poll #${pollN}: confusedStudentCount=2 after s2 click (got ${afterS2?.confusedStudentCount})`)

    console.log('')
  }

  console.log('============================================================')
  console.log('RESULTS')
  console.log('============================================================')
  console.log('  Passed: ' + pass)
  console.log('  Failed: ' + fail)
  if (fail > 0) {
    console.log('  Failed assertions:')
    for (const f of failures) console.log('    - ' + f)
  }
  console.log('')
  console.log('Tracked counters:')
  console.log('  s1 doubts confirmed (total): ' + tracked.s1Confirmed.length)
  console.log('  s2 doubts confirmed (total): ' + tracked.s2Confirmed.length)
  console.log('  s1 doubts ignored (total):   ' + tracked.s1Ignored.length)
  console.log('  poll:reset events (teacher): ' + tracked.teacherReset.length)

  teacherSock.close()
  s1Sock.close()
  s2Sock.close()
  await sleep(200)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(1) })
