import express from 'express'
import { authenticate } from '../middleware/auth.js'
import { authorize } from '../middleware/auth.js'
import { getRoomById } from '../services/roomService.js'
import { uploadRoster, getRoster, markAllInvited } from '../services/rosterService.js'
import { sendRosterInviteEmail } from '../services/emailService.js'
import { config } from '../config.js'

const router = express.Router({ mergeParams: true }) // mergeParams lets us read :roomId from parent

// ── Helper: verify requester owns the room ────────────────────────────────────
async function requireRoomOwner(req, res) {
  const room = await getRoomById(req.params.roomId)
  if (room.teacher._id.toString() !== req.user._id.toString()) {
    res.status(403).json({ error: 'Only the room owner can manage the roster' })
    return null
  }
  return room
}

// ── POST /api/rooms/:roomId/roster/upload ─────────────────────────────────────
// Body: { csvText: "<raw csv string>" }
router.post('/upload', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const room = await requireRoomOwner(req, res)
    if (!room) return

    const { csvText } = req.body
    if (!csvText || typeof csvText !== 'string' || !csvText.trim()) {
      return res.status(400).json({ error: 'csvText is required in the request body' })
    }

    const result = await uploadRoster(room._id, csvText)

    res.status(201).json({
      message: 'Roster uploaded successfully',
      saved: result.saved.length,
      skipped: result.skipped.length,
      entries: result.saved,
      errors: result.skipped
    })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 400
    res.status(status).json({ error: error.message })
  }
})

// ── GET /api/rooms/:roomId/roster ─────────────────────────────────────────────
router.get('/', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const room = await requireRoomOwner(req, res)
    if (!room) return

    const roster = await getRoster(room._id)
    if (!roster) {
      return res.json({ entries: [] })
    }

    res.json({ entries: roster.entries })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// ── POST /api/rooms/:roomId/roster/invite ─────────────────────────────────────
// Sends invite emails to all roster entries and marks them as invited
router.post('/invite', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const room = await requireRoomOwner(req, res)
    if (!room) return

    const roster = await getRoster(room._id)
    if (!roster || roster.entries.length === 0) {
      return res.status(400).json({ error: 'No roster found. Please upload a roster first.' })
    }

    const results = { sent: [], failed: [] }

    // Send emails concurrently with individual error capture
    await Promise.all(
      roster.entries.map(async (entry) => {
        try {
          await sendRosterInviteEmail(
            entry.email,
            entry.name,
            room.name,
            room.code,
            config.frontendUrl
          )
          results.sent.push(entry.email)
        } catch (err) {
          console.error(`Invite email failed for ${entry.email}:`, err.message)
          results.failed.push({ email: entry.email, reason: err.message })
        }
      })
    )

    // Mark all entries as invited (regardless of email failure, per design —
    // failures are reported but we still update state for sent ones)
    if (results.sent.length > 0) {
      await markAllInvited(room._id)
    }

    res.json({
      message: `Invites sent: ${results.sent.length}, failed: ${results.failed.length}`,
      sent: results.sent,
      failed: results.failed
    })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

export default router
