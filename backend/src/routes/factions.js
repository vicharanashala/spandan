import express from 'express'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()

// Get Global Faction Leaderboard
router.get('/leaderboard', authenticate, async (req, res) => {
  try {
    const User = (await import('../models/User.js')).default
    
    const factions = ['Pioneers', 'Innovators', 'Visionaries']
    const factionScores = { Pioneers: 0, Innovators: 0, Visionaries: 0 }
    const factionCounts = { Pioneers: 0, Innovators: 0, Visionaries: 0 }

    // Aggregate total XP per faction
    const users = await User.find({ role: 'student' })
    users.forEach(u => {
      const f = u.faction || 'Pioneers'
      if (factionScores[f] !== undefined) {
        factionScores[f] += (u.xp || 0)
        factionCounts[f] += 1
      }
    })

    const leaderboard = factions.map(name => ({
      name,
      score: factionScores[name],
      members: factionCounts[name]
    })).sort((a, b) => b.score - a.score)

    res.json({ leaderboard })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
