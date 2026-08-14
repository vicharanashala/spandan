// Quick API smoke test - via raw node http to actually capture set-cookie
import http from 'node:http'

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

const login = await req('POST', '/api/auth/login', { email: 'rashmi@spandan.local', password: 'Test1234!' })
console.log('LOGIN:', login.status, '| body keys:', Object.keys(login.body || {}))
const token = login.body?.token
console.log('TOKEN:', token ? token.substring(0, 40) + '...' : 'MISSING')
const cookie = `Bearer ${token}`

const me = await req('GET', '/api/auth/me', null, cookie)
console.log('ME:', me.status, '| role:', me.body?.user?.role, '| name:', me.body?.user?.name)

const rooms = await req('GET', '/api/rooms', null, cookie)
const roomList = Array.isArray(rooms.body) ? rooms.body : (rooms.body?.rooms ?? [])
console.log('ROOMS count:', roomList.length)
const room = roomList[0]
if (room) {
  console.log('ROOM:', room.code, '| roomStartedAt:', room.roomStartedAt)
  const active = await req('GET', `/api/confusion/room/${room._id}/active`, null, cookie)
  console.log('ACTIVE event:', active.body?.event ? `count=${active.body.event.confusedStudentCount} topic="${active.body.event.topicLabel || active.body.event.topic?.label}"` : 'no event')

  // Verify the topics endpoint works with new session-scoped logic
  const topicHeat = await req('GET', `/api/confusion/room/${room._id}/topic-heat`, null, cookie)
  console.log('TOPIC HEAT status:', topicHeat.status, '| items:', Array.isArray(topicHeat.body) ? topicHeat.body.length : (topicHeat.body?.topics?.length ?? 'N/A'))
}
