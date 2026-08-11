// One-time backfill: launchedAt was defined but never written by any code path until this fix
// (see index.js question:start / new_question handlers), so every existing question has
// launchedAt = null — which is why student results / peer-discussion queries (which filter on
// launchedAt: { $ne: null }) have been returning empty for every already-created room.
//
// Heuristic: if a question has at least one Response, it was definitely shown to students (you
// can't answer a question you never saw), so it's safe to backfill launchedAt from the earliest
// response's createdAt. Approved questions with ZERO responses are left untouched — we can't tell
// whether those were launched-but-unanswered-by-anyone or never launched at all, and leaving them
// null is the safe default (matches "not yet asked").
//
// Usage: node src/scripts/backfillLaunchedAt.js
import mongoose from 'mongoose'
import dotenv from 'dotenv'
dotenv.config()

import Question from '../models/Question.js'
import Response from '../models/Response.js'
import { initRedis } from '../config/redis.js'
import * as resultsSnapshot from '../services/resultsSnapshot.js'

async function run() {
  await mongoose.connect(process.env.MONGODB_URI)
  try { await initRedis() } catch (e) { console.warn('Redis unavailable, skipping snapshot invalidation:', e.message) }
  console.log('Connected. Scanning for questions missing launchedAt...')

  const candidates = await Question.find({ launchedAt: null }).select('_id roomId createdAt').lean()
  console.log(`Found ${candidates.length} question(s) with launchedAt = null`)

  let updated = 0
  const affectedRooms = new Set()
  for (const q of candidates) {
    const earliest = await Response.findOne({ questionId: q._id }).sort({ createdAt: 1 }).select('createdAt').lean()
    if (!earliest) continue // no responses -> can't confirm it was launched, leave as-is
    await Question.updateOne({ _id: q._id }, { $set: { launchedAt: earliest.createdAt || q.createdAt } })
    updated++
    affectedRooms.add(String(q.roomId))
  }

  console.log(`Backfilled launchedAt on ${updated} question(s) across ${affectedRooms.size} room(s).`)

  for (const roomId of affectedRooms) {
    await resultsSnapshot.invalidate(roomId).catch(() => {})
  }
  console.log('Invalidated any cached results snapshots for affected rooms.')

  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})