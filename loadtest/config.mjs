// Shared config for the load test. Override anything via environment variables.
//
// BASE_URL      Where the app is reachable. For a staging deploy behind nginx this is the public
//               origin, e.g. https://staging.spandan.fun. For a direct backend it's http://host:PORT.
// API_PREFIX    Path prefix in front of /api and /socket.io. Behind the nginx+server.js proxy this is
//               '/spandan'; hitting the backend directly it's '' (empty).
// USERS         How many students to simulate (default 1000).
// RAMP_MS       Spread the surge over this many ms (0 = all at once — the worst case).
// TEACHER_*     Credentials for the teacher account the seed creates / uses.

const clean = (u) => (u || '').replace(/\/$/, '')

export const BASE_URL = clean(process.env.BASE_URL || 'http://localhost:3001')
export const API_PREFIX = process.env.API_PREFIX ?? '' // e.g. '/spandan' behind the proxy
export const API = `${BASE_URL}${API_PREFIX}/api`
export const SOCKET_PATH = `${API_PREFIX}/socket.io`

export const USERS = Number(process.env.USERS || 1000)
export const RAMP_MS = Number(process.env.RAMP_MS || 10000) // ramp the surge over 10s by default
export const SEED_CONCURRENCY = Number(process.env.SEED_CONCURRENCY || 50)

export const TEACHER = {
  name: 'LoadTest Teacher',
  email: process.env.TEACHER_EMAIL || 'loadtest.teacher@example.com',
  password: process.env.TEACHER_PASSWORD || 'LoadTest#1'
}

// Every simulated student shares this password (they're throwaway accounts).
export const STUDENT_PASSWORD = process.env.STUDENT_PASSWORD || 'LoadTest#1'
export const studentEmail = (i) => `loadtest.student${i}@example.com`
export const SEED_FILE = new URL('./.seed.json', import.meta.url)
