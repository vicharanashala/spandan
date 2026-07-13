// Seed the environment for a load test: one teacher, one room, one approved question, and USERS
// throwaway student accounts. Writes .seed.json for run.mjs to consume. Safe to re-run — existing
// accounts are reused.
//
//   BASE_URL=https://staging.spandan.fun API_PREFIX=/spandan USERS=1000 node seed.mjs
//
// NOTE: run this against a STAGING environment, never production. It creates many accounts + a room.

import { writeFile } from 'node:fs/promises'
import { API, USERS, SEED_CONCURRENCY, TEACHER, STUDENT_PASSWORD, studentEmail, SEED_FILE } from './config.mjs'

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, data, text }
}

// Register, or log in if the account already exists. Returns a JWT.
async function ensureUser({ name, email, password, role }) {
  const reg = await api('/auth/register', { method: 'POST', body: { name, email, password, role } })
  if (reg.ok) return reg.data.token
  // Already registered → log in.
  const login = await api('/auth/login', { method: 'POST', body: { email, password } })
  if (login.ok) return login.data.token
  throw new Error(`Could not create/login ${email}: ${reg.status}/${login.status} ${login.text || reg.text}`)
}

// Run `fn(i)` for i in [0,n) with at most `limit` in flight.
async function pool(n, limit, fn) {
  let next = 0, done = 0, failed = 0
  await Promise.all(Array.from({ length: Math.min(limit, n) }, async () => {
    while (next < n) {
      const i = next++
      try { await fn(i) } catch { failed++ }
      if (++done % 100 === 0) process.stdout.write(`  ...${done}/${n}\r`)
    }
  }))
  return { done, failed }
}

async function main() {
  console.log(`Seeding against ${API}`)

  // 1. Teacher
  const teacherToken = await ensureUser({ ...TEACHER, role: 'teacher' })
  console.log('✓ teacher ready')

  // 2. Room
  const room = await api('/rooms', { method: 'POST', token: teacherToken, body: { name: 'LoadTest Room' } })
  if (!room.ok) throw new Error(`Room create failed: ${room.status} ${room.text}`)
  const roomId = room.data.room?._id || room.data._id
  const roomCode = room.data.room?.code || room.data.code
  console.log(`✓ room ${roomCode} (${roomId})`)

  // 3. Approved question (MCQ, option 0 correct)
  const q = await api('/questions', {
    method: 'POST', token: teacherToken,
    body: {
      roomId, type: 'MCQ', question: 'Load test: pick option A',
      options: [
        { text: 'A (correct)', isCorrect: true },
        { text: 'B', isCorrect: false },
        { text: 'C', isCorrect: false },
        { text: 'D', isCorrect: false }
      ],
      status: 'approved', timeToAnswer: 30, points: 100
    }
  })
  if (!q.ok) throw new Error(`Question create failed: ${q.status} ${q.text}`)
  const questionId = q.data.question?._id || q.data._id
  console.log(`✓ question ${questionId}`)

  // 4. Students
  console.log(`Registering ${USERS} students (concurrency ${SEED_CONCURRENCY})...`)
  const { failed } = await pool(USERS, SEED_CONCURRENCY, (i) =>
    ensureUser({ name: `Student ${i}`, email: studentEmail(i), password: STUDENT_PASSWORD, role: 'student' })
  )
  console.log(`\n✓ students ready (${USERS - failed} ok, ${failed} failed)`)

  await writeFile(SEED_FILE, JSON.stringify({ roomId, roomCode, questionId, users: USERS, seededAt: new Date().toISOString() }, null, 2))
  console.log(`\nWrote ${SEED_FILE.pathname}. Now run:  node run.mjs`)
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1) })
