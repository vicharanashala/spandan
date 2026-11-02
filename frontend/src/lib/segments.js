// Segment numbering for a live room. The counter lives in the teacher's page, so a reload would
// otherwise restart it at 1 and stamp a second "segment 1" onto questions and transcripts, which the
// results then merge into one row. The room's saved data is the source of truth instead.

// Highest live segment the room already has data for: approved questions and audio transcripts.
// Questions matter because a transcript save can fail; transcripts matter because only approved
// questions are stored, so a segment whose questions were all rejected leaves only its transcript.
// Pasted text (-1) and manual questions (0) are not live segments and are ignored.
export function lastSegmentInData(questions = [], transcripts = []) {
  let last = 0
  const consider = (n) => {
    if (Number.isInteger(n) && n > last) last = n
  }
  for (const q of questions) consider(q?.segmentIndex)
  for (const t of transcripts) {
    if (t?.source !== 'paste') consider(t?.segmentIndex)
  }
  return last
}

// Segment number to use when capture (re)starts.
// fresh = a new start (Start Recording, a new video session): continue after the last segment with data,
//   so a segment interrupted before anything was saved is simply done again under the same number.
// otherwise = moving on after a segment (review finished, or the transcript was too short).
export function segmentToStart({ prev = 0, lastUsed = 0, fresh }) {
  return fresh ? lastUsed + 1 : Math.max(prev, lastUsed) + 1
}
