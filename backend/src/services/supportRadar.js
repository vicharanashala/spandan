function responseTime(value) {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function tierFor(streak) {
  if (streak >= 4) return 'Needs Help'
  if (streak === 3) return 'At Risk'
  return streak === 2 ? 'Watch' : null
}

export function computeSupportRadar(responses) {
  const ordered = [...responses].sort((a, b) => {
    return responseTime(a.createdAt) - responseTime(b.createdAt)
      || String(a._id).localeCompare(String(b._id))
  })
  const streaks = new Map()

  for (const response of ordered) {
    const studentId = String(response.studentId)
    if (response.isCorrect) streaks.set(studentId, 0)
    else streaks.set(studentId, (streaks.get(studentId) || 0) + 1)
  }

  return [...streaks.entries()]
    .map(([studentId, streak]) => ({ studentId, tier: tierFor(streak) }))
    .filter(({ tier }) => tier)
    .sort((a, b) => a.studentId.localeCompare(b.studentId))
}
