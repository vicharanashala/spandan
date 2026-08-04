import {
  applyDistributionUpdate,
  emptyDistribution,
  initializeQuestionDistribution,
  shouldApplyDistributionUpdate
} from '../lib/livePollingState.js'

const q1 = { _id: 'q1', options: [{}, {}, {}] }
const q2 = { _id: 'q2', options: [{}, {}] }
const update = (roomId, questionId, totalResponses, optionCounts) => ({
  roomId, questionId, totalResponses,
  optionCounts: Object.fromEntries(Object.entries(optionCounts).map(([i, count]) => [i, count])),
  options: Object.entries(optionCounts).map(([optionIndex, count]) => ({
    optionIndex: Number(optionIndex),
    count,
    percentage: totalResponses ? Number(((count / totalResponses) * 100).toFixed(2)) : 0
  }))
})

describe('live polling state', () => {
  it('shows Q1 answer distribution without refresh', () => {
    const state = applyDistributionUpdate({}, update('room-a', 'q1', 1, { 0: 1, 1: 0, 2: 0 }), 'room-a', 'q1', q1)
    expect(state.q1.totalResponses).toBe(1)
    expect(state.q1.options[0]).toMatchObject({ count: 1, percentage: 100 })
  })

  it('initializes Q2 at zero instead of reusing Q1', () => {
    const state = initializeQuestionDistribution({ q1: { totalResponses: 1 } }, q2, 'q1')
    expect(state.q2).toEqual(emptyDistribution(q2))
    expect(state.q1.totalResponses).toBe(1)
  })

  it('updates only Q2 after a Q2 answer', () => {
    const before = { q1: { totalResponses: 1 }, q2: emptyDistribution(q2) }
    const after = applyDistributionUpdate(before, update('room-a', 'q2', 1, { 0: 0, 1: 1 }), 'room-a', 'q2', q2)
    expect(after.q1.totalResponses).toBe(1)
    expect(after.q2.options[1].count).toBe(1)
  })

  it('ignores a delayed Q1 event while Q2 is active', () => {
    expect(shouldApplyDistributionUpdate(update('room-a', 'q1', 1, { 0: 1 }), 'room-a', 'q2')).toBe(false)
    const state = applyDistributionUpdate({ q2: emptyDistribution(q2) }, update('room-a', 'q1', 1, { 0: 1 }), 'room-a', 'q2', q1)
    expect(state.q2.totalResponses).toBe(0)
    expect(state.q1).toBeUndefined()
  })

  it('restores the current Q2 aggregate by room and question identity', () => {
    const state = applyDistributionUpdate({}, update('room-a', 'q2', 1, { 0: 0, 1: 1 }), 'room-a', 'q2', q2)
    expect(state.q2.options[1].count).toBe(1)
  })

  it('accepts reconnect replay for Q2 and rejects stale Q1 replay', () => {
    expect(shouldApplyDistributionUpdate(update('room-a', 'q2', 0, { 0: 0, 1: 0 }), 'room-a', 'q2')).toBe(true)
    expect(shouldApplyDistributionUpdate(update('room-a', 'q1', 1, { 0: 1 }), 'room-a', 'q2')).toBe(false)
  })

  it('isolates teacher refresh state to the current Q2', () => {
    const state = applyDistributionUpdate({ q1: { totalResponses: 1 } }, update('room-a', 'q2', 0, { 0: 0, 1: 0 }), 'room-a', 'q2', q2)
    expect(state.q2.totalResponses).toBe(0)
    expect(state.q1.totalResponses).toBe(1)
  })

  it('isolates two rooms', () => {
    expect(shouldApplyDistributionUpdate(update('room-a', 'q1', 1, { 0: 1 }), 'room-b', 'q1')).toBe(false)
  })

  it('retains correct simultaneous aggregate totals', () => {
    const state = applyDistributionUpdate({}, update('room-a', 'q1', 3, { 0: 2, 1: 1, 2: 0 }), 'room-a', 'q1', q1)
    expect(state.q1.totalResponses).toBe(3)
    expect(state.q1.options.map(o => o.count)).toEqual([2, 1, 0])
  })

  it('does not provide a client path for duplicate aggregate application', () => {
    const first = applyDistributionUpdate({}, update('room-a', 'q1', 1, { 0: 1 }), 'room-a', 'q1', q1)
    const duplicate = applyDistributionUpdate(first, update('room-a', 'q1', 1, { 0: 1 }), 'room-a', 'q1', q1)
    expect(duplicate.q1.totalResponses).toBe(1)
  })

  it('recalculates every option percentage from each live event', () => {
    const first = applyDistributionUpdate({}, update('room-a', 'q1', 1, { 0: 1, 1: 0, 2: 0 }), 'room-a', 'q1', q1)
    const second = applyDistributionUpdate(first, {
      roomId: 'room-a',
      questionId: 'q1',
      totalResponses: 2,
      optionCounts: { 0: 1, 1: 1, 2: 0 },
      // Deliberately stale percentages: the live state must derive them from counts.
      options: [
        { optionIndex: 0, count: 1, percentage: 100 },
        { optionIndex: 1, count: 1, percentage: 0 },
        { optionIndex: 2, count: 0, percentage: 0 }
      ]
    }, 'room-a', 'q1', q1)

    expect(second.q1.options).toEqual([
      { optionIndex: 0, count: 1, percentage: 50 },
      { optionIndex: 1, count: 1, percentage: 50 },
      { optionIndex: 2, count: 0, percentage: 0 }
    ])
    expect(second.q1.options).not.toBe(first.q1.options)
  })

  it('keeps live distributions independent across multiple questions', () => {
    const q1State = applyDistributionUpdate({}, update('room-a', 'q1', 1, { 0: 1, 1: 0, 2: 0 }), 'room-a', 'q1', q1)
    const bothQuestions = applyDistributionUpdate(q1State, update('room-a', 'q2', 2, { 0: 1, 1: 1 }), 'room-a', 'q2', q2)
    const updatedQ1 = applyDistributionUpdate(bothQuestions, update('room-a', 'q1', 2, { 0: 1, 1: 1, 2: 0 }), 'room-a', 'q1', q1)

    expect(updatedQ1.q1.options.map(option => option.percentage)).toEqual([50, 50, 0])
    expect(updatedQ1.q2.options.map(option => option.percentage)).toEqual([50, 50])
  })
})
