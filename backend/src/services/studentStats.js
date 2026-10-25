// "Earned points" on the student dashboard: the share of the points the student COULD have earned on
// the polls they answered. Each poll's maximum is its own question's points (a room may set 1-500,
// and Create Q up to 1000), so the denominator is the sum of those maxima — not answered × 100,
// which showed e.g. 143% once a question was worth more than 100.
//
//   earnedPercent(responses, maxPointsByQuestion) → integer 0-100
//     responses            [{ questionId, points }]
//     maxPointsByQuestion  Map questionId(str) -> that question's points
// A question that no longer exists counts as 100, the same default POST /responses scores with.

export function earnedPercent(responses, maxPointsByQuestion) {
  let earned = 0
  let available = 0
  for (const r of responses) {
    earned += r.points || 0
    available += maxPointsByQuestion.get(String(r.questionId)) || 100
  }
  if (!available) return 0
  return Math.min(100, Math.round((earned / available) * 100))
}
