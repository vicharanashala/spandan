// Unit tests for the pure question-generation helpers: the prompt builder and the
// model-response parser. These guard the quality rules (no meta-reference leaks,
// difficulty-driven Bloom emphasis) and the JSON parsing/normalization.
import { buildQuestionPrompt, parseQuestions, parseOptions, generateQuestions } from '../services/questionService.js'

describe('buildQuestionPrompt', () => {
  const transcript = 'The O-ring contracted in the cold and let gas leak, destroying the shuttle.'

  it('frames the input as SESSION CONTENT, not SOURCE MATERIAL', () => {
    const p = buildQuestionPrompt(transcript, ['MCQ'], 'medium')
    expect(p).toContain('SESSION CONTENT:')
    expect(p).not.toContain('SOURCE MATERIAL:')
    expect(p).toContain(transcript)
  })

  it('fences the transcript and tells the model to treat it as inert data, not instructions', () => {
    const p = buildQuestionPrompt(transcript, ['MCQ'], 'medium')
    expect(p).toContain('<<<BEGIN SESSION CONTENT>>>')
    expect(p).toContain('<<<END SESSION CONTENT>>>')
    expect(p).toMatch(/untrusted transcript.*never as instructions/i)
  })

  it('bans the leaky meta-reference wording (incl. speaker/narrator/presenter/author)', () => {
    const p = buildQuestionPrompt(transcript, ['TF'], 'hard')
    // The wording rules must forbid the terms we saw leaking, in the segment AND paste flows.
    expect(p).toContain('source material')
    for (const w of ['"speaker"', '"narrator"', '"presenter"', '"author"']) {
      expect(p).toContain(w)
    }
    expect(p).toContain('the speaker said')
  })

  it('drives Bloom emphasis from the difficulty (honors the teacher setting)', () => {
    expect(buildQuestionPrompt(transcript, ['MCQ'], 'easy')).toContain('Understand and Apply')
    expect(buildQuestionPrompt(transcript, ['MCQ'], 'hard')).toContain('Analyze and Evaluate')
    expect(buildQuestionPrompt(transcript, ['MCQ'], 'medium')).toContain('MEDIUM difficulty')
  })

  it('never asks the model to output the Bloom label', () => {
    const p = buildQuestionPrompt(transcript, ['MCQ'], 'hard')
    expect(p).toMatch(/do not label or mention them/i)
  })

  it('includes an instruction line for each requested type', () => {
    const p = buildQuestionPrompt(transcript, ['MCQ', 'TF', 'MSQ'], 'medium')
    expect(p).toMatch(/1\. MCQ:/)
    expect(p).toMatch(/2\. T\/F:/)
    expect(p).toMatch(/3\. MSQ:/)
  })

  it('reflects the requested count in the header', () => {
    const p = buildQuestionPrompt(transcript, ['MCQ', 'TF'], 'medium')
    expect(p).toContain('write 2 high-quality quiz questions')
  })
})

describe('parseQuestions', () => {
  const expected = ['MCQ']

  it('parses a clean JSON response', () => {
    const raw = JSON.stringify({
      questions: [{
        type: 'MCQ',
        question: 'What sealed the booster?',
        options: [
          { text: 'An O-ring', isCorrect: true },
          { text: 'A bolt', isCorrect: false },
          { text: 'Weld', isCorrect: false },
          { text: 'Tape', isCorrect: false }
        ],
        explanation: 'The O-ring seals it.'
      }]
    })
    const out = parseQuestions(raw, expected)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('MCQ')
    expect(out[0].question).toBe('What sealed the booster?')
    expect(out[0].options).toHaveLength(4)
    expect(out[0].options.filter(o => o.isCorrect)).toHaveLength(1)
    expect(out[0].explanation).toBe('The O-ring seals it.')
  })

  it('parses JSON wrapped in a ```json markdown fence', () => {
    const raw = '```json\n{"questions":[{"type":"TF","question":"Cold shrinks rubber?","options":[{"text":"True","isCorrect":true},{"text":"False","isCorrect":false}],"explanation":"yes"}]}\n```'
    const out = parseQuestions(raw, ['TF'])
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('TF')
  })

  it('returns [] on malformed / non-JSON responses instead of throwing', () => {
    expect(parseQuestions('sorry, I cannot do that', expected)).toEqual([])
    expect(parseQuestions('', expected)).toEqual([])
    expect(parseQuestions('{ not valid json', expected)).toEqual([])
  })

  it('falls back to the expected type when the model omits it', () => {
    const raw = JSON.stringify({ questions: [{ question: 'Q?', options: [], explanation: '' }] })
    const out = parseQuestions(raw, ['MSQ'])
    expect(out[0].type).toBe('MSQ')
  })

  it('truncates an oversized question/explanation instead of storing it unbounded', () => {
    const raw = JSON.stringify({
      questions: [{
        type: 'MCQ',
        question: 'Q'.repeat(10000),
        options: [
          { text: 'A'.repeat(10000), isCorrect: true },
          { text: 'B', isCorrect: false }
        ],
        explanation: 'E'.repeat(10000)
      }]
    })
    const out = parseQuestions(raw, expected)
    expect(out[0].question.length).toBeLessThanOrEqual(500)
    expect(out[0].explanation.length).toBeLessThanOrEqual(800)
    expect(out[0].options[0].text.length).toBeLessThanOrEqual(300)
  })
})

describe('parseOptions', () => {
  it('normalizes True/False options and preserves the correct mark', () => {
    const out = parseOptions([
      { text: 'False', isCorrect: true },
      { text: 'True', isCorrect: false }
    ], 'TF')
    expect(out).toEqual([
      { text: 'True', isCorrect: false },
      { text: 'False', isCorrect: true }
    ])
  })

  it('keeps multiple correct answers for MSQ', () => {
    const out = parseOptions([
      { text: 'A', isCorrect: true },
      { text: 'B', isCorrect: false },
      { text: 'C', isCorrect: true },
      { text: 'D', isCorrect: false }
    ], 'MSQ')
    expect(out.filter(o => o.isCorrect).map(o => o.text)).toEqual(['A', 'C'])
  })

  it('provides a safe default when MCQ options are missing/too few', () => {
    const out = parseOptions([], 'MCQ')
    expect(out).toHaveLength(4)
    expect(out.filter(o => o.isCorrect)).toHaveLength(1)
  })
})

describe('generateQuestions', () => {
  it('rejects an oversized transcript before ever calling a provider', async () => {
    const huge = 'x'.repeat(40001)
    await expect(generateQuestions(huge, { numQuestions: 1 })).rejects.toThrow(/too long/i)
  })
})
