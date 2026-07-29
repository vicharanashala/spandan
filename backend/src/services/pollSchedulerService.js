// pollSchedulerService.js
// Pure decision-logic helpers. No DB/socket calls here — callers pass in
// values they already have and act on what's returned.

const DEFAULT_MIN_TRANSCRIPT_CHARS = 50
const DEFAULT_MIN_INTERVAL_MS = 15 * 1000 // don't allow back-to-back generation calls within 15s

function shouldGenerate({
  newTranscriptLength = 0,
  lastGenerationTimestamp = null,
  isAlreadyGenerating = false,
  minTranscriptChars = DEFAULT_MIN_TRANSCRIPT_CHARS,
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS
} = {}) {
  if (isAlreadyGenerating) return false
  if (newTranscriptLength < minTranscriptChars) return false
  if (lastGenerationTimestamp) {
    const elapsed = Date.now() - lastGenerationTimestamp
    if (elapsed < minIntervalMs) return false
  }
  return true
}

function shouldLaunch({ queueLength = 0, topConfidence = 0, minConfidence = 40 } = {}) {
  if (queueLength === 0) return false
  return topConfidence >= minConfidence
}

// ---------------------------------------------------------------------------
// Quota allocation — generalized to any set of question types, so it isn't
// locked to TF/MCQ. Works for any typeMix object, e.g.:
//   allocateQuota(4, { TF: 50, MCQ: 50 })      -> { TF: 2, MCQ: 2 }
//   allocateQuota(5, { TF: 50, MCQ: 50 })      -> { TF: 3, MCQ: 2 }
//   allocateQuota(8, { TF: 50, MCQ: 50 })      -> { TF: 4, MCQ: 4 }
//   allocateQuota(6, { MCQ: 40, TF: 40, MSQ: 20 })
// Uses the largest-remainder method so quotas always sum to exactly `total`.
// On ties, the type listed earlier in typeMix wins the extra unit — pass TF
// before MCQ in the mix if you want odd totals to favor TF, etc.
// ---------------------------------------------------------------------------
function allocateQuota(total, typeMix = {}) {
  const types = Object.keys(typeMix).filter((t) => typeMix[t] > 0)
  if (types.length === 0 || total <= 0) return {}

  const mixTotal = types.reduce((sum, t) => sum + typeMix[t], 0)
  const raw = types.map((t) => (typeMix[t] / mixTotal) * total)
  const floors = raw.map(Math.floor)
  let remainder = total - floors.reduce((a, b) => a + b, 0)

  const fractionOrder = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)

  const quotas = {}
  types.forEach((t, i) => { quotas[t] = floors[i] })

  for (let k = 0; k < fractionOrder.length && remainder > 0; k++, remainder--) {
    quotas[types[fractionOrder[k].i]]++
  }

  return quotas
}

// How many candidates to request from the AI per type, so the scoring
// engine has real options to pick from instead of just the exact quota.
// candidateCount = quota * multiplier, bounded to [minPerType, capPerType].
function computeCandidateCounts(quotas, { multiplier = 2, minPerType = 3, capPerType = 20 } = {}) {
  const counts = {}
  for (const type of Object.keys(quotas)) {
    counts[type] = quotas[type] > 0
      ? Math.min(capPerType, Math.max(minPerType, quotas[type] * multiplier))
      : 0
  }
  return counts
}

export { shouldGenerate, shouldLaunch, allocateQuota, computeCandidateCounts }