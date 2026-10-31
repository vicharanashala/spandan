// Server-side anonymisation of the ranked leaderboard. This is the SINGLE place the anonymity rule
// lives, so the REST board (responses.js) and the live socket board (index.js) can never diverge.
//
// Anonymisation happens on the SERVER before the payload leaves it — names are never sent-then-hidden
// in the browser (a student could read them off the network tab otherwise).
//
// Rule (only when `anonymous` is true). Let T = total participants and k = round(pct/100 * T):
//   - viewer 'teacher': the BOTTOM k ranks (the lowest scorers, i.e. rank > T - k) keep their REAL
//     name so the teacher can see who is struggling; everyone above is 'Anonymous #<rank>'. The real
//     studentId is retained (the teacher is authorized to the data; it is simply not displayed).
//   - viewer 'student': EVERY row is 'Anonymous #<rank>', and studentId is replaced with a
//     non-identifying 'anon-<rank>' so the client cannot match a row to the current user (no "(You)"
//     highlight and no way to locate oneself).
//
// Returns a NEW array with NEW row objects — the input board is never mutated, because callers pass
// the SHARED cached leaderboard array (mutating it would corrupt every other reader).
export function anonymizeBoard(board, { anonymous = false, pct = 0, total = 0, viewer = 'student' } = {}) {
  if (!anonymous || !Array.isArray(board)) return board

  const p = Math.min(100, Math.max(0, Number(pct) || 0))
  const T = Number(total) || board.length
  const k = Math.round((p / 100) * T)   // how many bottom rows the teacher may see in the clear
  const revealAboveRank = T - k         // ranks strictly greater than this are revealed (teacher only)

  return board.map((e) => {
    const revealToTeacher = viewer === 'teacher' && e.rank > revealAboveRank
    if (revealToTeacher) return { ...e } // bottom slice: keep real identity for the teacher

    const masked = { ...e, studentName: `Anonymous #${e.rank}` }
    // For students, also strip the real id so the row can't be tied back to a person.
    if (viewer !== 'teacher') masked.studentId = `anon-${e.rank}`
    return masked
  })
}

// Build the exact board a STUDENT should receive in anonymous mode — the single source of truth shared
// by the REST read (responses.js) and the live socket push (index.js), so they can never diverge.
//
// Rows shown = the top `topN` PLUS, when `revealBottom` is on, the bottom k = round(pct/100 * T) ranks.
// Revealed bottom rows keep their REAL name and id (the teacher chose to expose them); every other
// shown row is masked to 'Anonymous #<rank>' with an 'anon-<rank>' id so it can't be tied to a person.
// The union filter naturally handles a tiny class (T <= topN): the whole board is shown and only the
// bottom slice is revealed. Returns NEW objects — the shared cached `full` board is never mutated.
export function buildStudentBoard(full, { pct = 0, total = 0, topN = 10, revealBottom = false } = {}) {
  if (!Array.isArray(full)) return full
  const T = Number(total) || full.length
  const p = Math.min(100, Math.max(0, Number(pct) || 0))
  const k = revealBottom ? Math.round((p / 100) * T) : 0
  const revealAboveRank = T - k // ranks strictly greater than this are revealed to students

  return full
    .filter(e => e.rank <= topN || (revealBottom && e.rank > revealAboveRank))
    .map(e => {
      if (revealBottom && e.rank > revealAboveRank) return { ...e } // real name + id
      return { ...e, studentName: `Anonymous #${e.rank}`, studentId: `anon-${e.rank}` }
    })
}
