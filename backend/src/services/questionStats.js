// Per-question stats for GET /responses/stats/room (direct path and the results snapshot), the
// teacher responses CSV and the research export. ONE implementation so the two paths can't drift.
//
//   correctCount  responses graded correct (Response.isCorrect — set at submit; for MSQ it means the
//                 exact correct set). NOT "first pick is a correct option", which over-counted MSQ.
//   answerCounts  option index -> how many responses ticked it, counting EVERY ticked option
//                 (selectedOptions; older records only have selectedOption). For MSQ the counts can
//                 add up to more than totalResponses.

// The options a response ticked: selectedOptions when present, else the single selectedOption.
export const picksOf = (r) =>
  Array.isArray(r.selectedOptions) && r.selectedOptions.length ? r.selectedOptions : [r.selectedOption]

// Same picks rule inside a Mongo aggregation ($setUnion also drops duplicate indices).
export const PICKS_EXPR = {
  $setUnion: [{
    $cond: [
      { $gt: [{ $size: { $ifNull: ['$selectedOptions', []] } }, 0] },
      '$selectedOptions',
      ['$selectedOption']
    ]
  }, []]
}

// Accumulate one response into per-question tallies: tallies = Map(qid -> { total, correct, opts: Map(idx -> n) }).
export function tallyResponse(tallies, qid, r) {
  let t = tallies.get(qid)
  if (!t) { t = { total: 0, correct: 0, opts: new Map() }; tallies.set(qid, t) }
  t.total += 1
  if (r.isCorrect) t.correct += 1
  for (const p of new Set(picksOf(r))) if (Number.isInteger(p)) t.opts.set(p, (t.opts.get(p) || 0) + 1)
}

// questions + tallies -> questionStats[] (shape unchanged). questionId is passed through as given.
export function buildQuestionStats(questions, tallies, idOf = (q) => q._id) {
  return questions.map((q) => {
    const t = tallies.get(String(q._id)) || { total: 0, correct: 0, opts: new Map() }
    const answerCounts = {}
    q.options.forEach((opt, idx) => { answerCounts[idx] = t.opts.get(idx) || 0 })
    return {
      questionId: idOf(q),
      question: q.question,
      type: q.type,
      totalResponses: t.total,
      correctCount: t.correct,
      answerCounts
    }
  })
}
