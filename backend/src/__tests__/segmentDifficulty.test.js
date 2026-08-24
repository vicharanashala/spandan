import {
  getSegmentDifficulty
} from '../utils/segmentDifficulty.js'

describe('getSegmentDifficulty', () => {
  test('returns insufficient_data when responses are below minimum', () => {
    expect(getSegmentDifficulty(4, 95)).toBe('insufficient_data')
  })

  test('returns easy for accuracy >= 70%', () => {
    expect(getSegmentDifficulty(5, 70)).toBe('easy')
    expect(getSegmentDifficulty(20, 95)).toBe('easy')
  })

  test('returns medium for accuracy between 40% and 69.99%', () => {
    expect(getSegmentDifficulty(5, 40)).toBe('medium')
    expect(getSegmentDifficulty(10, 65)).toBe('medium')
  })

  test('returns hard for accuracy below 40%', () => {
    expect(getSegmentDifficulty(5, 39.99)).toBe('hard')
    expect(getSegmentDifficulty(20, 10)).toBe('hard')
  })
})