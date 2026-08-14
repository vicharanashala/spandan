import http from 'http'
const baseUrl = 'http://localhost:3001'
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
const main = async () => {
  log('--- Login as teacher ---')
  const tlogin = await req('POST', '/api/auth/login', { body: { email: 'rashmi@spandan.local', password: 'Test1234!' } })
  log('Login status:', tlogin.status)
  if (tlogin.status !== 200) { log('Login body:', tlogin.body); return }
  const tToken = tlogin.json && tlogin.json.token
  const tCookie = `Bearer ${tToken}`
  log('Teacher token prefix:', tToken ? tToken.slice(0, 40) : 'NONE')
  log('Teacher user:', tlogin.json && tlogin.json.user)
  log('')
  log('--- Get rooms ---')
  const rooms = await req('GET', '/api/rooms', { cookie: tCookie })
  log('Rooms status:', rooms.status)
  if (rooms.json && rooms.json.rooms) {
    for (const r of rooms.json.rooms.slice(0, 3)) log(JSON.stringify({ _id: r._id, code: r.code, roomStartedAt: r.roomStartedAt }))
  }
  const room = rooms.json && rooms.json.rooms && rooms.json.rooms[0]
  if (!room) { log('No rooms for teacher. Aborting.'); return }
  log('Using room:', room.code, room._id)
  log('')
  log('--- Get active event ---')
  const active = await req('GET', '/api/confusion/room/' + room._id + '/active', { cookie: tCookie })
  log('Status:', active.status, 'Body[:500]:', (active.body || '').slice(0, 500))
  const activeEvent = active.json && active.json.event
  if (!activeEvent) { log('No active event. Cannot test recovery flow. Aborting.'); return }
  log('Active event id:', activeEvent.id, ' topicLabel:', activeEvent.topic && activeEvent.topic.label, ' status:', activeEvent.status)
  const eventId = activeEvent.id || activeEvent._id
  log('')
  log('--- Test 1: request feedback (simulates teacher dashboard button click) ---')
  log('POST /api/confusion/event/' + eventId + '/request-feedback')
  const fb1 = await req('POST', '/api/confusion/event/' + eventId + '/request-feedback', { cookie: tCookie })
  log('Status:', fb1.status, 'Body[:600]:', (fb1.body || '').slice(0, 600))
  log('')
  log('--- Test 2: login student ---')
  const slogin = await req('POST', '/api/auth/login', { body: { email: 'student@spandan.local', password: 'Test1234!' } })
  log('Status:', slogin.status)
  const sCookie = `Bearer ${(slogin.json && slogin.json.token) || slogin.body.token}`
  log('Student user:', slogin.json && slogin.json.user)
  log('')
  log('--- Test 3: student submits UNDERSTOOD ---')
  const fb2 = await req('POST', '/api/confusion/event/' + eventId + '/feedback', { cookie: sCookie, body: { answer: 'understood' } })
  log('Status:', fb2.status, 'Body[:600]:', (fb2.body || '').slice(0, 600))
  log('')
  log('--- Test 4: login student2 ---')
  const s2login = await req('POST', '/api/auth/login', { body: { email: 'student2@spandan.local', password: 'Test1234!' } })
  log('s2 status:', s2login.status)
  const s2Cookie = `Bearer ${(s2login.json && s2login.json.token) || s2login.body.token}`
  log('Student2 user:', s2login.json && s2login.json.user)
  log('--- Test 4b: student2 submits STILL_CONFUSED ---')
  const fb3 = await req('POST', '/api/confusion/event/' + eventId + '/feedback', { cookie: s2Cookie, body: { answer: 'still_confused' } })
  log('Status:', fb3.status, 'Body[:600]:', (fb3.body || '').slice(0, 600))
  log('')
  log('--- Test 5: re-fetch active event ---')
  const active2 = await req('GET', '/api/confusion/room/' + room._id + '/active', { cookie: tCookie })
  log('Status:', active2.status, 'Body[:800]:', (active2.body || '').slice(0, 800))
  log('')
  log('--- Test 6: malformed eventId (what frontend would send if card._id is undefined) ---')
  const broken = await req('POST', '/api/confusion/event/undefined/request-feedback', { cookie: tCookie })
  log('Status:', broken.status, 'Body[:400]:', (broken.body || '').slice(0, 400))
  await import('fs').then(fs => fs.writeFileSync('C:/Users/ajith/.openclaw/workspace/smoke_out.txt', out.join('\n')))
  log('Done.')
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })