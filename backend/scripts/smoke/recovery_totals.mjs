// Smoke test for the new Recovery-section UI expectations:
// - emits confusion:feedback with { understood, stillConfused, expectedRespondents, ... }
// - expectedRespondents = confusedStudentCount at the time the event was opened
//   (the "total confused" that the Recovery section displays)
// - 2nd UNDERSTOOD → expectedRespondents 2 → auto-closes the event
//
// What the frontend renders (matches user spec):
//   Step A (1 student clicks Understood):
//     👥 Confused: 2
//     ✅ Understood: 1
//     ❌ Still Confused: 0
//     📊 Recovery: 1 / 2 (50%)
//
//   Step B (2nd student clicks Understood):
//     👥 Confused: 2
//     ✅ Understood: 2
//     ❌ Still Confused: 0
//     📊 Recovery: 2 / 2 (100%)
//     Event auto-closes (confusion:closed emitted, GET /active returns null)

import http from 'http'
import { MongoClient, ObjectId } from 'mongodb'
import { writeFileSync } from 'fs'

const baseUrl = 'http://localhost:3001'
const MONGO_URL = 'mongodb://localhost:27017/spandan'

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

const out = []
function log() {
  const s = Array.from(arguments).map(x => typeof x === 'string' ? x : JSON.stringify(x, null, 2)).join(' ')
  out.push(s)
  process.stdout.write(s + '\n')
}

async function login(email) {
  const r = await req('POST', '/api/auth/login', { body: { email, password: 'Test1234!' } })
  if (r.status !== 200) throw new Error('login failed: ' + r.body)
  return r.json.token
}

async function main() {
  // Connect to Mongo so we can grab a fresh eventId from any active confusion event
  // We need an event with confusedStudentCount = 2 so the user-spec numbers apply.
  const mongo = new MongoClient(MONGO_URL)
  await mongo.connect()
  const db = mongo.db('spandan')

  // Find any room with an active ConfusionEvent; if none, create by simulating
  // 2 students pressing 'I'm Lost'.
  // Always create a fresh event with 2 students (forceFresh=true). This
  // gives us a clean confusedStudentCount=2 to match the user spec.
  let evt = null
  let roomId
  {
    log('No active event found. Creating a fresh one via /api/doubts.')
    // Get or create a room
    const teacherToken = await login('rashmi@spandan.local')
    const rooms = await req('GET', '/api/rooms', { cookie: `Bearer ${teacherToken}` })
    let room
    if (rooms.json && Array.isArray(rooms.json.rooms) && rooms.json.rooms.length > 0) {
      room = rooms.json.rooms[0]
    } else if (rooms.json && rooms.json.rooms) {
      room = rooms.json.rooms[0]
    }
    if (!room) throw new Error('No room available')
    roomId = room._id
    log('Using room:', room.code, roomId)

    // Start a session so roomStartedAt is set
    await req('POST', `/api/doubts/room/${roomId}/session/start`, { cookie: `Bearer ${teacherToken}` })

    // Join as 2 students + post doubts
    const s1Tok = await login('student@spandan.local')
    const s2Tok = await login('student2@spandan.local')
    const j1 = await req('GET', `/api/rooms/join/${room.code}`, { cookie: `Bearer ${s1Tok}` })
    const j2 = await req('GET', `/api/rooms/join/${room.code}`, { cookie: `Bearer ${s2Tok}` })
    log('Student1 join:', j1.status, 'Student2 join:', j2.status)

    // Post 'I'm Lost' signals -- the first creates the event, the second increments count.
    const d1 = await req('POST', '/api/doubts', { cookie: `Bearer ${s1Tok}`, body: { roomId, reason: 'lost' } })
    log('Student1 doubt POST:', d1.status, (d1.body || '').slice(0, 300))
    const d2 = await req('POST', '/api/doubts', { cookie: `Bearer ${s2Tok}`, body: { roomId, reason: 'lost' } })
    log('Student2 doubt POST:', d2.status, (d2.body || '').slice(0, 300))

    evt = await db.collection('confusionevents').findOne({ status: 'active', roomId: new ObjectId(roomId) })
    if (!evt) throw new Error('Could not create active event')
    log('Created active event:', String(evt._id), 'confusedStudentCount:', evt.confusedStudentCount)
  }

  if (evt.confusedStudentCount < 2) {
    log(`NOTE: existing event has confusedStudentCount=${evt.confusedStudentCount}; user-spec requires 2. ` +
        'This still validates the structure -- numbers will scale.')
  }

  const eventId = String(evt._id)
  const teacherToken = await login('rashmi@spandan.local')
  const s1Tok = await login('student@spandan.local')
  const s2Tok = await login('student2@spandan.local')

  log('\n=== STEP 1: teacher requests feedback ===')
  const rf = await req('POST', `/api/confusion/event/${eventId}/request-feedback`, { cookie: `Bearer ${teacherToken}` })
  log('Status:', rf.status, 'Body:', (rf.body || '').slice(0, 300))

  log('\n=== STEP 2: student1 clicks UNDERSTOOD ===')
  // Backend emit includes { understood, stillConfused, expectedRespondents, ... }
  // The frontend derives: Confused = expectedRespondents, Understood = understood,
  // Still Confused = stillConfused, Recovery = understood / expectedRespondents
  const f1 = await req('POST', `/api/confusion/event/${eventId}/feedback`, { cookie: `Bearer ${s1Tok}`, body: { answer: 'understood' } })
  log('HTTP Status:', f1.status)
  log('HTTP Response (this is what /feedback returns to student):', f1.body)
  const expectedRespondentsA = f1.json && f1.json.expectedRespondents
  const understoodA = f1.json && f1.json.understood
  const stillConfusedA = f1.json && f1.json.stillConfused
  const autoClosedA = f1.json && f1.json.autoClosed
  log('')
  log('FRONTEND RENDERS THIS FROM EMIT:')
  log('  👥 Confused: ' + expectedRespondentsA)
  log('  ✅ Understood: ' + understoodA)
  log('  ❌ Still Confused: ' + stillConfusedA)
  log('  📊 Recovery: ' + understoodA + ' / ' + expectedRespondentsA + ' (' +
      Math.round((understoodA / Math.max(expectedRespondentsA, 1)) * 100) + '%)')
  log('  autoClosed: ' + autoClosedA)

  log('\n=== STEP 3: student2 clicks UNDERSTOOD ===')
  const f2 = await req('POST', `/api/confusion/event/${eventId}/feedback`, { cookie: `Bearer ${s2Tok}`, body: { answer: 'understood' } })
  log('HTTP Status:', f2.status)
  log('HTTP Response:', f2.body)
  const expectedRespondentsB = f2.json && f2.json.expectedRespondents
  const understoodB = f2.json && f2.json.understood
  const stillConfusedB = f2.json && f2.json.stillConfused
  const autoClosedB = f2.json && f2.json.autoClosed
  log('')
  log('FRONTEND RENDERS THIS FROM EMIT:')
  log('  👥 Confused: ' + expectedRespondentsB)
  log('  ✅ Understood: ' + understoodB)
  log('  ❌ Still Confused: ' + stillConfusedB)
  log('  📊 Recovery: ' + understoodB + ' / ' + expectedRespondentsB + ' (' +
      Math.round((understoodB / Math.max(expectedRespondentsB, 1)) * 100) + '%)')
  log('  autoClosed: ' + autoClosedB)

  log('\n=== STEP 4: GET /active after step 3 (event should be auto-closed) ===')
  const a = await req('GET', `/api/confusion/room/${roomId}/active`, { cookie: `Bearer ${teacherToken}` })
  log('Status:', a.status, 'Body[:400]:', (a.body || '').slice(0, 400))
  log('  event after auto-close:', a.json && a.json.event ? 'STILL ACTIVE (bug)' : 'null (auto-closed ✓)')

  log('\n=== EXPECTED vs ACTUAL ===')
  log('Spec requires:')
  log('  Step A: 👥2 ✅1 ❌0 📊1/2 (50%)   | autoClosed: false')
  log('  Actual: 👥' + expectedRespondentsA + ' ✅' + understoodA + ' ❌' + stillConfusedA + ' 📊' + understoodA + '/' + expectedRespondentsA +
      ' (' + Math.round((understoodA / Math.max(expectedRespondentsA, 1)) * 100) + '%)' + ' | autoClosed: ' + autoClosedA)
  log('  Step B: 👥2 ✅2 ❌0 📊2/2 (100%)  | autoClosed: true')
  log('  Actual: 👥' + expectedRespondentsB + ' ✅' + understoodB + ' ❌' + stillConfusedB + ' 📊' + understoodB + '/' + expectedRespondentsB +
      ' (' + Math.round((understoodB / Math.max(expectedRespondentsB, 1)) * 100) + '%)' + ' | autoClosed: ' + autoClosedB)

  writeFileSync('C:/Users/ajith/.openclaw/workspace/recovery_totals_out.txt', out.join('\n'))
  await mongo.close()
  log('\nDone.')
}

main().catch(async e => { console.error('FATAL', e); await mongo.close(); process.exit(1) })