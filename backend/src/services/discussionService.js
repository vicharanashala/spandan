import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import Discussion from '../models/Discussion.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import User from '../models/User.js'
import { canJoinRoom } from './roomJoinAuthz.js'

export const denied = (message = 'Discussion access denied') => Object.assign(new Error(message), { status: 403 })

export async function participant(user, room) {
  if (!user || !room || room.endedAt || !room.isActive) throw denied()
  if (!canJoinRoom({ role: user.role, userId: user._id, room }).ok) throw denied()
  if (user.role === 'teacher' && user.teacherApprovalStatus !== 'approved') throw denied()
  if (user.role === 'student' && !await RoomMember.exists({ roomId: room._id, studentId: user._id })) throw denied()
}

export function publicState(doc, room) {
  return {
    roomCode: room.code, roomId: String(room._id), active: !!doc?.active && !room.endedAt && !!room.isActive,
    session: doc?.session || '', version: doc?.version || 0,
    pendingHands: doc?.pendingHands || [], speaker: doc?.speaker || null,
    entries: [...(doc?.entries || [])].sort((a, b) => a.order - b.order)
  }
}

export async function readDiscussion(room) {
  return publicState(await Discussion.findOne({ roomId: room._id }).lean(), room)
}

// Room shutdown is a separate document from discussion state. Mark this single discussion
// document closed first so transcript writes and room shutdown serialize on the same Mongo row.
export async function closeDiscussionForRoom(roomId) {
  const update = {
    $set: { closing: true, active: false, pendingHands: [], speaker: null },
    $setOnInsert: { roomId },
    $inc: { version: 1 }
  }
  try {
    await Discussion.updateOne({ _id: roomId }, update, { upsert: true })
  } catch (error) {
    if (error.code !== 11000) throw error
    // A concurrent discussion start created the unique room row; close that row now.
    await Discussion.updateOne({ _id: roomId }, { $set: update.$set, $inc: update.$inc })
  }
}

export function transition(state, action, user, target) {
  const next = { ...state, pendingHands: [...state.pendingHands] }
  if (action === 'start') {
    if (state.active) return next
    return { ...next, active: true, session: randomUUID(), pendingHands: [], speaker: null, entries: [] }
  }
  if (action === 'end') return { ...next, active: false, pendingHands: [], speaker: null }
  if (!state.active) throw denied('Discussion is not active')
  const id = String(user._id)
  if (action === 'raise-hand') {
    if (state.speaker?.studentId === id || state.pendingHands.some(h => h.studentId === id)) return next
    if (state.pendingHands.length >= 20) throw denied('Discussion queue is full')
    next.pendingHands.push({ studentId: id, name: user.name })
  } else if (action === 'approve') {
    if (state.speaker) throw denied('Finish the current speaker first')
    const hand = state.pendingHands.find(h => h.studentId === target)
    if (!hand) throw denied('Student has not raised a hand')
    next.speaker = { ...hand, grant: randomUUID() }
    next.pendingHands = next.pendingHands.filter(h => h.studentId !== target)
  } else if (action === 'reject') {
    next.pendingHands = next.pendingHands.filter(h => h.studentId !== target)
  } else if (action === 'remove-speaker') {
    if (state.speaker?.studentId !== target) throw denied()
    next.speaker = null
  } else throw denied()
  return next
}

export async function changeDiscussion(room, action, user, target) {
  await participant(user, room)
  if (action === 'raise-hand' ? user.role !== 'student' : user.role !== 'teacher') throw denied()
  if (action === 'approve') {
    if (!mongoose.isValidObjectId(target) || !await RoomMember.exists({ roomId: room._id, studentId: target })) throw denied()
    const student = await User.findById(target).lean()
    if (student?.role !== 'student') throw denied()
  }
  // Use the room ID as the document ID: uniqueness holds even before secondary indexes build.
  // CAS prevents two API instances approving different speakers.
  try { await Discussion.updateOne({ _id: room._id }, { $setOnInsert: { roomId: room._id } }, { upsert: true }) }
  catch (e) { if (e.code !== 11000) throw e }
  for (let i = 0; i < 5; i++) {
    const state = await Discussion.findOne({ roomId: room._id }).lean()
    if (state.closing) throw denied('Room is closing')
    const next = transition(state, action, user, target)
    const update = { active: next.active, session: next.session, pendingHands: next.pendingHands, speaker: next.speaker }
    if (next.session !== state.session) update.entries = []
    const result = await Discussion.findOneAndUpdate({ _id: state._id, version: state.version }, { $set: update, $inc: { version: 1 } }, { new: true }).lean()
    if (result) return publicState(result, room)
  }
  throw Object.assign(new Error('Discussion changed; please retry'), { status: 409 })
}

export async function audioAccess(user, body) {
  // HTTP authentication caches users; audio authorization must use the current account.
  user = await User.findById(user._id).lean()
  if (!user) throw denied()
  // Keep official teacher transcription without a room working as before.
  if (user.role === 'teacher' && user.teacherApprovalStatus !== 'approved') throw denied()
  if (user.role === 'teacher' && !body.roomId) return { user, room: null }
  if (!mongoose.isValidObjectId(body.roomId)) throw denied()
  const room = await Room.findById(body.roomId).lean()
  await participant(user, room)
  const state = await Discussion.findOne({ roomId: room._id }).lean()
  if (state?.closing) throw denied('Room is closing')
  if (user.role === 'student' && (!state?.active || state.session !== body.session ||
    state.speaker?.studentId !== String(user._id) || state.speaker?.grant !== body.grant)) throw denied('Speaking approval required')
  return { user, room, session: state?.active ? state.session : null, grant: user.role === 'student' ? state.speaker.grant : null }
}

export async function reserveOrder(access) {
  if (!access.session) return null
  const filter = { roomId: access.room._id, active: true, closing: { $ne: true }, session: access.session }
  if (access.grant) { filter['speaker.grant'] = access.grant; filter['speaker.studentId'] = String(access.user._id) }
  const state = await Discussion.findOneAndUpdate(filter, { $inc: { nextOrder: 1 } }, { new: true }).lean()
  if (!state) {
    if (access.user.role === 'teacher') { access.session = null; return null }
    throw denied('Speaking approval changed')
  }
  return state.nextOrder
}

export async function publishAudio(access, order, text) {
  // Re-check role, membership, room lifecycle and approval after slow inference.
  const user = await User.findById(access.user._id).lean()
  if (!user || user.role !== access.user.role) throw denied()
  const current = await audioAccess(user, { roomId: access.room?._id, session: access.session, grant: access.grant })
  if (!access.session || !text?.trim()) return null
  if (current.session !== access.session) {
    if (user.role === 'teacher') return null
    throw denied('Discussion changed')
  }
  const entry = { id: randomUUID(), session: access.session, order, speakerId: String(user._id), speakerRole: user.role, speakerName: user.name, text: text.trim(), timestamp: new Date().toISOString() }
  // Transcript persistence and the revocable discussion state live in one MongoDB document.
  // This conditional update is the final authorization gate: revoke/end wins first => no insert;
  // insert wins first => it was authorized immediately before the revocation transition.
  const filter = { roomId: access.room._id, active: true, closing: { $ne: true }, session: access.session }
  if (access.grant) {
    filter['speaker.grant'] = access.grant
    filter['speaker.studentId'] = String(user._id)
  }
  const updated = await Discussion.findOneAndUpdate(filter, { $push: { entries: { $each: [entry], $sort: { order: 1 }, $slice: -500 } } }, { new: true }).lean()
  if (!updated) {
    if (user.role === 'teacher') return null
    throw denied('Speaking approval changed')
  }
  return entry
}
