// Full end-to-end smoke test for the topic leak fix
import http from 'node:http'
import mongoose from 'mongoose'

function req (method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const opts = {
      hostname: 'localhost', port: 3001, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(cookie ? (cookie.startsWith('Bearer ') ? { Authorization: cookie } : { Cookie: cookie }) : {})
      }
    }
    const r = http.request(opts, (res) => {
      let buf = ''
      res.on('data', c => { buf += c })
      res.on('end', () => {
        let json
        try { json = JSON.parse(buf) } catch { json = buf }
        resolve({ status: res.statusCode, headers: res.headers, body: json })
      })
    })
    r.on('error', reject)
    if (data) r.write(data)
    r.end()
  })
}

const teacher = await req('POST', '/api/auth/login', { email: 'rashmi@spandan.local', password: 'Test1234!' })
const tToken = teacher.body.token
const tId = teacher.body.user._id
console.log('Teacher logged in:', teacher.body.user.name, '|', tId)

const student = await req('POST', '/api/auth/login', { email: 'student@spandan.local', password: 'Test1234!' })
const sToken = student.body.token
const sId = student.body.user._id
console.log('Student logged in:', student.body.user.name, '|', sId)

const newRoom = await req('POST', '/api/rooms', { name: 'Smoke Test 1', code: 'SMOK' + Math.random().toString(36).slice(2, 5).toUpperCase() }, `Bearer ${tToken}`)
console.log('Room created:', newRoom.status, '|', newRoom.body.room._id)
const roomId = newRoom.body.room._id
const roomCode = newRoom.body.room.code

// Use code to join (student side)
const join = await req('GET', `/api/rooms/join/${roomCode}`, null, `Bearer ${sToken}`)
console.log('Student joined (by code):', join.status)

// Teach session start (uses /api/doubts/room/.../session/start)
const start = await req('POST', `/api/doubts/room/${roomId}/session/start`, {}, `Bearer ${tToken}`)
console.log('Session started:', start.status, '|', start.body?.roomStartedAt ?? start.body?.room?.roomStartedAt ?? '?')

// Now insert test data via Mongo
await mongoose.connect('mongodb://localhost:27017/spandan')
const { Transcript } = await import('../../src/models/index.js')
const { Room } = await import('../../src/models/index.js')
const roomDoc = await Room.findById(roomId).select('roomStartedAt').lean()
console.log('roomStartedAt:', roomDoc?.roomStartedAt ?? 'NULL!')

// Insert OLD transcript (1 hour before now) — would be leak source under old code
await Transcript.create({
  roomId: new mongoose.Types.ObjectId(roomId),
  segmentIndex: 0,
  text: 'Photosynthesis which Photosynthesis is the process of converting light energy',
  createdAt: new Date(Date.now() - 3600000),
  teacherId: new mongoose.Types.ObjectId(tId)
})
console.log('Inserted OLD transcript (Photosynthesis leak source)')

// Insert CURRENT session transcript
await Transcript.create({
  roomId: new mongoose.Types.ObjectId(roomId),
  segmentIndex: 1,
  text: 'Today we are studying the Krebs cycle and cellular respiration in detail.',
  createdAt: new Date(Date.now() + 500),
  teacherId: new mongoose.Types.ObjectId(tId)
})
console.log('Inserted CURRENT session transcript (Krebs cycle)')

await mongoose.disconnect()
await new Promise(r => setTimeout(r, 1500))

// Fire doubt signal as student
const doubt = await req('POST', '/api/doubts', {
  roomId,
  utteranceSnapshot: 'I am confused about the Krebs cycle step',
  recordingOffsetMs: 1000
}, `Bearer ${sToken}`)
console.log('\nDoubt signal:', doubt.status, '|', JSON.stringify(doubt.body).substring(0, 300))

await new Promise(r => setTimeout(r, 1500))

const active = await req('GET', `/api/confusion/room/${roomId}/active`, null, `Bearer ${tToken}`)
console.log('\n=== ACTIVE EVENT ===')
console.log('Status:', active.status)
if (active.body?.event) {
  // Active event shape: { topic: { label, subtopic, source, markerId }, ... }
  const topicLabel = active.body.event.topic?.label ?? active.body.event.topicLabel ?? ''
  const topicSource = active.body.event.topic?.source ?? active.body.event.topicSource ?? 'none'
  console.log('  topicLabel:', JSON.stringify(topicLabel))
  console.log('  topicSource:', JSON.stringify(topicSource))
  console.log('  confusedStudentCount:', active.body.event.confusedStudentCount)
  console.log('\n=== RESULT ===')
  const label = topicLabel
  if (label.toLowerCase().includes('photosynthesis')) {
    console.log('❌ FAIL: photosynthesis leaked into the new room')
    process.exit(1)
  } else {
    console.log('✅ PASS: no photosynthesis leak')
  }
  if (label.toLowerCase().includes('krebs')) {
    console.log('✅ PASS: current session topic was correctly recognized as Krebs cycle')
  } else if (label.toLowerCase().includes('cycle') || label.toLowerCase().includes('respiration')) {
    console.log('✅ PASS: current session topic recognized (Krebs-related word found)')
  } else {
    console.log('⚠️  Got label "' + label + '" but no Krebs-related word')
  }
} else {
  console.log('No event:', JSON.stringify(active.body).substring(0, 200))
}