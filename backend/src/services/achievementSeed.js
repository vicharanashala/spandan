import Badge from '../models/Badge.js'
import UserAchievement from '../models/UserAchievement.js'
import UserRoomStats from '../models/UserRoomStats.js'
import UserLifetimeStats from '../models/UserLifetimeStats.js'
import Response from '../models/Response.js'

const SECTION_BADGES = [
  { name: 'First Step', description: 'Answer your first poll in a section.', icon: '1️⃣', category: 'milestone', scope: 'section', rule: { type: 'questions_answered', threshold: 1 }, criteria: 'Answer 1 poll in this section' },
  { name: 'Getting Started', description: 'Answer 5 polls in a section.', icon: '🌱', category: 'engagement', scope: 'section', rule: { type: 'questions_answered', threshold: 5 }, criteria: 'Answer 5 polls in this section' },
  { name: 'Knowledge Seeker', description: 'Answer 10 polls correctly in a section.', icon: '🧠', category: 'performance', scope: 'section', rule: { type: 'correct_answers', threshold: 10 }, criteria: 'Get 10 answers correct in this section' },
  { name: 'On Fire', description: 'Build a streak of 5 correct answers in a section.', icon: '🔥', category: 'performance', scope: 'section', rule: { type: 'correct_streak', threshold: 5 }, criteria: 'Reach a 5-answer correct streak' },
  { name: 'Speedster', description: 'Give a correct answer in 5 seconds or less.', icon: '⚡', category: 'speed', scope: 'section', rule: { type: 'fast_response', threshold: 5 }, criteria: 'Answer correctly within 5 seconds' },
  { name: 'Perfect Start', description: 'Get your first 5 answers correct in a section.', icon: '🎯', category: 'milestone', scope: 'section', rule: { type: 'perfect_start', threshold: 5 }, criteria: 'Get 5 out of your first 5 section answers correct' },
  { name: 'Unstoppable', description: 'Build a 10-answer correct streak in a section.', icon: '☄️', category: 'performance', scope: 'section', rule: { type: 'correct_streak', threshold: 10 }, criteria: 'Reach a 10-answer correct streak' },
  { name: 'Quick Thinker', description: 'Answer 5 questions correctly within 10 seconds.', icon: '🚀', category: 'speed', scope: 'section', rule: { type: 'fast_answers_10', threshold: 5 }, criteria: 'Get 5 correct answers within 10 seconds' },
  { name: 'Sharpshooter', description: 'Reach 90% accuracy after at least 20 answers.', icon: '🎯', category: 'performance', scope: 'section', rule: { type: 'section_accuracy', threshold: 90, minAnswers: 20 }, criteria: 'Reach 90%+ accuracy after 20 answers' },
  { name: 'Section Champion', description: 'Finish the section with the highest score.', icon: '🥇', category: 'milestone', scope: 'section', rule: { type: 'section_champion', threshold: 1 }, criteria: 'Finish this section with the highest score' }
]

const LIFETIME_BADGES = [
  { name: 'Lifetime Starter', description: 'Answer 10 questions across Spandan.', icon: '🌱', category: 'engagement', scope: 'lifetime', rule: { type: 'questions_answered', threshold: 10 }, criteria: 'Answer 10 questions lifetime' },
  { name: 'Century Club', description: 'Answer 100 polls across Spandan.', icon: '💯', category: 'milestone', scope: 'lifetime', rule: { type: 'questions_answered', threshold: 100 }, criteria: 'Answer 100 polls lifetime' },
  { name: 'Dedicated Learner', description: 'Answer 500 questions across Spandan.', icon: '🎓', category: 'engagement', scope: 'lifetime', rule: { type: 'questions_answered', threshold: 500 }, criteria: 'Answer 500 questions lifetime' },
  { name: 'Spandan Legend', description: 'Answer 1,000 questions across Spandan.', icon: '🌟', category: 'milestone', scope: 'lifetime', rule: { type: 'questions_answered', threshold: 1000 }, criteria: 'Answer 1,000 questions lifetime' },
  { name: 'Lifetime Knowledge Seeker', description: 'Get 25 correct answers across Spandan.', icon: '🧠', category: 'performance', scope: 'lifetime', rule: { type: 'correct_answers', threshold: 25 }, criteria: 'Get 25 answers correct lifetime' },
  { name: 'Quiz Master', description: 'Get 100 answers correct across Spandan.', icon: '👑', category: 'performance', scope: 'lifetime', rule: { type: 'correct_answers', threshold: 100 }, criteria: 'Get 100 answers correct lifetime' },
  { name: 'Mastermind', description: 'Get 500 answers correct across Spandan.', icon: '💎', category: 'performance', scope: 'lifetime', rule: { type: 'correct_answers', threshold: 500 }, criteria: 'Get 500 answers correct lifetime' },
  { name: 'Grand Master', description: 'Get 1,000 answers correct across Spandan.', icon: '🏆', category: 'performance', scope: 'lifetime', rule: { type: 'correct_answers', threshold: 1000 }, criteria: 'Get 1,000 answers correct lifetime' },
  { name: 'Hot Streak', description: 'Reach a 10-answer correct streak across Spandan.', icon: '🔥', category: 'performance', scope: 'lifetime', rule: { type: 'correct_streak', threshold: 10 }, criteria: 'Reach a 10-answer lifetime correct streak' },
  { name: 'Inferno', description: 'Reach a 25-answer correct streak across Spandan.', icon: '🌋', category: 'performance', scope: 'lifetime', rule: { type: 'correct_streak', threshold: 25 }, criteria: 'Reach a 25-answer lifetime correct streak' },
  { name: 'Unbreakable', description: 'Reach a 50-answer correct streak across Spandan.', icon: '🛡️', category: 'performance', scope: 'lifetime', rule: { type: 'correct_streak', threshold: 50 }, criteria: 'Reach a 50-answer lifetime correct streak' },
  { name: 'Lightning', description: 'Get 25 correct answers within 5 seconds.', icon: '⚡︎', category: 'speed', scope: 'lifetime', rule: { type: 'fast_answers', threshold: 25 }, criteria: 'Get 25 correct answers within 5 seconds' },
  { name: 'Flash Mind', description: 'Get 50 correct answers within 5 seconds.', icon: '⚡', category: 'speed', scope: 'lifetime', rule: { type: 'fast_answers', threshold: 50 }, criteria: 'Get 50 correct answers within 5 seconds' },
  { name: 'Accuracy Ace', description: 'Maintain at least 80% accuracy after 100 answers.', icon: '🏅', category: 'performance', scope: 'lifetime', rule: { type: 'accuracy', threshold: 80, minAnswers: 100 }, criteria: '80%+ accuracy after 100 answers' },
  { name: 'Precision Master', description: 'Maintain at least 90% accuracy after 250 answers.', icon: '🥇', category: 'performance', scope: 'lifetime', rule: { type: 'accuracy', threshold: 90, minAnswers: 250 }, criteria: '90%+ accuracy after 250 answers' },
  { name: 'Perfect Mind', description: 'Maintain at least 95% accuracy after 500 answers.', icon: '🎯', category: 'performance', scope: 'lifetime', rule: { type: 'accuracy', threshold: 95, minAnswers: 500 }, criteria: '95%+ accuracy after 500 answers' }
]

const DEFAULT_BADGES = [...SECTION_BADGES, ...LIFETIME_BADGES]

export async function ensureDefaultBadges() {
  for (const badge of DEFAULT_BADGES) {
    await Badge.updateOne({ name: badge.name, scope: badge.scope }, { $set: badge }, { upsert: true })
  }
}

export async function ensureAchievementIndexes() {
  // Assign scope to badges created by older Spandan versions.
  const oldSectionNames = new Set(['First Step', 'Getting Started', 'Knowledge Seeker', 'On Fire', 'Speedster'])
  const oldLifetimeNames = new Set(['Century Club', 'Accuracy Ace', 'Quiz Master'])
  const oldBadges = await Badge.find({ scope: { $exists: false } }).lean()
  for (const badge of oldBadges) {
    const scope = oldSectionNames.has(badge.name) ? 'section' : 'lifetime'
    await Badge.updateOne({ _id: badge._id }, { $set: { scope } })
  }

  // Normalize existing achievement rows. Old rows did not have scope and were global.
  const legacyRows = await UserAchievement.find({ scope: { $exists: false } }).populate('badgeId').lean()
  for (const row of legacyRows) {
    const scope = oldSectionNames.has(row.badgeId?.name) ? 'section' : 'lifetime'
    await UserAchievement.updateOne({ _id: row._id }, { $set: { scope, roomCode: scope === 'section' ? row.roomCode : null } })
  }

  // Remove duplicate badge definitions by name+scope, keeping the oldest.
  const duplicateBadges = await Badge.aggregate([
    { $sort: { createdAt: 1, _id: 1 } },
    { $group: { _id: { name: '$name', scope: '$scope' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ])
  for (const group of duplicateBadges) {
    const [canonicalId, ...duplicateIds] = group.ids
    for (const duplicateId of duplicateIds) {
      const rows = await UserAchievement.find({ badgeId: duplicateId }).lean()
      for (const row of rows) {
        const exists = await UserAchievement.exists({
          userId: row.userId, badgeId: canonicalId, scope: row.scope, roomCode: row.scope === 'section' ? row.roomCode : null
        })
        if (exists) await UserAchievement.deleteOne({ _id: row._id })
        else await UserAchievement.updateOne({ _id: row._id }, { $set: { badgeId: canonicalId } })
      }
      await Badge.deleteOne({ _id: duplicateId })
    }
  }

  // Remove duplicate achievement rows under the new scope rules.
  const duplicates = await UserAchievement.aggregate([
    { $sort: { earnedAt: 1, _id: 1 } },
    { $group: { _id: { userId: '$userId', badgeId: '$badgeId', scope: '$scope', roomCode: '$roomCode' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ])
  for (const group of duplicates) {
    await UserAchievement.deleteMany({ _id: { $in: group.ids.slice(1) } })
  }

  await Badge.syncIndexes()
  await UserAchievement.syncIndexes()

  // Backfill lifetime counters for users who already have room stats.
  const lifetimeGroups = await UserRoomStats.aggregate([
    { $group: { _id: '$userId', totalAnswers: { $sum: '$totalAnswers' }, correctAnswers: { $sum: '$correctAnswers' }, totalPoints: { $sum: '$totalPoints' }, maxStreak: { $max: '$maxStreak' }, fastestResponse: { $min: '$fastestResponse' } } }
  ])
  for (const g of lifetimeGroups) {
    const fastCounts = await Response.aggregate([
      { $match: { studentId: g._id, isCorrect: true } },
      { $group: { _id: null, fastAnswers5: { $sum: { $cond: [{ $lte: ['$responseTime', 5] }, 1, 0] } }, fastAnswers10: { $sum: { $cond: [{ $lte: ['$responseTime', 10] }, 1, 0] } } } }
    ])
    const f = fastCounts[0] || { fastAnswers5: 0, fastAnswers10: 0 }
    await UserLifetimeStats.updateOne(
      { userId: g._id },
      { $setOnInsert: { userId: g._id }, $set: { totalAnswers: g.totalAnswers, correctAnswers: g.correctAnswers, totalPoints: g.totalPoints, maxStreak: g.maxStreak || 0, fastestResponse: g.fastestResponse ?? null, fastAnswers5: f.fastAnswers5 || 0, fastAnswers10: f.fastAnswers10 || 0, accuracy: g.totalAnswers ? (g.correctAnswers / g.totalAnswers) * 100 : 0 } },
      { upsert: true }
    )
  }
}

export { SECTION_BADGES, LIFETIME_BADGES }
