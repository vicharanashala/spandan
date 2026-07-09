import { buildQuestionBankQuery, normalizeTags } from '../services/questionService.js'

describe('question bank helpers', () => {
  it('builds a teacher-scoped query from search and tags', () => {
    const query = buildQuestionBankQuery('teacher-1', {
  search: 'algebra',
  tags: ['Math', 'Standup']
})

// Compares only the specified properties, ignoring any extra fields in 'query'
expect(query).toMatchObject({
  createdBy: 'teacher-1',
  savedByTeacher: true,
  isTemplate: true,
  question: { $regex: 'algebra', $options: 'i' },
  tags: { $in: ['math', 'standup'] }
})})

  it('normalizes tag input to lowercase and trims whitespace', () => {
    expect(normalizeTags([' Math ', 'Science', '  math  '])).toEqual(['math', 'science'])
    expect(normalizeTags([])).toEqual([])
  })
})
