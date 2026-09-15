import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import UserLifetimeStats from '../models/UserLifetimeStats.js'
import { getUserAchievements, getSectionAchievements, getSectionAchievementLeaderboard, getAchievementProgress, getAchievementOverview } from '../services/achievementEngine.js'

const router = express.Router()
router.use(authenticate, authorize('student'))

router.get('/', async (req, res) => {
  try { res.json(await getUserAchievements(req.user._id)) }
  catch (error) { console.error('Achievement list error:', error); res.status(500).json({ success: false, error: 'Failed to fetch achievements' }) }
})

router.get('/progress', async (req, res) => {
  try {
    const [progress, stats] = await Promise.all([getAchievementProgress(req.user._id), UserLifetimeStats.findOne({ userId: req.user._id }).lean()])
    res.json({ ...progress, stats: stats || { totalAnswers: 0, correctAnswers: 0, totalPoints: 0, maxStreak: 0, accuracy: 0, fastestResponse: null, fastAnswers5: 0, fastAnswers10: 0 } })
  } catch (error) { console.error('Achievement progress error:', error); res.status(500).json({ success: false, error: 'Failed to fetch achievement progress' }) }
})

router.get('/sections', async (req, res) => {
  try { res.json({ sections: await getAchievementOverview(req.user._id) }) }
  catch (error) { console.error('Achievement sections error:', error); res.status(500).json({ success: false, error: 'Failed to fetch sections' }) }
})

router.get('/section/:roomCode', async (req, res) => {
  try { res.json(await getSectionAchievements(req.user._id, req.params.roomCode.toUpperCase())) }
  catch (error) { console.error('Section achievement error:', error); res.status(500).json({ success: false, error: 'Failed to fetch section achievements' }) }
})

router.get('/section/:roomCode/leaderboard', async (req, res) => {
  try { res.json(await getSectionAchievementLeaderboard(req.user._id, req.params.roomCode.toUpperCase())) }
  catch (error) { console.error('Section achievement leaderboard error:', error); res.status(500).json({ success: false, error: 'Failed to fetch section badge leaderboard' }) }
})

// Backwards-compatible endpoint.
router.get('/room/:roomCode', async (req, res) => {
  try { res.json(await getSectionAchievements(req.user._id, req.params.roomCode.toUpperCase())) }
  catch (error) { console.error('Room achievement error:', error); res.status(500).json({ success: false, error: 'Failed to fetch room achievements' }) }
})

router.get('/user/:userId', async (req, res) => {
  if (String(req.user._id) !== String(req.params.userId)) return res.status(403).json({ error: 'Not authorized' })
  res.json(await getUserAchievements(req.params.userId))
})

export default router
