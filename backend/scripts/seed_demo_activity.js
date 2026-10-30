/**
 * Seed believable poll activity for the ten demo students (student1..student10@example.com).
 *
 * Why: the demo accounts had room memberships but no poll responses, so the dashboard read
 * "Polls taken 0" and "Earned points 0%", and student8..10 had no rooms at all. That looks broken
 * in a demo. This script gives every demo student:
 *
 *   - membership of the three rooms that already hold approved polls (so "Rooms joined" is real),
 *   - a stable, varied set of answered polls (40-100 points each),
 *   - at least one deliberately unanswered poll (so "Polls missed" is non-zero too).
 *
 * Numbers are derived from a stable hash of the student's email + question id, so re-running the
 * script produces the same dashboard instead of reshuffling every refresh.
 *
 * SAFE BY DEFAULT: dry-run (prints the plan, writes nothing). Pass --apply to write.
 *
 *   node backend/scripts/seed_demo_activity.js            # dry-run
 *   node backend/scripts/seed_demo_activity.js --apply    # write
 *
 * Only touches users matching /^student\d+@example\.com$/; any other account is left alone.
 * Uses MONGODB_URI (falls back to mongodb://127.0.0.1:27017/spandan).
 */
import mongoose from 'mongoose'
import User from '../src/models/User.js'
import Room from '../src/models/Room.js'
import Question from '../src/models/Question.js'
import RoomMember from '../src/models/RoomMember.js'
import Response from '../src/models/Response.js'

const APPLY = process.argv.includes('--apply')
const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/spandan'
// Rooms that already carry approved polls; joining them keeps the stats internally consistent
// (launched polls - answered = missed).
const POLL_ROOM_CODES = ['HVLZEQ', 'LDFW8A', '97VWZU']
// Live demo rooms that currently show "0 questions" on the dashboard's room cards. Give each a
// couple of approved polls so the card (and any student in it) has something real to count.
const ACTIVE_ROOM_CODES = ['LFZBHT', 'FS9VC6', 'WAQ5MT']
const ACTIVE_ROOM_POLLS = [
  {
    type: 'TF',
    question: 'A 401 response means the request was not authenticated.',
    options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }]
  },
  {
    type: 'TF',
    question: 'HTTP 429 means the server is rate limiting the client.',
    options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }]
  }
]

// Stable 32-bit FNV-1a -> [0, 1). Same trick as the starting-SP variation, so a student's demo
// history does not depend on insertion order or the clock.
function hash01(seed) {
  let h = 0x811c9dc5
  const text = String(seed)
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h / 0x100000000
}

const demoEmail = (email) => /^student(?:[1-9]|10)@example\.com$/i.test(String(email || ''))

async function main() {
  await mongoose.connect(URI)
  console.log(`Connected: ${URI}  |  mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}`)

  const students = await User.find({ role: 'student' }).select('name email').lean()
    .then((rows) => rows.filter((s) => demoEmail(s.email)).sort((a, b) => a.email.localeCompare(b.email, undefined, { numeric: true })))
  if (!students.length) throw new Error('no demo students found (expected student1..student10@example.com)')

  const rooms = await Room.find({ code: { $in: POLL_ROOM_CODES } }).select('name code teacher').lean()
  const roomByCode = new Map(rooms.map((r) => [r.code, r]))
  const missing = POLL_ROOM_CODES.filter((code) => !roomByCode.has(code))
  if (missing.length) throw new Error(`poll rooms not found: ${missing.join(', ')}`)

  // Live rooms: top up to two approved polls when they have none, so no room card reads
  // "0 questions" in the demo.
  const activeRooms = await Room.find({ code: { $in: ACTIVE_ROOM_CODES } }).select('name code teacher').lean()
  const activeRoomIds = activeRooms.map((r) => r._id)
  const activeQuestionCounts = await Question.aggregate([
    { $match: { roomId: { $in: activeRoomIds } } },
    { $group: { _id: '$roomId', count: { $sum: 1 } } }
  ])
  const activeCountByRoom = new Map(activeQuestionCounts.map((row) => [String(row._id), row.count]))
  const pendingCreate = new Set()
  for (const room of activeRooms) {
    if ((activeCountByRoom.get(String(room._id)) || 0) > 0) continue
    pendingCreate.add(String(room._id))
    console.log(`   + ${room.code} will get ${ACTIVE_ROOM_POLLS.length} approved polls`)
    if (!APPLY) continue
    await Question.insertMany(ACTIVE_ROOM_POLLS.map((poll) => ({
      roomId: room._id,
      type: poll.type,
      question: poll.question,
      options: poll.options,
      status: 'approved',
      points: 100,
      createdBy: room.teacher || undefined
    })))
    pendingCreate.delete(String(room._id))
  }

  const questions = await Question.find({
    roomId: { $in: [...rooms, ...activeRooms].map((r) => r._id) },
    status: 'approved'
  }).select('_id roomId type points').lean()
  const roomsWithPolls = new Set(questions.map((q) => String(q.roomId)))
  for (const room of [...rooms, ...activeRooms]) {
    const id = String(room._id)
    // Dry-run: rooms this script would fill are allowed to be empty right now.
    if (!roomsWithPolls.has(id) && !pendingCreate.has(id)) {
      throw new Error(`room ${room.code} has no approved polls; run this after seeding questions`)
    }
  }

  // Stable order so a student's chosen subset does not change between runs.
  const orderedQuestions = [...questions].sort((a, b) => String(a._id).localeCompare(String(b._id)))
  if (orderedQuestions.length < 2) throw new Error('need at least 2 approved polls to leave one missed')

  // A student only sees polls in rooms they belong to. Poll rooms are added for everyone below,
  // so start from those plus whatever they already joined.
  const pollRoomIds = new Set(rooms.map((r) => String(r._id)))
  const memberships = await RoomMember.find({ studentId: { $in: students.map((s) => s._id) } })
    .select('studentId roomId').lean()
  const memberRoomIds = new Map()
  for (const row of memberships) {
    const key = String(row.studentId)
    if (!memberRoomIds.has(key)) memberRoomIds.set(key, new Set())
    memberRoomIds.get(key).add(String(row.roomId))
  }

  console.log(`\nDemo students: ${students.length}  |  poll rooms: ${rooms.length}  |  approved polls: ${orderedQuestions.length}`)

  const plans = []
  for (const student of students) {
    const key = student.email.toLowerCase()
    const visible = new Set([...(memberRoomIds.get(String(student._id)) || []), ...pollRoomIds])
    const pool = orderedQuestions.filter((q) => visible.has(String(q.roomId)))
    // Answer roughly half to three-quarters of the polls, never all of them, so "missed" stays
    // non-zero while "taken" and "earned points" do too.
    const share = 0.45 + hash01(`${key}:share`) * 0.3
    const answers = Math.min(pool.length - 1, Math.max(1, Math.round(pool.length * share)))
    const ranked = [...pool].sort(
      (a, b) => hash01(`${key}:${a._id}`) - hash01(`${key}:${b._id}`)
    )
    const chosen = ranked.slice(0, answers).map((q, index) => {
      const roll = hash01(`${key}:${q._id}:points`)
      return {
        question: q,
        points: 40 + 5 * Math.floor(roll * 13), // 40..100 in 5-point steps
        responseTime: 6 + Math.floor(hash01(`${key}:${q._id}:time`) * 20),
        daysAgo: index + 1
      }
    })
    plans.push({ student, chosen, missed: pool.length - chosen.length })
  }

  console.log('\n-- Plan --')
  for (const { student, chosen, missed } of plans) {
    const avg = Math.round(chosen.reduce((sum, c) => sum + c.points, 0) / chosen.length)
    console.log(`   ${student.email}  answered ${chosen.length}/${chosen.length + missed}  missed ${missed}  avg ${avg}%  points [${chosen.map((c) => c.points).join(', ')}]`)
  }

  if (!APPLY) {
    console.log('\nDRY-RUN complete. Re-run with --apply to write these changes.')
    await mongoose.disconnect()
    return
  }

  for (const { student, chosen } of plans) {
    for (const room of rooms) {
      await RoomMember.updateOne(
        { roomId: room._id, studentId: student._id },
        {
          $setOnInsert: {
            joinedAt: new Date(Date.now() - 7 * 86400000),
            admissionStatus: 'admitted',
            attendanceStatus: 'on_time'
          }
        },
        { upsert: true }
      )
    }

    // Demo-only data: replace this student's previous seeded answers so a re-run is idempotent
    // even when the chosen subset shifts.
    await Response.deleteMany({ studentId: student._id })
    await Response.insertMany(chosen.map((c) => ({
      roomId: c.question.roomId,
      questionId: c.question._id,
      studentId: student._id,
      selectedOption: 0,
      selectedOptions: [],
      isCorrect: c.points >= 60,
      responseTime: c.responseTime,
      points: c.points,
      createdAt: new Date(Date.now() - c.daysAgo * 86400000)
    })))
  }

  console.log('\nAPPLY complete.')
  await mongoose.disconnect()
}

main().catch(async (error) => {
  console.error(error.message)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
