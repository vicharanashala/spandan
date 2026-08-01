import { buildDistribution, distinctNumericOptions } from '../services/optionDistribution.js'

describe('option distribution', () => {
  const question = { _id: 'q1', options: [{ isCorrect: false }, { isCorrect: true }, { isCorrect: false }] }

  it('calculates MCQ/TF percentages and can include correct options', () => {
    const result = buildDistribution(question, 4, new Map([[0, 1], [1, 2], [2, 1]]), true)
    expect(result.options).toEqual([
      { optionIndex: 0, count: 1, percentage: 25 },
      { optionIndex: 1, count: 2, percentage: 50 },
      { optionIndex: 2, count: 1, percentage: 25 }
    ])
    expect(result.correctOptions).toEqual([1])
  })

  it('deduplicates MSQ selections per respondent', () => {
    expect(distinctNumericOptions([0, 0, 2, 2])).toEqual([0, 2])
  })

  it('does not divide by zero', () => {
    const result = buildDistribution(question, 0, new Map(), false)
    expect(result.options.every((option) => option.percentage === 0)).toBe(true)
    expect(result).not.toHaveProperty('correctOptions')
  })
})