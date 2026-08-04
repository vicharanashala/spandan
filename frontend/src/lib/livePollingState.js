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
  return applyDistributionEvent(state, payload, currentRoomId, question)
}

// Socket events are authoritative for the question identified by their payload. Do not make
// delivery depend on whichever question React has rendered at the instant the event arrives.
// This matters during question transitions, when the active-question state and the socket event
// can be scheduled in either order.
export function applyDistributionEvent(state, payload, currentRoomId, question) {
  const questionId = String(payload?.questionId || '')
  if (!questionId || String(payload?.roomId || '') !== String(currentRoomId || '')) return state
  const totalResponses = Number(payload.totalResponses) || 0
  const incomingOptions = Array.isArray(payload.options) ? payload.options : []
  const incomingCounts = payload.optionCounts && typeof payload.optionCounts === 'object'
    ? payload.optionCounts
    : {}
  const optionIndexes = (question?.options || []).map((_, optionIndex) => optionIndex)
  const indexes = optionIndexes.length > 0
    ? optionIndexes
    : incomingOptions.map(option => Number(option.optionIndex)).filter(Number.isInteger)
  const options = indexes.map(optionIndex => {
    const option = incomingOptions.find(item => Number(item.optionIndex) === optionIndex)
    const countValue = Object.prototype.hasOwnProperty.call(incomingCounts, String(optionIndex))
      ? incomingCounts[String(optionIndex)]
      : option?.count
    const count = Number(countValue) || 0
    return {
      optionIndex,
      count,
      percentage: totalResponses ? Number(((count / totalResponses) * 100).toFixed(2)) : 0
    }
  })
  return {
    ...state,
    [questionId]: {
      totalResponses,
      options
    }
  }
}

export function initializeQuestionDistribution(state, question, activeQuestionId) {
  const questionId = String(question?._id || question?.id || '')
  if (!questionId || String(activeQuestionId || '') === questionId) return state
  return { ...state, [questionId]: emptyDistribution(question) }
}
