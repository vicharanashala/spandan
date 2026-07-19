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

export default router
