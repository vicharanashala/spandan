import { lastSegmentInData, segmentToStart } from '../lib/segments'

// A reload of the teacher page must continue the segment numbering from the room's saved data,
// never restart at 1 (which merged two different segments into one row in the results).

describe('lastSegmentInData', () => {
  test('an empty room has no segments yet', () => {
    expect(lastSegmentInData([], [])).toBe(0)
    expect(lastSegmentInData()).toBe(0)
  })

  test('takes the highest segment across questions and transcripts', () => {
    const questions = [{ segmentIndex: 1 }, { segmentIndex: 3 }, { segmentIndex: 2 }]
    const transcripts = [{ segmentIndex: 1, source: 'audio' }, { segmentIndex: 2, source: 'audio' }]
    expect(lastSegmentInData(questions, transcripts)).toBe(3)
  })

  test('a segment whose questions were all rejected still counts through its transcript', () => {
    const questions = [{ segmentIndex: 1 }, { segmentIndex: 2 }]
    const transcripts = [{ segmentIndex: 1, source: 'audio' }, { segmentIndex: 2, source: 'audio' }, { segmentIndex: 3, source: 'audio' }]
    expect(lastSegmentInData(questions, transcripts)).toBe(3)
  })

  test('questions count even when their transcript save failed', () => {
    expect(lastSegmentInData([{ segmentIndex: 4 }], [{ segmentIndex: 3, source: 'audio' }])).toBe(4)
  })

  test('ignores pasted text, manual questions and malformed values', () => {
    const questions = [{ segmentIndex: 0 }, { segmentIndex: null }, {}, null, { segmentIndex: '7' }, { segmentIndex: 1.5 }]
    const transcripts = [{ segmentIndex: -1, source: 'paste' }, { segmentIndex: 9, source: 'paste' }]
    expect(lastSegmentInData(questions, transcripts)).toBe(0)
  })

  test('transcripts saved before the source field existed count as audio', () => {
    expect(lastSegmentInData([], [{ segmentIndex: 2 }])).toBe(2)
  })
})

describe('segmentToStart', () => {
  test('a fresh room starts at segment 1', () => {
    expect(segmentToStart({ prev: 0, lastUsed: 0, fresh: true })).toBe(1)
  })

  test('after a reload following segment 4, recording starts at segment 5', () => {
    // the reloaded page has prev = 0; the room's data says segment 4 is the last one
    expect(segmentToStart({ prev: 0, lastUsed: 4, fresh: true })).toBe(5)
  })

  test('a reload in the middle of a segment redoes that segment under the same number', () => {
    // segment 5 was running but nothing was saved for it yet
    expect(segmentToStart({ prev: 0, lastUsed: 4, fresh: true })).toBe(5)
  })

  test('stopping and starting again in the same page continues instead of resetting', () => {
    expect(segmentToStart({ prev: 3, lastUsed: 3, fresh: true })).toBe(4)
  })

  test('moving on after a reviewed segment goes to the next number', () => {
    expect(segmentToStart({ prev: 2, lastUsed: 2, fresh: false })).toBe(3)
  })

  test('a too-short segment (nothing saved) moves on by exactly one, never skipping', () => {
    expect(segmentToStart({ prev: 2, lastUsed: 1, fresh: false })).toBe(3)
  })

  test('moving on never goes backwards below saved data', () => {
    expect(segmentToStart({ prev: 1, lastUsed: 4, fresh: false })).toBe(5)
  })
})
