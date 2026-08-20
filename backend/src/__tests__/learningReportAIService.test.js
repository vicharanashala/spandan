import {
  buildLearningReportPrompt,
  parseLearningReport
} from '../services/learningReportAIService.js'

describe('buildLearningReportPrompt', () => {
  it('includes the supplied metrics and session data', () => {
    const metrics = {
      totalQuestions: 10,
      attempted: 8,
      correct: 6,
      accuracy: 75,
      totalPoints: 60,
      averageResponseTime: 8.5
    }

    const responses = [
      {
        questionId: 'q1',
        isCorrect: true,
        points: 10
      }
    ]

    const questions = [
      {
        question: 'What is supervised learning?',
        type: 'MCQ'
      }
    ]

    const prompt = buildLearningReportPrompt(
      metrics,
      responses,
      questions,
      'Machine learning uses data to learn patterns.'
    )

    expect(prompt).toContain('PERFORMANCE METRICS:')
    expect(prompt).toContain('"accuracy": 75')
    expect(prompt).toContain('What is supervised learning?')
    expect(prompt).toContain('Machine learning uses data to learn patterns.')
    expect(prompt).toContain('OUTPUT:')
    expect(prompt).toContain('"strengths"')
    expect(prompt).toContain('"weaknesses"')
    expect(prompt).toContain('"recommendations"')
  })
})

describe('parseLearningReport', () => {
  it('parses a valid JSON learning report', () => {
    const raw = JSON.stringify({
      summary: 'Good understanding with some gaps.',
      strengths: [
        'Understands core concepts'
      ],
      weaknesses: [
        'Needs more practice with applications'
      ],
      recommendations: [
        'Review practical examples'
      ]
    })

    expect(parseLearningReport(raw)).toEqual({
      summary: 'Good understanding with some gaps.',
      strengths: [
        'Understands core concepts'
      ],
      weaknesses: [
        'Needs more practice with applications'
      ],
      recommendations: [
        'Review practical examples'
      ]
    })
  })

  it('parses JSON wrapped in a markdown code fence', () => {
    const raw = `\`\`\`json
{
  "summary": "Strong session performance.",
  "strengths": ["Good accuracy"],
  "weaknesses": [],
  "recommendations": ["Continue practicing"]
}
\`\`\``

    const result = parseLearningReport(raw)

    expect(result.summary).toBe('Strong session performance.')
    expect(result.strengths).toEqual(['Good accuracy'])
    expect(result.weaknesses).toEqual([])
    expect(result.recommendations).toEqual(['Continue practicing'])
  })

  it('uses safe defaults for missing fields', () => {
    const raw = JSON.stringify({
      summary: 'Partial report'
    })

    expect(parseLearningReport(raw)).toEqual({
      summary: 'Partial report',
      strengths: [],
      weaknesses: [],
      recommendations: []
    })
  })

  it('rejects invalid AI output', () => {
    expect(() => parseLearningReport('not valid json'))
      .toThrow('Failed to parse learning report')
  })
})