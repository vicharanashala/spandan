// Attendance tracking + the end-of-session Spandan-points deduction.
//
// Model: every student's membership stores the exact intervals they were inside the live room
// (`RoomMember.presence`). At room end those intervals are clipped to the session window
// [sessionStartedAt, endedAt] and the missed fraction of the session becomes the percentage removed
// from the points they earned. A student starts at 0, not at a 100-mark balance: only correct polls
// add marks, a wrong poll adds 0, and the deduction is taken from the total earned:
//
//   penaltyPercent = missedSeconds / sessionSeconds * 100
//   adjustedPoints = earnedPoints * (1 - penaltyPercent / 100)
//
// The deduction is applied to the Response.points values (the single source of truth for every
// leaderboard / results / research path), while the original value is preserved in
// Response.pointsBeforeAttendance so an excused absence can be recomputed without double-deducting.

import RoomMember from '../models/RoomMember.js'
import Response from '../models/Response.js'

// Every second a student is away AFTER their first join is forgiven from a single cumulative budget
// per student per session (not per gap). That includes reloads, network drops, explicit leaves, and a
// final departure where they never come back before the session ends. The budget is the room's
// reconnect allowance, defaulting to 60 seconds and never dropping below 60 even when the teacher
// sets 0. A 20-second reload then a 3-minute outage share the same budget; once it is used up,
// further absence counts. Time before the student's FIRST join is a late join and is never forgiven.
export const DEFAULT_RECONNECT_ALLOWANCE_SECONDS = 60
export const MIN_RECONNECT_ALLOWANCE_SECONDS = 60
const MAX_RECONNECT_ALLOWANCE_SECONDS = 3600

export const getReconnectAllowanceSeconds = (room) => {
  const raw = Number(room?.settings?.waitingRoom?.reconnectAllowanceSeconds)
  const value = Number.isFinite(raw)
    ? Math.floor(raw)
    : DEFAULT_RECONNECT_ALLOWANCE_SECONDS
  return Math.max(
    MIN_RECONNECT_ALLOWANCE_SECONDS,
    Math.min(MAX_RECONNECT_ALLOWANCE_SECONDS, value)
  )
}

export const getReconnectAllowanceMs = (room) => getReconnectAllowanceSeconds(room) * 1000

// ── Attention tracking ───────────────────────────────────────────────────────────────────────────
// The student's browser reports whether the Spandan window is currently visible AND focused. When it
// is not, presence is closed after a short grace period so the away time draws from the SAME absence
// budget as a reload/leave. `enabled` defaults to true, including for rooms saved before this
// feature existed (no settings.attention object).
export const DEFAULT_ATTENTION_ENABLED = true
export const DEFAULT_ATTENTION_GRACE_SECONDS = 7
export const MIN_ATTENTION_GRACE_SECONDS = 0
export const MAX_ATTENTION_GRACE_SECONDS = 300

export const getAttentionConfig = (room) => {
  const raw = room?.settings?.attention || {}
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_ATTENTION_ENABLED
  const rawGrace = Number(raw.graceSeconds)
  const graceSeconds = Number.isFinite(rawGrace)
    ? Math.floor(rawGrace)
    : DEFAULT_ATTENTION_GRACE_SECONDS
  return {
    enabled,
    graceSeconds: Math.max(
      MIN_ATTENTION_GRACE_SECONDS,
      Math.min(MAX_ATTENTION_GRACE_SECONDS, graceSeconds)
    )
  }
}

// A membership counts as a live participant while its last presence interval is open. Memberships
// written before attendance tracking have no `leftAt`; Mongo's `null` match includes missing fields,
// so those still count (they behaved exactly like present students before this feature).
export const ADMITTED_STATUS_FILTER = { status: { $nin: ['waiting', 'rejected'] } }

const sid = (v) => String(v?._id ?? v)
const round = (v, p = 2) => Math.round(v * 10 ** p) / 10 ** p

// Scheduled class time (set in the waiting-room settings). When the teacher opens the room early,
// the session/attendance clock still starts at the scheduled time, not at room creation.
const getScheduledAt = (room) => {
  const raw = room?.settings?.waitingRoom?.scheduledAt
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

export const getSessionWindow = (room, endedAt = null) => {
  const actualStart = new Date(room?.sessionStartedAt || room?.createdAt || Date.now())
  const scheduledStart = getScheduledAt(room)
  const start = scheduledStart && scheduledStart.getTime() > actualStart.getTime()
    ? scheduledStart
    : actualStart
  const end = new Date(endedAt || room?.endedAt || Date.now())
  return { start, end, totalMs: Math.max(0, end.getTime() - start.getTime()) }
}

// Number of admitted students currently in the room (open presence interval). Used for the live
// participant badge; the waiting-room "admitted" list still shows everybody who was admitted.
export const countPresent = (roomId) =>
  RoomMember.countDocuments({ roomId, ...ADMITTED_STATUS_FILTER, leftAt: null })

/**
 * Mark a student present. Idempotent: if an interval is already open this only refreshes `leftAt`.
 * On-time students are credited from the session start on their FIRST presence interval, so time
 * spent waiting in the teacher-controlled waiting room is not counted as missed class time.
 */
export const startPresence = async (room, studentId, at = new Date()) => {
  const member = await RoomMember.findOne({ roomId: room._id, studentId })
  if (!member) return null
  if (member.status === 'waiting' || member.status === 'rejected') return member

  const hasOpen = (member.presence || []).some((p) => !p.end)
  if (hasOpen) {
    member.leftAt = null
    member.lastSeenAt = at
    await member.save()
    return member
  }

  const { start: sessionStart } = getSessionWindow(room)
  const isFirst = !member.presence || member.presence.length === 0
  // On-time students are credited from the session start, but never from a future scheduled time:
  // if the room is open early, the interval starts when they actually joined and is clipped to the
  // scheduled start at finalization.
  const start = member.onTime && isFirst
    ? new Date(Math.min(new Date(at).getTime(), sessionStart.getTime()))
    : new Date(at)
  member.presence = [...(member.presence || []), { start, end: null }]
  member.leftAt = null
  member.lastSeenAt = at
  await member.save()
  return member
}

/**
 * Close the student's open presence interval. The membership itself is KEPT so the attendance history
 * survives a leave/rejoin (and so a later rejoin cannot reset the original join time / on-time tag).
 *
 * `reason` records WHY the interval closed (tab hidden, window lost focus, frozen heartbeat, leave,
 * disconnect) so the teacher's per-lecture history can label the gap. It is optional and capped so
 * an unexpected caller can never store an unbounded string.
 */
export const endPresence = async (room, studentId, at = new Date(), reason = null) => {
  const member = await RoomMember.findOne({ roomId: room._id, studentId })
  if (!member) return null
  const presence = member.presence || []
  const cleanReason = typeof reason === 'string' && reason.trim()
    ? reason.trim().slice(0, 40)
    : null
  let closed = false
  for (let i = presence.length - 1; i >= 0; i -= 1) {
    if (!presence[i].end) {
      // Never close an interval before it started: a client-supplied "since" is clamped so it cannot
      // turn a malicious future timestamp into zero absence, and cannot bend the start backwards.
      const startMs = new Date(presence[i].start).getTime()
      const atMs = new Date(at).getTime()
      presence[i].end = new Date(
        Number.isFinite(atMs) ? Math.max(startMs, atMs) : Math.max(startMs, Date.now())
      )
      presence[i].endedReason = cleanReason
      closed = true
      break
    }
  }
  if (closed) member.markModified('presence')
  member.leftAt = at
  member.lastSeenAt = at
  await member.save()
  // `closed` lets the socket layer avoid a duplicate "left" notice when a presence interval was
  // already shut (explicit leave followed by a disconnect, or a waiting-room student leaving).
  return { member, closed }
}

/**
 * Is this membership in the room RIGHT NOW?
 *
 * Used by POST /responses (the cached membership lookup cannot answer this). A membership counts as
 * present only while its most recent presence interval is open. A membership written before
 * attendance tracking existed (no `presence` history at all) is treated as present, so an older
 * server/database can never lock its students out.
 */
export const isMembershipPresent = (member) => {
  if (!member || member.leftAt != null) return false
  if (!Array.isArray(member.presence) || member.presence.length === 0) return true
  return member.presence.some((p) => !p.end)
}

// Merge overlapping presence intervals and split the result into present / forgiven / missed time.
// Every absence after the FIRST interval is eligible: internal gaps (leave -> rejoin) and the
// trailing gap (leave -> session end with no rejoin). Together they share one allowance and are
// never forgiven beyond `allowanceMs`. The gap before the first interval is never forgiven: that is
// the time the student joined late.
export const computePresenceBreakdown = ({ intervals, sessionStart, sessionEnd, totalMs, allowanceMs = 0 }) => {
  const startMs = sessionStart.getTime()
  const endMs = sessionEnd.getTime()
  const clipped = (intervals || [])
    .map((p) => ({
      start: Math.max(startMs, new Date(p.start).getTime()),
      end: Math.min(endMs, new Date(p.end || sessionEnd).getTime())
    }))
    .filter((p) => Number.isFinite(p.start) && Number.isFinite(p.end) && p.end > p.start)
    .sort((a, b) => a.start - b.start)

  let present = 0
  let internalGap = 0
  let firstStart = null
  let lastEnd = null
  for (const p of clipped) {
    if (firstStart === null) firstStart = p.start
    if (lastEnd === null) {
      present += p.end - p.start
      lastEnd = p.end
      continue
    }
    if (p.start <= lastEnd) {
      if (p.end > lastEnd) present += p.end - lastEnd
      lastEnd = Math.max(lastEnd, p.end)
      continue
    }
    internalGap += p.start - lastEnd
    present += p.end - p.start
    lastEnd = p.end
  }

  present = Math.min(totalMs, Math.max(0, present))
  const missedRaw = Math.max(0, totalMs - present)
  // The student only earns the allowance after their first join. Everything before that is a late
  // join and stays billed; everything after it is absence (including never returning at the end).
  const leadingGap = firstStart === null ? totalMs : Math.max(0, firstStart - startMs)
  const trailingGap = firstStart === null ? 0 : Math.max(0, endMs - lastEnd)
  const eligibleGap = internalGap + trailingGap
  const forgiven = Math.min(eligibleGap, Math.max(0, allowanceMs), missedRaw)
  return {
    presentMs: present,
    internalGapMs: internalGap,
    trailingGapMs: trailingGap,
    leadingGapMs: leadingGap,
    forgivenMs: forgiven,
    missedMs: Math.max(0, missedRaw - forgiven)
  }
}

const sec = (ms) => Math.round(ms / 1000)

/**
 * Live view of one membership's presence for the absence-budget meter.
 *
 * Returns join/leave events, every away period with the part of the allowance it consumed, and the
 * running totals. `usedSeconds` includes the still-open trailing absence (the student is away right
 * now), so the meter drains while they are gone. The first gap (before the very first join) is a
 * late join and is never forgiven, exactly as at finalization.
 */
export const computeReconnectUsage = ({ member, room, at = new Date() }) => {
  // Once a room has ended its window must stop at `endedAt`, even if a caller passes "now" (the
  // waiting-room serializer does). Otherwise the final absence would keep growing after the session.
  const { start, end, totalMs } = getSessionWindow(room, room?.endedAt || at)
  const allowanceSeconds = getReconnectAllowanceSeconds(room)
  const allowanceMs = allowanceSeconds * 1000
  const startMs = start.getTime()
  const endMs = end.getTime()

  const intervals = (member?.presence || [])
    .map((p) => ({
      start: new Date(p.start),
      end: p.end ? new Date(p.end) : null,
      // Why this interval closed (null for an open interval / legacy interval).
      reason: p.endedReason || null
    }))
    .filter((p) => !Number.isNaN(p.start.getTime()))
    .sort((a, b) => a.start - b.start)

  const breakdown = computePresenceBreakdown({
    intervals,
    sessionStart: start,
    sessionEnd: end,
    totalMs,
    allowanceMs
  })

  // Clip + merge exactly like computePresenceBreakdown so per-gap allocation matches the totals.
  const clipped = intervals
    .map((p) => ({
      start: Math.max(startMs, p.start.getTime()),
      end: Math.min(endMs, (p.end || end).getTime()),
      reason: p.reason
    }))
    .filter((p) => p.end > p.start)
    .sort((a, b) => a.start - b.start)
  const merged = []
  for (const p of clipped) {
    const last = merged[merged.length - 1]
    if (last && p.start <= last.end) {
      if (p.end >= last.end) {
        last.end = Math.max(last.end, p.end)
        last.reason = p.reason || last.reason
      }
    } else {
      merged.push({ ...p })
    }
  }

  let remainingMs = allowanceMs
  const gaps = []
  for (let i = 1; i < merged.length; i += 1) {
    const gapMs = merged[i].start - merged[i - 1].end
    const forgivenMs = Math.min(gapMs, Math.max(0, remainingMs))
    remainingMs -= forgivenMs
    gaps.push({
      start: new Date(merged[i - 1].end),
      end: new Date(merged[i].start),
      seconds: sec(gapMs),
      forgivenSeconds: sec(forgivenMs),
      billedSeconds: sec(gapMs - forgivenMs),
      // Why the student was away for this gap (the interval before it decided how it ended).
      reason: merged[i - 1].reason || null
    })
  }

  // Time after the last known presence is absence too: a reload that never finishes, a tab closed
  // for good, or a leave near the end with no return. It draws from the same budget. While the room
  // is live the gap is still open (and grows up to "now"); once the room ends it stops at the
  // session end and is marked as a final absence.
  const lastMerged = merged[merged.length - 1]
  if (lastMerged && lastMerged.end < endMs) {
    const gapMs = endMs - lastMerged.end
    const forgivenMs = Math.min(gapMs, Math.max(0, remainingMs))
    remainingMs -= forgivenMs
    gaps.push({
      start: new Date(lastMerged.end),
      end: new Date(endMs),
      seconds: sec(gapMs),
      forgivenSeconds: sec(forgivenMs),
      billedSeconds: sec(gapMs - forgivenMs),
      reason: lastMerged.reason || null,
      open: !room?.endedAt,
      final: !!room?.endedAt
    })
  }

  const events = []
  for (const p of merged) {
    events.push({ type: 'joined', at: new Date(p.start) })
    if (p.end < endMs) events.push({ type: 'left', at: new Date(p.end), reason: p.reason || null })
  }
  events.sort((a, b) => a.at - b.at)

  const lastRaw = intervals[intervals.length - 1]
  return {
    allowanceSeconds,
    usedSeconds: sec(breakdown.forgivenMs),
    remainingSeconds: Math.max(0, allowanceSeconds - sec(breakdown.forgivenMs)),
    gapSeconds: sec(breakdown.internalGapMs + breakdown.trailingGapMs),
    internalGapSeconds: sec(breakdown.internalGapMs),
    trailingGapSeconds: sec(breakdown.trailingGapMs),
    presentSeconds: sec(breakdown.presentMs),
    missedSeconds: sec(breakdown.missedMs),
    sessionSeconds: sec(totalMs),
    rejoins: Math.max(0, merged.length - 1),
    // An ended room has no live presence even if the last interval was left open at finalization.
    present: !room?.endedAt && !!lastRaw && !lastRaw.end && endMs > startMs,
    // Why the most recent closed interval ended (null when the student is present or reason unknown).
    awayReason: lastRaw && lastRaw.end ? (lastRaw.reason || null) : null,
    events,
    gaps
  }
}

/**
 * Compute + apply the attendance deduction for a room. Called when the room ends (before the
 * leaderboard/snapshot/insights recomputes) and again for a single student when the teacher toggles
 * an excused absence.
 *
 * Idempotent: members already finalized are skipped unless `force` is set. Forced runs first restore
 * every response's raw points, so the deduction is never applied twice.
 */
export const finalizeRoomAttendance = async ({ room, studentIds = null, force = false, endedAt = null }) => {
  const { start: sessionStart, end: sessionEnd, totalMs } = getSessionWindow(room, endedAt)
  const memberFilter = { roomId: room._id, ...ADMITTED_STATUS_FILTER }
  const responseFilter = { roomId: room._id }
  if (Array.isArray(studentIds) && studentIds.length > 0) {
    memberFilter.studentId = { $in: studentIds }
    responseFilter.studentId = { $in: studentIds }
  }

  const [members, responses] = await Promise.all([
    RoomMember.find(memberFilter),
    Response.find(responseFilter)
  ])

  const responsesByStudent = new Map()
  for (const r of responses) {
    const key = sid(r.studentId)
    let list = responsesByStudent.get(key)
    if (!list) { list = []; responsesByStudent.set(key, list) }
    list.push(r)
  }

  const now = new Date()
  const summary = []

  for (const member of members) {
    if (!force && member.attendanceFinalizedAt) {
      summary.push({
        studentId: sid(member.studentId),
        penaltyPercent: member.penaltyPercent,
        skipped: true
      })
      continue
    }

    const studentResponses = responsesByStudent.get(sid(member.studentId)) || []

    // Restore raw points first so a forced recompute starts from the undeducted score.
    const rawPoints = studentResponses.reduce((sum, r) => {
      const raw = Number.isFinite(r.pointsBeforeAttendance) ? r.pointsBeforeAttendance : r.points
      return sum + (Number.isFinite(raw) ? raw : 0)
    }, 0)

    let intervals = (member.presence || []).map((p) => ({ start: p.start, end: p.end }))
    if (intervals.length === 0) {
      // No recorded presence (e.g. a membership from before tracking was deployed). Credit the
      // student from the moment they first joined instead of wiping their score.
      const fallbackStart = member.onTime
        ? sessionStart
        : new Date(member.joinedAt || member.admittedAt || sessionStart)
      intervals = [{ start: fallbackStart, end: sessionEnd }]
    }
    // Time spent waiting in the waiting room counts as present for an ON-TIME student — the teacher
    // controls when they are admitted, so a delayed admission is not the student's absence.
    if (member.onTime) {
      intervals[0].start = new Date(Math.min(new Date(intervals[0].start).getTime(), sessionStart.getTime()))
    }

    const { presentMs, forgivenMs, missedMs } = computePresenceBreakdown({
      intervals,
      sessionStart,
      sessionEnd,
      totalMs,
      allowanceMs: getReconnectAllowanceMs(room)
    })
    const penaltyPercent = member.attendanceExcused || totalMs <= 0
      ? 0
      : round((missedMs / totalMs) * 100, 2)

    const factor = Math.max(0, 1 - penaltyPercent / 100)

    // Every student starts at 0: marks come only from correct polls, and a wrong poll earns 0.
    // The absence percentage is therefore taken from the student's TOTAL earned marks (not from a
    // 100-mark balance and not from each question's maximum). Compute the exact total first, then
    // split it back across the responses (largest-remainder) so the per-poll rows still add up to
    // `round(earned × (1 − penalty))` instead of drifting by a point or two from per-row rounding.
    // A zero-mark (wrong/unanswered) response has raw = 0, so it can never receive a share.
    const targetPoints = Math.round(rawPoints * factor)
    const allocations = studentResponses.map((r) => {
      const raw = Number.isFinite(r.pointsBeforeAttendance) ? r.pointsBeforeAttendance : r.points
      const exact = Math.max(0, raw) * factor
      const base = Math.min(Math.max(0, raw), Math.floor(exact + 1e-9))
      return { r, raw, points: base, remainder: exact - Math.floor(exact + 1e-9) }
    })

    let left = targetPoints - allocations.reduce((sum, a) => sum + a.points, 0)
    if (left > 0) {
      // Fill the remaining marks into the responses with the largest fractional remainders first,
      // one mark each per pass, so a single poll never absorbs the whole rounding difference.
      const order = [...allocations].sort((a, b) =>
        b.remainder - a.remainder ||
        b.raw - a.raw ||
        String(a.r._id).localeCompare(String(b.r._id))
      )
      while (left > 0) {
        let progressed = false
        for (const a of order) {
          if (left <= 0) break
          if (a.points >= a.raw) continue
          a.points += 1
          left -= 1
          progressed = true
        }
        if (!progressed) break
      }
    } else if (left < 0) {
      // Defensive: remove any excess from the smallest remainders first, one mark each (never
      // below zero), so the correction is spread rather than dumped on one poll.
      const order = [...allocations].sort((a, b) =>
        a.remainder - b.remainder ||
        a.raw - b.raw ||
        String(a.r._id).localeCompare(String(b.r._id))
      )
      while (left < 0) {
        let progressed = false
        for (const a of order) {
          if (left >= 0) break
          if (a.points <= 0) continue
          a.points -= 1
          left += 1
          progressed = true
        }
        if (!progressed) break
      }
    }

    const ops = []
    let adjustedPoints = 0
    for (const { r, raw, points: next } of allocations) {
      adjustedPoints += next
      r.pointsBeforeAttendance = raw
      r.points = next
      ops.push({
        updateOne: {
          filter: { _id: r._id },
          update: { $set: { points: next, pointsBeforeAttendance: raw } }
        }
      })
    }
    if (ops.length > 0) await Response.bulkWrite(ops)

    member.sessionSeconds = Math.round(totalMs / 1000)
    member.presentSeconds = Math.round(presentMs / 1000)
    member.forgivenSeconds = Math.round(forgivenMs / 1000)
    member.missedSeconds = Math.round(missedMs / 1000)
    member.penaltyPercent = penaltyPercent
    member.rawPoints = rawPoints
    member.adjustedPoints = adjustedPoints
    member.attendanceFinalizedAt = now
    await member.save()

    summary.push({
      studentId: sid(member.studentId),
      sessionSeconds: member.sessionSeconds,
      presentSeconds: member.presentSeconds,
      forgivenSeconds: member.forgivenSeconds,
      missedSeconds: member.missedSeconds,
      penaltyPercent,
      rawPoints,
      adjustedPoints,
      excused: !!member.attendanceExcused
    })
  }

  return summary
}

// Recompute a single student's attendance after an excuse toggle. Safe on live rooms too: it only
// changes scores when the room has ended (the caller decides).
export const recomputeStudentAttendance = async (room, studentId) =>
  finalizeRoomAttendance({ room, studentIds: [studentId], force: true })
