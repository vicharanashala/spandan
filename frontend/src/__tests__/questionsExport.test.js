import { questionsToCsv, questionsToPrintHtml, safeFilename } from '../lib/questionsExport'

const insights = {
  room: { name: 'DBMS, Lecture 3', code: 'ABC123', createdAt: '2026-10-14T14:30:00Z' },
  questions: [
    { n: 1, segmentIndex: 0, type: 'TF', text: 'A key is "unique", right?', options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }], explanation: 'By definition.', points: 100, timeToAnswer: 20, responses: 10, correctRate: 90 },
    { n: 2, segmentIndex: 1, type: 'MSQ', text: 'Pick all keys', options: [{ text: 'A, with comma', isCorrect: true }, { text: 'B', isCorrect: false }, { text: 'C', isCorrect: true }, { text: 'D' }], explanation: '', points: 100, timeToAnswer: 30, responses: 8, correctRate: 25 },
  ]
}

describe('questionsToCsv', () => {
  it('answer key: one row per question, options as columns, correct letters, explanation, stats; quotes escaped', () => {
    const csv = questionsToCsv(insights, { answerKey: true })
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('no,segment,type,question,option_A,option_B,option_C,option_D,correct,explanation,points,time_to_answer_s,responses,correct_rate_pct')
    expect(lines[1]).toBe('1,,TF,"A key is ""unique"", right?",True,False,,,A,By definition.,100,20,10,90')
    expect(lines[2]).toBe('2,1,MSQ,Pick all keys,"A, with comma",B,C,D,A C,,100,30,8,25')
  })
  it('student copy: no answers, explanations or stats', () => {
    const csv = questionsToCsv(insights, { answerKey: false })
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('no,segment,type,question,option_A,option_B,option_C,option_D')
    expect(csv).not.toMatch(/By definition|correct/)
  })
})

describe('questionsToPrintHtml', () => {
  it('answer key marks correct options and prints explanations; HTML is escaped', () => {
    const html = questionsToPrintHtml(insights, { answerKey: true })
    expect(html).toMatch(/Q2 · Segment 1 · MSQ/) // live segments shown as stored (1 = Segment 1)
    expect(html).not.toMatch(/Q1 · Segment/)       // segment 0 (manual) has no segment label
    expect(html).toMatch(/<title>DBMS, Lecture 3 — Questions with answer key<\/title>/)
    expect(html).toMatch(/Room ABC123/)
    expect(html).toMatch(/A key is &quot;unique&quot;, right\?/)
    expect((html.match(/class="correct"/g) || []).length).toBe(3) // True, A, C
    expect(html).toMatch(/Explanation:<\/strong> By definition\./)
    expect(html).toMatch(/10 answered, 90% correct/)
  })
  it('student copy has no ticks, explanations or stats', () => {
    const html = questionsToPrintHtml(insights, { answerKey: false })
    expect(html).toMatch(/student copy/)
    expect(html).not.toMatch(/class="correct"|✓|Explanation|answered,/)
    expect(html).toMatch(/answers not shown/)
  })
})

it('safeFilename strips unsafe characters', () => {
  expect(safeFilename('DBMS, Lecture 3_ABC123_questions')).toBe('DBMS_Lecture_3_ABC123_questions')
})
