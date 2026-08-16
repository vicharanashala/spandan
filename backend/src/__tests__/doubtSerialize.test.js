import { serializeDoubt } from '../routes/doubts.js'

describe('serializeDoubt — anonymity + upvote shaping', () => {
  const author = '507f1f77bcf86cd799439011'
  const other = '507f1f77bcf86cd799439099'

  function makeDoubt(overrides = {}) {
    return {
      _id: 'd1',
      roomId: 'r1',
      text: 'Why is X true?',
      status: 'open',
      isAnonymous: false,
      upvotes: [],
      student: { _id: author, name: 'Ada' },
      createdAt: new Date(),
      resolvedAt: null,
      ...overrides
    }
  }

  it('shows the author name when not anonymous', () => {
    const out = serializeDoubt(makeDoubt(), other)
    expect(out.author).toBe('Ada')
    expect(out.isOwner).toBe(false)
  })

  it('hides the author from other viewers when anonymous', () => {
    const out = serializeDoubt(makeDoubt({ isAnonymous: true }), other)
    expect(out.author).toBeNull()
  })

  it('still reveals the author to themself even when anonymous', () => {
    const out = serializeDoubt(makeDoubt({ isAnonymous: true }), author)
    expect(out.author).toBe('Ada')
    expect(out.isOwner).toBe(true)
  })

  it('reports upvote count and whether the viewer has upvoted', () => {
    const out = serializeDoubt(makeDoubt({ upvotes: [author, other] }), other)
    expect(out.upvoteCount).toBe(2)
    expect(out.hasUpvoted).toBe(true)
  })
})
