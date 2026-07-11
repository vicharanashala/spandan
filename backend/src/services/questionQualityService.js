// questionQualityService.js
// Scoring engine. Every component (confidence, difficulty, diversity,
// clarity) is independently exported and reusable; compositeScore combines
// them, selectByQuota drives the final pick.
//
//   score = 0.35 * confidence
//         + 0.35 * difficulty match
//         + 0.20 * diversity
//         + 0.10 * clarity

const DEFAULT_WEIGHTS = { confidence: 0.35, difficulty: 0.35, diversity: 0.20, clarity: 0.10 }
const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 }

import { allocateQuota } from './pollSchedulerService.js'

// --- text normalization pipeline: normalize -> stopwords -> stem -> bigrams ---

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'what', 'which', 'who', 'whom',
  'this', 'that', 'these', 'those', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
  'by', 'and', 'or', 'but', 'if', 'then', 'so', 'do', 'does', 'did', 'has',
  'have', 'had', 'be', 'been', 'being', 'it', 'its', 'as', 'from', 'you', 'your'
])

function normalizeText(text = '') {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

// Lightweight suffix-stripping stemmer (no external deps). Not linguistically
// perfect, but enough to collapse "learning"/"learns"/"learned" together so
// concept overlap isn't fooled by inflection.
function stem(word) {
  if (word.length <= 4) return word
  return word
    .replace(/(ational|ization|fulness|ousness|iveness)$/, '')
    .replace(/(ation|tion|sion|ment|ness|ally|ing|ed|es)$/, '')
    .replace(/s$/, '')
}

function tokenize(text) {
  return normalizeText(text)
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
    .map(stem)
}

function bigrams(tokens) {
  const grams = []
  for (let i = 0; i < tokens.length - 1; i++) grams.push(`${tokens[i]}_${tokens[i + 1]}`)
  return grams
}

function jaccardSet(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const x of setA) if (setB.has(x)) intersection++
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

// Concept-level similarity: unigram Jaccard catches shared vocabulary,
// bigram Jaccard catches shared phrases/concepts even when word order or
// sentence structure differs (e.g. "What is supervised learning?" vs
// "Supervised learning requires what type of labels?" share the bigram
// "supervised_learn"). We take the max so either signal can flag a dupe.
function conceptSimilarity(textA, textB) {
  const tokensA = tokenize(textA)
  const tokensB = tokenize(textB)
  const unigramSim = jaccardSet(new Set(tokensA), new Set(tokensB))
  const bigramSim = jaccardSet(new Set(bigrams(tokensA)), new Set(bigrams(tokensB)))
  return Math.max(unigramSim, bigramSim)
}

// --- reusable scoring components (each returns 0-1) ---

function confidenceScore(q) {
  return (typeof q.confidence === 'number' ? q.confidence : 50) / 100
}

// Distance-based: exact difficulty match = 1, one level off = 0.5, two off = 0.
// This is what makes the teacher's requested difficulty actually influence
// final selection instead of only shaping the prompt.
//
// targetDifficulty accepts either a single string ('medium') or a mix object
// ({ medium: 70, hard: 30 }, i.e. the same shape as the slider's difficultyMix).
// For a mix, a candidate scores against whichever allowed level it matches
// best — any level present with weight > 0 is an equally valid target, so a
// batch that's supposed to be 70/30 medium/hard doesn't get hard questions
// penalized just because medium happens to have the bigger share.
function difficultyScore(q, targetDifficulty = 'medium') {
  const mix = typeof targetDifficulty === 'string'
    ? { [targetDifficulty]: 100 }
    : (targetDifficulty && Object.keys(targetDifficulty).length ? targetDifficulty : { medium: 100 })

  const c = DIFFICULTY_ORDER[q.difficulty] ?? 1
  let best = 0
  for (const [level, weight] of Object.entries(mix)) {
    if (weight <= 0) continue
    const t = DIFFICULTY_ORDER[level] ?? 1
    const distance = Math.abs(c - t)
    const match = distance === 0 ? 1 : distance === 1 ? 0.5 : 0
    if (match > best) best = match
  }
  return best
}

// Diversity relative to what's already been selected in this batch. Empty
// selection => max diversity (nothing to conflict with yet).
function diversityScore(candidate, selected = []) {
  if (selected.length === 0) return 1
  const maxSim = Math.max(...selected.map((s) => conceptSimilarity(candidate.question, s.question)))
  return 1 - maxSim
}

// Ideal question length ~8-25 words; score tapers off outside that range.
function clarityScore(q) {
  const wordCount = (q.question || '').trim().split(/\s+/).filter(Boolean).length
  if (wordCount >= 8 && wordCount <= 25) return 1
  if (wordCount < 8) return Math.max(0, wordCount / 8)
  return Math.max(0, 1 - (wordCount - 25) / 25)
}

function compositeScore(q, { targetDifficulty = 'medium', selected = [], weights = DEFAULT_WEIGHTS } = {}) {
  return (
    weights.confidence * confidenceScore(q) +
    weights.difficulty * difficultyScore(q, targetDifficulty) +
    weights.diversity * diversityScore(q, selected) +
    weights.clarity * clarityScore(q)
  )
}

function removeWeak(questions = [], minConfidence = 40) {
  return questions.filter((q) => (q.confidence ?? 0) >= minConfidence)
}

// Greedy selection: repeatedly pick the remaining candidate with the best
// composite score (diversity recomputed against what's picked so far, i.e.
// MMR-style), until quota is filled or the pool runs out.
function selectTopByDiversity(candidates, quota, { targetDifficulty = 'medium', weights = DEFAULT_WEIGHTS, minConfidence = 40, seed = [] } = {}) {
  const pool = removeWeak(candidates, minConfidence)
  const selected = [...seed]
  const picked = []

  while (picked.length < quota && pool.length > 0) {
    let bestIdx = 0
    let bestScore = -Infinity

    for (let i = 0; i < pool.length; i++) {
      const s = compositeScore(pool[i], { targetDifficulty, selected, weights })
      if (s > bestScore) {
        bestScore = s
        bestIdx = i
      }
    }

    const [item] = pool.splice(bestIdx, 1)
    item.score = Math.round(bestScore * 100)
    selected.push(item)
    picked.push(item)
  }

  return picked
}

// Runs selectTopByDiversity per type bucket according to quotas, e.g.
// { TF: 3, MCQ: 1 } -> exactly 3 TF + 1 MCQ, each internally diversity/score
// ranked — never "top N overall" where one type could crowd out another.
function selectByQuota(candidates, quotas, { targetDifficulty = 'medium', weights = DEFAULT_WEIGHTS, minConfidence = 40 } = {}) {
  const results = []
  for (const type of Object.keys(quotas)) {
    if (quotas[type] <= 0) continue
    const bucket = candidates.filter((q) => q.type === type)
    results.push(...selectTopByDiversity(bucket, quotas[type], { targetDifficulty, weights, minConfidence }))
  }
  return results
}

// Enforces the actual requested difficulty split per type, rather than treating
// difficulty as a soft scoring preference (which never guaranteed real counts —
// e.g. asking for 30% hard could silently yield 20% hard if the pool skewed medium).
// For each type's quota, sub-allocate by difficultyMix (e.g. quota 5 @ 70/30 ->
// { medium: 4, hard: 1 }), fill each difficulty bucket from matching candidates
// first, then backfill any shortfall (AI under-produced a level) from what's left.
function selectByTypeAndDifficultyQuota(candidates, typeQuotas, difficultyMix, { weights = DEFAULT_WEIGHTS, minConfidence = 40 } = {}) {
  const results = []
  for (const type of Object.keys(typeQuotas)) {
    const typeQuota = typeQuotas[type]
    if (typeQuota <= 0) continue

    const typeBucket = candidates.filter((q) => q.type === type)
    const diffQuotas = allocateQuota(typeQuota, difficultyMix)
    const pickedForType = []
    let remainingPool = [...typeBucket]

    for (const level of Object.keys(diffQuotas)) {
      const levelQuota = diffQuotas[level]
      if (levelQuota <= 0) continue
      const levelBucket = remainingPool.filter((q) => q.difficulty === level)
      const picked = selectTopByDiversity(levelBucket, levelQuota, {
        targetDifficulty: level, weights, minConfidence, seed: pickedForType
      })
      const pickedIds = new Set(picked.map((p) => p.id))
      remainingPool = remainingPool.filter((q) => !pickedIds.has(q.id))
      pickedForType.push(...picked)
    }

    // Backfill shortfall from whatever's left so the type quota is still filled
    if (pickedForType.length < typeQuota) {
      const shortfall = typeQuota - pickedForType.length
      const backfill = selectTopByDiversity(remainingPool, shortfall, {
        targetDifficulty: difficultyMix, weights, minConfidence, seed: pickedForType
      })
      pickedForType.push(...backfill)
    }

    results.push(...pickedForType)
  }
  return results
}

export {
  DEFAULT_WEIGHTS,
  confidenceScore,
  difficultyScore,
  diversityScore,
  clarityScore,
  conceptSimilarity,
  compositeScore,
  removeWeak,
  selectTopByDiversity,
  selectByQuota,
  selectByTypeAndDifficultyQuota
}