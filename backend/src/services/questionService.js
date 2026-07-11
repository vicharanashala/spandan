import dotenv from 'dotenv'
dotenv.config()
import Question from '../models/Question.js'
import Response from '../models/Response.js'
import Room from '../models/Room.js'
import { AI_PROVIDERS } from '../config.js'
import { callProvider } from './aiProviderService.js'
import { buildPrompt, parseCandidates } from './questionPromptService.js'
import { allocateQuota, computeCandidateCounts } from './pollSchedulerService.js'
import { selectByTypeAndDifficultyQuota } from './questionQualityService.js'

// Re-export for convenience
export { AI_PROVIDERS }

export const createQuestion = async (data, createdBy) => {
  const question = new Question({
    roomId: data.roomId,
    question: data.question,
    options: data.options,
    type: data.type || 'MCQ',
    status: data.status || 'pending',
    segmentIndex: data.segmentIndex || 0,
    timeToAnswer: data.timer || data.timeToAnswer || 30,
    points: data.points ?? undefined,
    createdBy
  })

  await question.save()
  return question
}

export const getQuestionById = async (id) => {
  const question = await Question.findById(id).populate('createdBy', 'name email')
  if (!question) {
    throw new Error('Question not found')
  }
  return question
}

export const getQuestionsByRoom = async (roomId) => {
  return Question.find({ roomId: roomId }).sort({ createdAt: 1 })
}

export const updateQuestion = async (questionId, updates, userId) => {
  const question = await Question.findById(questionId)
  if (!question) {
    throw new Error('Question not found')
  }
  if (question.createdBy.toString() !== userId.toString()) {
    throw new Error('Not authorized to update this question')
  }
  Object.assign(question, updates)
  await question.save()
  return question
}

export const deleteQuestion = async (questionId, userId) => {
  const question = await Question.findById(questionId)
  if (!question) {
    throw new Error('Question not found')
  }
  if (question.createdBy.toString() !== userId.toString()) {
    throw new Error('Not authorized to delete this question')
  }
  await Question.findByIdAndDelete(questionId)
  await Response.deleteMany({ questionId: questionId })
  return true
}

export const setActiveQuestion = async (roomId, questionId) => {
  await Question.updateMany({ roomId: roomId }, { $set: { isActive: false } })
  const question = await Question.findByIdAndUpdate(questionId, { $set: { isActive: true } }, { new: true })
  if (!question) {
    throw new Error('Question not found')
  }
  await Room.findByIdAndUpdate(roomId, { currentQuestion: questionId })
  return question
}

export const submitResponse = async (data, studentId) => {
  const { questionId, selectedOption, selectedOptions, responseTime } = data
  const question = await Question.findById(questionId)
  if (!question) {
    throw new Error('Question not found')
  }

  const options = question.options || []
  let isCorrect = false

  if (Array.isArray(selectedOptions)) {
    // MSQ: correct only if the selected set is exactly the set of isCorrect options
    const correctIndices = options.reduce((acc, o, i) => { if (o.isCorrect) acc.push(i); return acc }, [])
    const selectedSet = new Set(selectedOptions)
    isCorrect = correctIndices.length > 0 &&
      correctIndices.length === selectedSet.size &&
      correctIndices.every((i) => selectedSet.has(i))
  } else if (typeof selectedOption === 'number') {
    // MCQ/TF/FIB: grade off options[].isCorrect, which is what the AI pipeline
    // (and createQuestion) actually populates — correctOptionIndex is never set.
    isCorrect = !!(options[selectedOption] && options[selectedOption].isCorrect)
  }

  const response = new Response({
    questionId: questionId,
    roomId: question.roomId,
    studentId: studentId,
    selectedOption,
    selectedOptions,
    isCorrect,
    responseTime
  })
  await response.save()
  return response
}

export const getResponsesByQuestion = async (questionId) => {
  return Response.find({ questionId: questionId })
    .populate('studentId', 'name email')
    .sort({ createdAt: -1 })
}

export const getResponsesByRoom = async (roomId) => {
  return Response.find({ roomId: roomId })
    .populate('studentId', 'name email')
    .sort({ createdAt: -1 })
}

export const getQuestionResults = async (questionId) => {
  const responses = await Response.find({ questionId: questionId })
  const totalResponses = responses.length

  if (totalResponses === 0) {
    return { totalResponses: 0, results: {}, correctPercentage: 0 }
  }

  const results = {}
  let correctCount = 0

  responses.forEach((response) => {
    const option = response.selectedOption
    results[option] = (results[option] || 0) + 1
    if (response.isCorrect) correctCount++
  })

  return {
    totalResponses,
    results,
    correctPercentage: Math.round((correctCount / totalResponses) * 100)
  }
}

// ---------------------------------------------------------------------------
// Generation pipeline — pure orchestration. Each stage lives in its own
// service; this function just wires them together in order:
//
//   resolve type mix -> allocateQuota -> computeCandidateCounts
//   -> buildPrompt -> callProvider -> parseCandidates -> selectByQuota
//
// No prompt text, quota math, or scoring logic lives here.
// ---------------------------------------------------------------------------

// Presets used only when the caller doesn't send an explicit questionTypeMix
// (e.g. legacy cfg.mode callers). TF listed first in ties so odd totals
// favor TF, matching prior behavior — but this is just config, not a
// hardcoded prompt/count anymore.
const MODE_PRESETS = {
  tf: { TF: 100 },
  mixed: { TF: 50, MCQ: 50 }
}
const DEFAULT_TYPE_MIX = { TF: 75, MCQ: 25 }

function resolveTypeMix(cfg) {
  if (cfg.questionTypeMix) return cfg.questionTypeMix
  if (cfg.mode && MODE_PRESETS[cfg.mode]) return MODE_PRESETS[cfg.mode]
  return DEFAULT_TYPE_MIX
}

// difficultyMix (the 70/30 slider from RoomSettingsModal) takes priority.
// cfg.difficulty (legacy single-value callers) is normalized into the same
// shape so buildPrompt/difficultyScore only ever deal with one format.
const DEFAULT_DIFFICULTY_MIX = { medium: 70, hard: 30 }

function resolveDifficultyMix(cfg) {
  if (cfg.difficultyMix && Object.keys(cfg.difficultyMix).length) return cfg.difficultyMix
  if (cfg.difficulty) return { [cfg.difficulty]: 100 }
  return DEFAULT_DIFFICULTY_MIX
}

export async function generateQuestions(transcript, cfg = {}) {
  if (!transcript || transcript.trim().length === 0) {
    throw new Error('Transcript is required')
  }

  const provider = cfg.provider || 'minimax'
  const difficultyMix = resolveDifficultyMix(cfg)
  const total = Math.max(1, cfg.numQuestions || cfg.questionsPerSegment || 4)
  const typeMix = resolveTypeMix(cfg)

  const quotas = allocateQuota(total, typeMix)
  const candidateCounts = computeCandidateCounts(quotas, { multiplier: cfg.candidateMultiplier || 2 })

  console.log(`Generating questions (quotas: ${JSON.stringify(quotas)}, difficultyMix: ${JSON.stringify(difficultyMix)}) with ${provider}...`)

  const prompt = buildPrompt(transcript, candidateCounts, difficultyMix)
  const responseText = await callProvider(provider, prompt)
  console.log('RAW PROVIDER RESPONSE:', responseText)

  const candidates = parseCandidates(responseText)
  console.log(`Generated ${candidates.length} candidate questions`)

  const topQuestions = selectByTypeAndDifficultyQuota(candidates, quotas, difficultyMix, {
    minConfidence: cfg.minConfidence ?? 40,
    weights: cfg.scoringWeights
  })
  console.log(`Kept top ${topQuestions.length} questions after quota + quality selection`)

  return topQuestions
}