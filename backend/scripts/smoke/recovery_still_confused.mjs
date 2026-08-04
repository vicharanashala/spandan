// Verify the "still_confused" path: event stays active + Needs More
// Explanation badge should display.

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
  const mongo = new MongoClient(MONGO_URL)
  await mongo.connect()
  const db = mongo.db('spandan')

  // Always create fresh event with 2 students
  const teacherToken = await login('rashmi@spandan.local')
  const rooms = await req('GET', '/api/rooms', { cookie: `Bearer ${teacherToken}` })
  const room = rooms.json.rooms[0]
  log('Using room:', room.code, room._id)
  await req('POST', `/api/doubts/room/${room._id}/session/start`, { cookie: `Bearer ${teacherToken}` })

  const s1Tok = await login('student@spandan.local')
  const s2Tok = await login('student2@spandan.local')
  await req('GET', `/api/rooms/join/${room.code}`, { cookie: `Bearer ${s1Tok}` })
  await req('GET', `/api/rooms/join/${room.code}`, { cookie: `Bearer ${s2Tok}` })
  await req('POST', '/api/doubts', { cookie: `Bearer ${s1Tok}`, body: { roomId: room._id, reason: 'lost' } })
  await req('POST', '/api/doubts', { cookie: `Bearer ${s2Tok}`, body: { roomId: room._id, reason: 'lost' } })

  const evt = await db.collection('confusionevents').findOne({ status: 'active', roomId: new ObjectId(room._id) })
  if (!evt) throw new Error('No active event')
  log('Created event:', String(evt._id), 'confusedStudentCount:', evt.confusedStudentCount)

  const eventId = String(evt._id)
  log('\n=== Teacher requests feedback ===')
  await req('POST', `/api/confusion/event/${eventId}/request-feedback`, { cookie: `Bearer ${teacherToken}` })

  log('\n=== Student1 clicks UNDERSTOOD ===')
  const f1 = await req('POST', `/api/confusion/event/${eventId}/feedback`, { cookie: `Bearer ${s1Tok}`, body: { answer: 'understood' } })
  log('Response:', f1.body)
  const j1 = f1.json
  log('Renders: 👥 ' + j1.expectedRespondents + ' ✅ ' + j1.understood + ' ❌ ' + j1.stillConfused +
      '   needsMoreExplanation=' + j1.needsMoreExplanation + '   autoClosed=' + j1.autoClosed)

  log('\n=== Student2 clicks STILL_CONFUSED ===')
  const f2 = await req('POST', `/api/confusion/event/${eventId}/feedback`, { cookie: `Bearer ${s2Tok}`, body: { answer: 'still_confused' } })
  log('Response:', f2.body)
  const j2 = f2.json
  log('Renders: 👥 ' + j2.expectedRespondents + ' ✅ ' + j2.understood + ' ❌ ' + j2.stillConfused +
      '   needsMoreExplanation=' + j2.needsMoreExplanation + '   autoClosed=' + j2.autoClosed)

  log('\n=== Event should still be ACTIVE (no auto-close because still_confused > 0) ===')
  const a = await req('GET', `/api/confusion/room/${room._id}/active`, { cookie: `Bearer ${teacherToken}` })
  const stillActive = a.json && a.json.event
  log('GET /active event:', stillActive ? ('STILL ACTIVE (id=' + stillActive.id + ') ✓') : 'null (BUG: should still be active)')

  log('\n=== EXPECTED vs ACTUAL ===')
  log('Spec: after student2 still_confused → event stays active, Needs More Explanation badge shows')
  log('Actual: needsMoreExplanation=' + j2.needsMoreExplanation + ' | active=' + !!stillActive)
  log('  → Frontend will display: 👥 2 ✅ 1 ❌ 1   📊 Recovery: 1 / 2 (50%)   ⚠ Needs More Explanation')

  writeFileSync('C:/Users/ajith/.openclaw/workspace/recovery_still_confused_out.txt', out.join('\n'))
  await mongo.close()
  log('\nDone.')
}

main().catch(async e => { console.error('FATAL', e); await mongo.close(); process.exit(1) })