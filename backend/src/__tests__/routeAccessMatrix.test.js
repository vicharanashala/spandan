// The route access matrix — one table saying, for every route in the API, which kind of caller gets
// in and which gets turned away.
//
// The policy declarations checked at boot (middleware/routePolicy.js) prove a route said SOMETHING
// about access. They cannot prove it said the right thing: GET /api/responses declared
// `authenticate`, was therefore never flagged, and returned every student's answers and the answer
// key to any member of the room. Only a statement of expected outcomes catches that, and only if it
// covers routes nobody thought to write a test for — which is why the last test in this file fails
// when a route exists that has no row here.
//
// Reading a row: five callers, five verdicts. `allow` lists the callers who must get past
// authorization; everyone else must be refused with 401 or 403. Allowed callers are not asserted to
// succeed — a permitted request may still 400 on an empty body or 404 on absent data — because this
// is a test of who may ask, not of what the answer is. Handler behaviour is tested elsewhere.
import express from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import User from '../models/User.js'
import Room from '../models/Room.js'
import Question from '../models/Question.js'
import Response from '../models/Response.js'
import RoomMember from '../models/RoomMember.js'
import { API_ROUTES } from '../apiRoutes.js'
import { listRoutes } from '../middleware/routePolicy.js'
import { generateToken, clearUserCache } from '../middleware/auth.js'

const app = express()
app.use(express.json())
for (const [basePath, router] of API_ROUTES) app.use(basePath, router)

// The five kinds of caller the authorization rules distinguish between.
const ANONYMOUS = 'anonymous'
const STUDENT_OUTSIDER = 'studentOutsider' // signed in, has not joined the room
const STUDENT_MEMBER = 'studentMember'     // signed in, joined the room
const TEACHER_OTHER = 'teacherOther'       // a teacher, but not this room's
const TEACHER_OWNER = 'teacherOwner'       // the teacher who owns the room

const PERSONAS = [ANONYMOUS, STUDENT_OUTSIDER, STUDENT_MEMBER, TEACHER_OTHER, TEACHER_OWNER]
const EVERYONE = PERSONAS
const SIGNED_IN = [STUDENT_OUTSIDER, STUDENT_MEMBER, TEACHER_OTHER, TEACHER_OWNER]
const TEACHERS = [TEACHER_OTHER, TEACHER_OWNER]
const STUDENTS = [STUDENT_OUTSIDER, STUDENT_MEMBER]
const ROOM_MEMBERS = [STUDENT_MEMBER, TEACHER_OWNER]
const NOBODY = []

// Fixtures are rebuilt per test case (`f`), so a case that ends, deletes or joins a room cannot
// change the answer for the next one.
const MATRIX = [
  // --- Authentication ------------------------------------------------------------------------
  // Open by design: you cannot require a session to create one.
  { route: 'POST /api/auth/login', allow: EVERYONE },
  { route: 'POST /api/auth/register/send-otp', allow: EVERYONE },
  { route: 'POST /api/auth/register/verify', allow: EVERYONE },
  { route: 'POST /api/auth/forgot-password', allow: EVERYONE },
  { route: 'POST /api/auth/reset-password', allow: EVERYONE },
  // Reachable without a Spandan session (that is the point — it is how one is obtained), but its
  // credential is a Samagama token, which none of these callers hold. Nobody gets past it here, and
  // holding an ordinary Spandan session must not help: this route provisions accounts and assigns
  // their role from Samagama's admin flags.
  { route: 'POST /api/auth/samagama-auto-login', allow: NOBODY },
  { route: 'GET /api/auth/me', allow: SIGNED_IN },
  { route: 'PUT /api/auth/profile', allow: SIGNED_IN },
  { route: 'PUT /api/auth/password', allow: SIGNED_IN },

  // --- Rooms ---------------------------------------------------------------------------------
  { route: 'POST /api/rooms', allow: TEACHERS },
  // Lists the caller's OWN rooms; the handler refuses students outright.
  { route: 'GET /api/rooms', allow: TEACHERS },
  { route: 'GET /api/rooms/:id', url: (f) => `/api/rooms/${f.room._id}`, allow: ROOM_MEMBERS },
  { route: 'PUT /api/rooms/:id', url: (f) => `/api/rooms/${f.room._id}`, body: { name: 'Renamed' }, allow: [TEACHER_OWNER] },
  { route: 'DELETE /api/rooms/:id', url: (f) => `/api/rooms/${f.room._id}`, allow: [TEACHER_OWNER] },
  { route: 'GET /api/rooms/join/:code', url: (f) => `/api/rooms/join/${f.room.code}`, allow: STUDENTS },
  { route: 'GET /api/rooms/student/room-history', allow: STUDENTS },
  { route: 'GET /api/rooms/student/active', allow: STUDENTS },

  // --- Questions -----------------------------------------------------------------------------
  { route: 'GET /api/questions/providers', allow: SIGNED_IN },
  { route: 'POST /api/questions/generate', allow: TEACHERS },
  { route: 'GET /api/questions/jobs/:jobId', url: () => '/api/questions/jobs/some-job', allow: TEACHERS },
  // Members read the room's approved questions (answers stripped by the handler); the owning
  // teacher reads all of them. A teacher with no relationship to the room reads nothing.
  { route: 'GET /api/questions', url: (f) => `/api/questions?roomId=${f.room._id}`, allow: ROOM_MEMBERS },
  // Writing a question is the owner's alone — this is the hole that let one teacher plant a
  // deliberately-wrong answer key in another teacher's live room.
  {
    route: 'POST /api/questions',
    body: (f) => ({
      roomId: f.room._id.toString(),
      type: 'MCQ',
      question: 'Planted?',
      options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }]
    }),
    allow: [TEACHER_OWNER]
  },

  // --- Responses -----------------------------------------------------------------------------
  // Only students answer, and only in rooms they have joined.
  { route: 'POST /api/responses', body: (f) => ({ roomId: f.room._id.toString() }), allow: [STUDENT_MEMBER] },
  // Raw responses with the question populated — every answer and the answer key. Owner only.
  { route: 'GET /api/responses', url: (f) => `/api/responses?roomId=${f.room._id}`, allow: [TEACHER_OWNER] },
  { route: 'GET /api/responses/counts/:roomId', url: (f) => `/api/responses/counts/${f.room._id}`, allow: [TEACHER_OWNER] },
  { route: 'GET /api/responses/stats/room/:roomId', url: (f) => `/api/responses/stats/room/${f.room._id}`, allow: [TEACHER_OWNER] },
  { route: 'GET /api/responses/room/:roomId/export', url: (f) => `/api/responses/room/${f.room._id}/export`, allow: [TEACHER_OWNER] },
  { route: 'GET /api/responses/leaderboard/:roomId', url: (f) => `/api/responses/leaderboard/${f.room._id}`, allow: ROOM_MEMBERS },
  // A student's own results. The member may read themselves and the owning teacher may read any of
  // their students; the other student and the unrelated teacher may not.
  {
    route: 'GET /api/responses/room/:roomId/student/:studentId',
    url: (f) => `/api/responses/room/${f.room._id}/student/${f.users.studentMember._id}`,
    allow: ROOM_MEMBERS
  },
  {
    route: 'GET /api/responses/stats/student/:studentId',
    url: (f) => `/api/responses/stats/student/${f.users.studentMember._id}`,
    allow: ROOM_MEMBERS
  },

  // --- Transcription (the CPU-bound whisper proxy) --------------------------------------------
  { route: 'GET /api/transcription/status', allow: SIGNED_IN },
  { route: 'POST /api/transcription/transcribe', allow: TEACHERS },

  // --- Transcripts ---------------------------------------------------------------------------
  {
    route: 'POST /api/transcripts',
    body: (f) => ({ roomId: f.room._id.toString(), segmentIndex: 0, text: 'hello' }),
    allow: [TEACHER_OWNER]
  },
  { route: 'GET /api/transcripts/room/:roomId', url: (f) => `/api/transcripts/room/${f.room._id}`, allow: ROOM_MEMBERS },
  {
    route: 'GET /api/transcripts/:roomId/:segmentIndex',
    url: (f) => `/api/transcripts/${f.room._id}/0`,
    allow: ROOM_MEMBERS
  },

  // --- Research export -----------------------------------------------------------------------
  // A separate lane keyed by X-Research-Key. No session token of any kind opens it — it reads
  // across every teacher's rooms and exports student emails.
  { route: 'GET /api/research/sessions', allow: NOBODY }
]

const parseRoute = (route) => {
  const [method, path] = route.split(' ')
  return { method: method.toLowerCase(), path }
}

const resolve = (value, fixtures) => (typeof value === 'function' ? value(fixtures) : value)

describe('Route access matrix', () => {
  let users
  let fixtures

  beforeAll(async () => {
    // Jest runs suites in parallel against ONE mongod, so every suite that writes takes its own
    // database — otherwise a beforeEach in a sibling suite deletes this one's fixtures mid-run.
    await mongoose.connect(process.env.MONGO_URL, { dbName: 'route-access-matrix' })
    await User.deleteMany({})

    // Users are immutable across cases and cost a bcrypt hash each, so they are made once.
    const make = (name, role) =>
      new User({ name, email: `${name}@example.com`, role, password: 'a-real-password' }).save()

    users = {
      studentOutsider: await make('outsider', 'student'),
      studentMember: await make('member', 'student'),
      teacherOther: await make('other', 'teacher'),
      teacherOwner: await make('owner', 'teacher')
    }
  })

  afterAll(async () => {
    await mongoose.disconnect()
  })

  beforeEach(async () => {
    await Promise.all([
      Room.deleteMany({}),
      RoomMember.deleteMany({}),
      Question.deleteMany({}),
      Response.deleteMany({})
    ])
    clearUserCache()

    const room = await new Room({ name: 'Owned Room', teacher: users.teacherOwner._id }).save()
    await new RoomMember({ roomId: room._id, studentId: users.studentMember._id }).save()

    fixtures = { users, room }
  })

  const authHeader = (persona) =>
    persona === ANONYMOUS ? null : `Bearer ${generateToken(users[persona]._id.toString())}`

  const cases = MATRIX.flatMap((row) =>
    PERSONAS.map((persona) => ({
      name: `${row.route} — ${persona} is ${row.allow.includes(persona) ? 'allowed' : 'refused'}`,
      row,
      persona,
      allowed: row.allow.includes(persona)
    }))
  )

  it.each(cases)('$name', async ({ row, persona, allowed }) => {
    const { method, path } = parseRoute(row.route)
    const url = row.url ? resolve(row.url, fixtures) : path

    let req = request(app)[method](url)
    const token = authHeader(persona)
    if (token) req = req.set('Authorization', token)
    if (row.body) req = req.send(resolve(row.body, fixtures))

    const res = await req

    // 401/403 is the authorization answer; anything else means the request was let through to the
    // handler, which is all this table asserts.
    if (allowed) {
      expect([401, 403]).not.toContain(res.status)
    } else {
      expect([401, 403]).toContain(res.status)
    }
  })

  // The matrix asserts the status code. For a write, "refused" also has to mean nothing was
  // written — a 403 returned after the document was saved would satisfy the table and still be the
  // bug. Checked on the write that was actually exploited.
  it('persists nothing when a write is refused', async () => {
    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', authHeader(TEACHER_OTHER))
      .send({
        roomId: fixtures.room._id.toString(),
        type: 'MCQ',
        question: 'Planted?',
        options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }]
      })

    expect(res.status).toBe(403)
    expect(await Question.countDocuments({ roomId: fixtures.room._id })).toBe(0)
  })

  // The reason this file catches the NEXT bug rather than documenting the last one: a route that
  // exists but was never considered here fails the build until someone states who may call it.
  it('has a row for every route the server mounts, and no rows for routes it does not', () => {
    const mounted = listRoutes(API_ROUTES).map((r) => `${r.method} ${r.path}`).sort()
    const covered = MATRIX.map((row) => row.route).sort()

    expect(covered).toEqual(mounted)
  })
})
