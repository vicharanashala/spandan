import express from 'express'
import { authenticate } from '../middleware/auth.js'
import User from '../models/User.js'

const router = express.Router()

// Catalog of available avatars
const AVATAR_CATALOG = [
  { id: 'default', name: 'Default', price: 0, rarity: 'Common', icon: '👤' },
  { id: 'scholar', name: 'The Scholar', price: 100, rarity: 'Common', icon: '🎓' },
  { id: 'ninja', name: 'Code Ninja', price: 250, rarity: 'Uncommon', icon: '🥷' },
  { id: 'wizard', name: 'Tech Wizard', price: 500, rarity: 'Rare', icon: '🧙‍♂️' },
  { id: 'astronaut', name: 'Space Explorer', price: 1000, rarity: 'Epic', icon: '👨‍🚀' },
  { id: 'dragon', name: 'Ancient Dragon', price: 2500, rarity: 'Legendary', icon: '🐉' },
  { id: 'crown', name: 'Class Royalty', price: 5000, rarity: 'Mythic', icon: '👑' }
]

// GET /api/store/avatars - Get catalog and user's unlocked avatars
router.get('/avatars', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('personalXp unlockedAvatars activeAvatar')
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Default unlock the default avatar if they don't have it explicitly
    const unlocked = user.unlockedAvatars || []
    if (!unlocked.includes('default')) {
      unlocked.push('default')
    }

    res.json({
      success: true,
      catalog: AVATAR_CATALOG,
      userState: {
        personalXp: user.personalXp || 0,
        unlockedAvatars: unlocked,
        activeAvatar: user.activeAvatar || 'default'
      }
    })
  } catch (error) {
    console.error('Error fetching store catalog:', error)
    res.status(500).json({ error: 'Failed to fetch store catalog' })
  }
})

// POST /api/store/avatars/purchase - Buy an avatar
router.post('/avatars/purchase', authenticate, async (req, res) => {
  try {
    const { avatarId } = req.body
    
    // Find item in catalog
    const item = AVATAR_CATALOG.find(a => a.id === avatarId)
    if (!item) {
      return res.status(400).json({ error: 'Avatar not found in catalog' })
    }

    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const unlocked = user.unlockedAvatars || []
    if (unlocked.includes(avatarId)) {
      return res.status(400).json({ error: 'You already own this avatar' })
    }

    const personalXp = user.personalXp || 0
    if (personalXp < item.price) {
      return res.status(400).json({ error: 'Not enough XP to purchase this avatar' })
    }

    // Process purchase
    user.personalXp -= item.price
    user.unlockedAvatars.push(avatarId)
    await user.save()

    res.json({
      success: true,
      message: `Successfully purchased ${item.name}!`,
      newBalance: user.personalXp,
      unlockedAvatars: user.unlockedAvatars
    })
  } catch (error) {
    console.error('Error purchasing avatar:', error)
    res.status(500).json({ error: 'Failed to complete purchase' })
  }
})

// POST /api/store/avatars/equip - Equip an owned avatar
router.post('/avatars/equip', authenticate, async (req, res) => {
  try {
    const { avatarId } = req.body

    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const unlocked = user.unlockedAvatars || []
    if (avatarId !== 'default' && !unlocked.includes(avatarId)) {
      return res.status(403).json({ error: 'You do not own this avatar' })
    }

    user.activeAvatar = avatarId
    await user.save()

    res.json({
      success: true,
      activeAvatar: user.activeAvatar
    })
  } catch (error) {
    console.error('Error equipping avatar:', error)
    res.status(500).json({ error: 'Failed to equip avatar' })
  }
})

// POST /api/store/xp/finalize - Award session average XP at session end
// Called once by the student when the results page loads.
// Calculates: floor(totalPointsEarned / totalQuestionsInRoom) and adds to personalXp.
// Idempotent: uses a Set of processed roomIds on the user to prevent double-awarding.
router.post('/xp/finalize', authenticate, async (req, res) => {
  try {
    const { roomId } = req.body
    if (!roomId) return res.status(400).json({ error: 'roomId is required' })

    const userId = req.user.userId || req.user.id

    // Check if XP for this session was already finalized to prevent double-awarding
    const user = await User.findById(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    if (user.finalizedRooms && user.finalizedRooms.includes(roomId)) {
      return res.json({ success: true, xpAwarded: 0, newBalance: user.personalXp, alreadyFinalized: true })
    }

    // Dynamically import models to avoid circular deps
    const Response = (await import('../models/Response.js')).default
    const Room = (await import('../models/Room.js')).default

    // Count total questions in the room
    const Question = (await import('../models/Question.js')).default
    const totalQuestions = await Question.countDocuments({ roomId })
    if (totalQuestions === 0) {
      return res.json({ success: true, xpAwarded: 0, newBalance: user.personalXp })
    }

    // Sum all points earned by this student in this room
    const responses = await Response.find({ roomId, studentId: userId, isCorrect: true })
    const totalPointsEarned = responses.reduce((sum, r) => sum + (r.points || 0), 0)

    // Average XP = total points earned / total questions in the session (rounded down)
    const xpAwarded = Math.floor(totalPointsEarned / totalQuestions)

    // Atomically update: add xp and mark this room as finalized
    await User.updateOne(
      { _id: userId },
      {
        $inc: { personalXp: xpAwarded },
        $push: { finalizedRooms: roomId }
      }
    )

    const updatedUser = await User.findById(userId, 'personalXp')
    console.log(`[XP] Finalized session for user ${userId} in room ${roomId}: +${xpAwarded} XP (${totalPointsEarned} pts / ${totalQuestions} questions)`)

    res.json({ success: true, xpAwarded, newBalance: updatedUser.personalXp })
  } catch (error) {
    console.error('Error finalizing session XP:', error)
    res.status(500).json({ error: 'Failed to finalize session XP' })
  }
})

export default router
