export function emptyDistribution(question) {
  return {
    totalResponses: 0,
    options: (question?.options || []).map((_, optionIndex) => ({
      optionIndex,
      count: 0,
      percentage: 0
    }))
  }
}

export function shouldApplyDistributionUpdate(payload, currentRoomId, activeQuestionId) {
  return String(payload?.roomId || '') === String(currentRoomId || '') &&
    String(payload?.questionId || '') === String(activeQuestionId || '')
}

export function applyDistributionUpdate(state, payload, currentRoomId, activeQuestionId, question) {
  if (!shouldApplyDistributionUpdate(payload, currentRoomId, activeQuestionId)) return state
  const options = Array.isArray(payload.options)
    ? payload.options
    : (question?.options || []).map((_, optionIndex) => {
        const count = Number(payload.optionCounts?.[String(optionIndex)] || 0)
        const total = Number(payload.totalResponses) || 0
        return { optionIndex, count, percentage: total ? Number(((count / total) * 100).toFixed(2)) : 0 }
      })
  return {
    ...state,
    [String(payload.questionId)]: {
      totalResponses: Number(payload.totalResponses) || 0,
      options
    }
  }
}

export function initializeQuestionDistribution(state, question, activeQuestionId) {
  const questionId = String(question?._id || question?.id || '')
  if (!questionId || String(activeQuestionId || '') === questionId) return state
  return { ...state, [questionId]: emptyDistribution(question) }
}
