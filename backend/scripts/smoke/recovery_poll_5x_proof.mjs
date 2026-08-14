// REPEATED RECOVERY POLL VERIFICATION
// Tests: Confusion -> Recovery Poll -> End, REPEATED 5 times.
// Verifies that each iteration of the recovery poll works correctly
// without requiring a page refresh.
//
// Flow per iteration:
//   1. Teacher starts poll N
//   2. s1 presses Confused
//   3. s2 presses Confused
//   4. Teacher requests feedback on the new event
//   5. s1 answers 'understood'
//   6. s2 answers 'understood' (triggers auto-close)
//   7. Verify: event is closed, tally is cleared, dashboard fresh
//
// Bug claim: "The second recovery poll does not work correctly. Students
// cannot participate properly in the second Are you clear now? poll."

import http from 'http'
import { io as ioClient } from 'socket.io-client'

const baseUrl = 'http://localhost:3001'
const wsUrl = 'http://localhost:3001'

function req (method, path, opts) {
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

let pass = 0, fail = 0
const failures = []
function assert (cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; failures.push(label); console.log('  ✗ ' + label) }
}
function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

async function login (email) {
  const r = await req('POST', '/api/auth/login', { body: { email, password: 'Test1234!' } })
  if (r.status !== 200) throw new Error('Login failed for ' + email)
  return { token: r.json.token, user: r.json.user, cookie: r.json.token }
}

async function createRoom (cookie) {
  const r = await req('POST', '/api/rooms', {
    cookie, body: { name: 'RECOVERY-5X-' + Date.now(), description: '5x recovery poll', settings: { timeToAnswer: 30, points: 100 } }
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
  console.log('REPEATED RECOVERY POLL TEST (5 cycles)')
  console.log('============================================================')

  const teacher = await login('rashmi@spandan.local')
  const s1 = await login('student@spandan.local')
  const s2 = await login('student2@spandan.local')
  const room = await createRoom(teacher.cookie)
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

  // Track feedback outcomes from student's perspective
  const s1SeenFeedback = []
  const s2SeenFeedback = []
  s1Sock.on('confusion:feedback', d => s1SeenFeedback.push(d))
  s2Sock.on('confusion:feedback', d => s2SeenFeedback.push(d))

  // Track resolved-prompt emits seen by students
  const s1SeenResolved = []
  const s2SeenResolved = []
  s1Sock.on('confusion:resolved', d => s1SeenResolved.push(d))
  s2Sock.on('confusion:resolved', d => s2SeenResolved.push(d))

  for (let cycle = 1; cycle <= 5; cycle++) {
    console.log('============================================================')
    console.log(`CYCLE #${cycle}`)
    console.log('============================================================')

    // 1. Teacher starts a new poll
    const pollQ = {
      _id: 'cycle' + cycle + '-' + Date.now(),
      type: 'MCQ',
      question: `Cycle ${cycle} poll`,
      options: ['Yes', 'No'],
      segmentIndex: cycle,
      timeToAnswer: 60,
      points: 100
    }
    teacherSock.emit('new_question', { roomCode: room.code, question: pollQ })
    await sleep(400)
    assert((await activeEvent(room._id, teacher.cookie)) === null, `Cycle #${cycle}: active=null after poll start`)

    // 2. s1 presses Confused
    s1Sock.emit('doubt:signal', { roomId: room._id, roomCode: room.code, segmentIndex: cycle, transcriptOffsetMs: 0, recordingOffsetMs: 1000, utteranceSnapshot: 'Photosynthesis', clientSentAt: new Date().toISOString() })
    await sleep(400)
    // 3. s2 presses Confused
    s2Sock.emit('doubt:signal', { roomId: room._id, roomCode: room.code, segmentIndex: cycle, transcriptOffsetMs: 0, recordingOffsetMs: 2000, utteranceSnapshot: 'Photosynthesis', clientSentAt: new Date().toISOString() })
    await sleep(500)
    const evt = await activeEvent(room._id, teacher.cookie)
    assert(evt !== null, `Cycle #${cycle}: ConfusionEvent exists (count=${evt?.confusedStudentCount})`)
    assert(evt && evt.confusedStudentCount === 2, `Cycle #${cycle}: 2 students confused (got ${evt?.confusedStudentCount})`)
    const eventId = evt?.id

    // 4. Teacher requests feedback (recovery poll)
    const seenResolvedBeforeS1 = s1SeenResolved.length
    const seenResolvedBeforeS2 = s2SeenResolved.length
    const reqFb = await req('POST', `/api/confusion/event/${eventId}/request-feedback`, { cookie: teacher.cookie })
    assert(reqFb.status === 200, `Cycle #${cycle}: request-feedback 200 (got ${reqFb.status})`)
    await sleep(400)

    // Both students should have received confusion:resolved
    assert(s1SeenResolved.length > seenResolvedBeforeS1, `Cycle #${cycle}: s1 received confusion:resolved (delta ${s1SeenResolved.length - seenResolvedBeforeS1})`)
    assert(s2SeenResolved.length > seenResolvedBeforeS2, `Cycle #${cycle}: s2 received confusion:resolved (delta ${s2SeenResolved.length - seenResolvedBeforeS2})`)

    // 5. s1 answers 'understood'
    const s1Fb = await req('POST', `/api/confusion/event/${eventId}/feedback`, { cookie: s1.cookie, body: { answer: 'understood' } })
    assert(s1Fb.status === 200, `Cycle #${cycle}: s1 feedback understood 200 (got ${s1Fb.status})`)
    assert(s1Fb.json?.understood === 1, `Cycle #${cycle}: s1 understood=1 (got ${s1Fb.json?.understood})`)
    assert(s1Fb.json?.expectedRespondents === 2, `Cycle #${cycle}: expectedRespondents=2 (got ${s1Fb.json?.expectedRespondents})`)
    assert(s1Fb.json?.autoClosed === false, `Cycle #${cycle}: not auto-closed after 1 of 2 (got autoClosed=${s1Fb.json?.autoClosed})`)
    await sleep(300)

    // 6. s2 answers 'understood' -> should auto-close
    const s2Fb = await req('POST', `/api/confusion/event/${eventId}/feedback`, { cookie: s2.cookie, body: { answer: 'understood' } })
    assert(s2Fb.status === 200, `Cycle #${cycle}: s2 feedback understood 200 (got ${s2Fb.status})`)
    assert(s2Fb.json?.understood === 2, `Cycle #${cycle}: understood=2 after s2 (got ${s2Fb.json?.understood})`)
    assert(s2Fb.json?.autoClosed === true, `Cycle #${cycle}: autoClosed=true after both (got ${s2Fb.json?.autoClosed})`)
    await sleep(400)

    // 7. Verify event is now closed (no longer active)
    const afterClose = await activeEvent(room._id, teacher.cookie)
    assert(afterClose === null, `Cycle #${cycle}: event auto-closed (active=${afterClose?.id})`)
    console.log('')
  }

  console.log('============================================================')
  console.log(`RESULTS: passed=${pass} failed=${fail}`)
  if (fail > 0) {
    console.log('Failures:')
    for (const f of failures) console.log('  - ' + f)
  }

  teacherSock.close()
  s1Sock.close()
  s2Sock.close()
  await sleep(200)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(1) })