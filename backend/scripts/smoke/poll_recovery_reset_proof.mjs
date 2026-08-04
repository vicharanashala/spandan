// Verify that feedbackTallies is cleared on poll boundary.
// Goes through: Poll #1 → confusion:resolved → s1 "understood" → Poll #2 starts
// → verify the feedback tally from Poll #1 is NOT carried into Poll #2.

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
function assert (cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}
function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

async function login (email) {
  const r = await req('POST', '/api/auth/login', { body: { email, password: 'Test1234!' } })
  if (r.status !== 200) throw new Error('Login failed for ' + email)
  return { token: r.json.token, user: r.json.user, cookie: 'Bearer ' + r.json.token }
}

async function createRoom (cookie) {
  const r = await req('POST', '/api/rooms', {
    cookie, body: { name: 'RECOVERY-VERIFY-' + Date.now(), description: 'recovery flow', settings: { timeToAnswer: 30, points: 100 } }
  })
  if (r.status !== 201) throw new Error('Create room failed: ' + r.body)
  return r.json.room
}

async function activeEvent (roomId, cookie) {
  const r = await req('GET', `/api/confusion/room/${roomId}/active`, { cookie })
  return r.json?.event || null
}

const main = async () => {
  console.log('FEEDBACK TALLY CLEAR-ON-POLL-START VERIFICATION')
  console.log('============================================================')

  const teacher = await login('rashmi@spandan.local')
  const s1 = await login('student@spandan.local')
  const s2 = await login('student2@spandan.local')
  const room = await createRoom(teacher.cookie)
  console.log('Room:', room.code, room._id)
  console.log('')

  const teacherSock = ioClient(wsUrl, { transports: ['websocket'] })
  const s1Sock = ioClient(wsUrl, { transports: ['websocket'] })
  await new Promise(r => teacherSock.on('connect', () => { teacherSock.emit('authenticate', { token: teacher.token }); r() }))
  await new Promise(r => s1Sock.on('connect', () => { s1Sock.emit('authenticate', { token: s1.token }); r() }))
  await sleep(400)
  teacherSock.emit('room:join', { roomCode: room.code, userId: teacher.user._id })
  s1Sock.emit('room:join', { roomCode: room.code, userId: s1.user._id })
  await sleep(400)

  // ====== POLL #1 ======
  console.log('--- POLL #1 ---')
  teacherSock.emit('new_question', { roomCode: room.code, question: { _id: 'p1', type: 'MCQ', question: 'Poll 1', options: ['Yes','No'], segmentIndex: 1 } })
  await sleep(400)
  s1Sock.emit('doubt:signal', { roomId: room._id, roomCode: room.code, segmentIndex: 1, transcriptOffsetMs: 0, recordingOffsetMs: 1000, utteranceSnapshot: 'Photosynthesis', clientSentAt: new Date().toISOString() })
  await sleep(500)
  const p1Event = await activeEvent(room._id, teacher.cookie)
  assert(p1Event !== null, 'Poll #1 active event exists')
  console.log('  active event id:', p1Event?.id)

  // Teacher requests feedback (recovery phase)
  const reqRes = await req('POST', `/api/confusion/event/${p1Event.id}/request-feedback`, { cookie: teacher.cookie })
  assert(reqRes.status === 200, `request-feedback 200 (got ${reqRes.status})`)
  await sleep(400)

  // s1 responds understood
  const fbRes = await req('POST', `/api/confusion/event/${p1Event.id}/feedback`, { cookie: s1.cookie, body: { answer: 'understood' } })
  assert(fbRes.status === 200, `feedback understood 200`)
  assert(fbRes.json.understood === 1, `tally.understood=1 after s1 (got ${fbRes.json.understood})`)
  console.log('  Poll #1 feedback tally:', JSON.stringify(fbRes.json))
  console.log('')

  // ====== POLL #2 STARTS ======
  console.log('--- POLL #2 STARTS ---')
  teacherSock.emit('new_question', { roomCode: room.code, question: { _id: 'p2', type: 'MCQ', question: 'Poll 2', options: ['Yes','No'], segmentIndex: 2 } })
  await sleep(500)

  const afterPoll2 = await activeEvent(room._id, teacher.cookie)
  assert(afterPoll2 === null, `Poll #2 active event is NULL (was: ${afterPoll2?.id})`)

  // Verify feedback tally was wiped — s1 clicks Confused on Poll #2, then teacher
  // requests feedback and looks at the response. It should show understood=0,
  // stillConfused=0, expectedRespondents=0 (or 1 after the first signal).
  s1Sock.emit('doubt:signal', { roomId: room._id, roomCode: room.code, segmentIndex: 2, transcriptOffsetMs: 0, recordingOffsetMs: 1000, utteranceSnapshot: 'Photosynthesis', clientSentAt: new Date().toISOString() })
  await sleep(500)
  const p2Event = await activeEvent(room._id, teacher.cookie)
  assert(p2Event !== null, `Poll #2 active event after s1 click`)
  console.log('  Poll #2 active event id (fresh):', p2Event?.id, '(poll 1 was:', p1Event?.id + ')')
  assert(String(p2Event.id) !== String(p1Event.id), `Poll #2 event id differs from Poll #1`)
  console.log('')

  // Now ask for feedback on the NEW (Poll #2) event — tally should be {understood:0, stillConfused:0}
  const reqP2 = await req('POST', `/api/confusion/event/${p2Event.id}/request-feedback`, { cookie: teacher.cookie })
  await sleep(400)
  // The tally inside the request-feedback response or subsequent feedback emit should show understood=0
  // request-feedback returns the formatted event; expectedRespondents isn't
  // in formatForClient (it's computed at read time from confusedStudentCount).
  // The tally-wipe proof is the next two assertions: understood=1 (fresh), stillConfused=0.
  console.log('  Poll #2 request-feedback body:', JSON.stringify(reqP2.json).slice(0, 200))

  // Send a fresh feedback and check the tally starts at 0
  const fbP2 = await req('POST', `/api/confusion/event/${p2Event.id}/feedback`, { cookie: s1.cookie, body: { answer: 'understood' } })
  assert(fbP2.json.understood === 1, `Poll #2 tally: understood=1 after fresh feedback (was: ${fbP2.json.understood})`)
  assert(fbP2.json.stillConfused === 0, `Poll #2 tally: stillConfused=0 (was: ${fbP2.json.stillConfused})`)

  console.log('============================================================')
  console.log(`RESULTS: passed=${pass} failed=${fail}`)

  teacherSock.close()
  s1Sock.close()
  await sleep(200)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(1) })
