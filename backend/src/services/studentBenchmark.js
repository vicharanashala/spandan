export function normalizeRoomBenchmarkData(studentId, roomIds, responses) {
  const normalizedRoomIds = Array.isArray(roomIds)
    ? roomIds.map(roomId => String(roomId))
    : []

  const validResponses = Array.isArray(responses)
    ? responses.filter((response) => response && response.roomId && response.studentId)
    : []

  const studentResponses = validResponses.filter((response) => String(response.studentId) === String(studentId))
  const studentCorrect = studentResponses.filter((response) => response.isCorrect === true).length
  const studentTotal = studentResponses.length
  const studentAccuracy = studentTotal > 0 ? (studentCorrect / studentTotal) * 100 : 0
  const cohortResponses = validResponses.filter((response) => String(response.studentId) !== String(studentId))

  const roomAverages = normalizedRoomIds.map((roomId) => {
    const roomResponses = cohortResponses.filter((response) => String(response.roomId) === roomId)

    if (roomResponses.length === 0) return 0

    const roomCorrect = roomResponses.filter((response) => response.isCorrect === true).length
    return (roomCorrect / roomResponses.length) * 100
  })

  const cohortAverage = roomAverages.length > 0
    ? roomAverages.reduce((sum, current) => sum + current, 0) / roomAverages.length
    : 0

  return {
    studentAccuracy,
    cohortAverage
  }
}

export function summarizeBenchmark(studentAccuracy, cohortAverage) {
  const safeStudentAccuracy = Number.isFinite(studentAccuracy) ? studentAccuracy : 0
  const safeCohortAverage = Number.isFinite(cohortAverage) ? cohortAverage : 0
  const delta = safeStudentAccuracy - safeCohortAverage

  let status = 'On par with cohort'
  if (delta > 0) {
    status = 'Above cohort average'
  } else if (delta < 0) {
    status = 'Below cohort average'
  }

  return {
    studentAccuracy: Math.round(safeStudentAccuracy),
    cohortAverage: Math.round(safeCohortAverage),
    delta: Math.round(delta),
    status
  }
}
