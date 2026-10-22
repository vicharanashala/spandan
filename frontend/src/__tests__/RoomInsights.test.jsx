import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'

jest.mock('../lib/questionsExport', () => ({
  ...jest.requireActual('../lib/questionsExport'),
  downloadText: jest.fn(),
  openPrintWindow: jest.fn(() => true)
}))
import { downloadText, openPrintWindow } from '../lib/questionsExport'
import RoomInsights from '../components/RoomInsights'

const q = (n, over = {}) => ({
  id: 'q' + n, n, segmentIndex: 0, type: 'TF', text: 'Question ' + n, options: [{ text: 'True', isCorrect: true, count: 7, share: 70, distractorShare: null }, { text: 'False', isCorrect: false, count: 3, share: 30, distractorShare: 100 }],
  explanation: 'Because ' + n, points: 100, timeToAnswer: 20, minute: n * 5, responses: 10, correct: 7, correctRate: 70, medianResponseTime: 6, rtBuckets: [4, 3, 2, 1, 0, 0], difficulty: 0.7, discrimination: 0.41, flags: [],
  wrongStudents: [{ id: 's9', name: 'Student 9' }], noAnswer: 1, ...over
})
const teacher = {
  role: 'teacher',
  room: { id: 'r', name: 'Smoke', code: 'ABC123', createdAt: '2026-10-14T14:30:00Z' },
  totals: { questions: 2, responses: 20, joined: 11, responders: 10, answeredHalf: 10, answeredAll: 9, participationRate: 91, medianResponseTime: 6.5, meanScore: 150, medianScore: 160, maxScore: 190, maxPossible: 200, overallCorrectRate: 70, durationMin: 40 },
  timeline: [{ id: 'q1', n: 1, segmentIndex: 0, minute: 5, responders: 10, correctRate: 70 }, { id: 'q2', n: 2, segmentIndex: 1, minute: 20, responders: 10, correctRate: 30 }],
  joinCurve: [{ minute: 0, cumulative: 8 }, { minute: 12, cumulative: 11 }],
  questions: [q(1), q(2, { type: 'MCQ', correctRate: 30, difficulty: 0.3, discrimination: 0.1, flags: ['low-discrimination', 'dead-distractor'], options: [{ text: 'A', isCorrect: false, count: 4, share: 40, distractorShare: 57 }, { text: 'B', isCorrect: true, count: 3, share: 30, distractorShare: null }, { text: 'C', isCorrect: false, count: 3, share: 30, distractorShare: 43 }, { text: 'D', isCorrect: false, count: 0, share: 0, distractorShare: 0 }] })],
  scores: { buckets: [{ from: 0, to: 50, count: 1 }, { from: 50, to: 100, count: 2 }, { from: 100, to: 150, count: 3 }, { from: 150, to: 200, count: 4 }], mean: 150, median: 160, max: 190, maxPossible: 200 },
  segments: [{ segmentIndex: 0, questions: 1, responses: 10, correct: 7, words: 300, durationSec: 120, correctRate: 70 }, { segmentIndex: 1, questions: 1, responses: 10, correct: 3, words: 500, durationSec: 120, correctRate: 30 }],
  heatmap: { questionIds: ['q1', 'q2'], rows: [{ studentId: 's1', name: 'Student 1', points: 190, correct: 2, answered: 2, cells: ['c', 'c'] }, { studentId: 's9', name: 'Student 9', points: 60, correct: 1, answered: 2, cells: ['c', 'w'] }] }
}
const student = { ...teacher, role: 'student', heatmap: undefined, questions: teacher.questions.map(({ wrongStudents, noAnswer, ...rest }) => rest) }

beforeEach(() => jest.clearAllMocks())

describe('RoomInsights (teacher)', () => {
  it('renders every section, tiles and the download buttons', () => {
    render(<RoomInsights insights={teacher} isTeacher isMobile={false} onExportResponses={() => {}} />)
    for (const t of ['Session timeline', 'Participation funnel', 'Score distribution', 'Correct rate per question', 'Speed vs accuracy', 'By lecture segment', 'Question-wise analysis', 'Students × questions']) {
      expect(screen.getByRole('heading', { name: t })).toBeInTheDocument()
    }
    expect(screen.getByText('91%')).toBeInTheDocument()            // participation tile
    const row = document.querySelector('[data-tour="results-stats"]') // the page's one tile row
    expect(row.children).toHaveLength(8)
    expect(within(row).getByText('Students')).toBeInTheDocument()
    expect(within(row).getByText('11')).toBeInTheDocument()        // joined
    expect(within(row).getByText('10 answered at least one')).toBeInTheDocument()
    expect(within(row).getByText('14 of 20 answers correct')).toBeInTheDocument()
    expect(within(row).queryByText('Average Score')).toBeNull()
    expect(within(row).getByText('Session length')).toBeInTheDocument()
    expect(within(row).getByText('40 min')).toBeInTheDocument()
    expect(screen.getByText('6.5s')).toBeInTheDocument()           // median response time tile
    expect(screen.getByText('Download questions')).toBeInTheDocument()
    expect(screen.getByText('Responses CSV')).toBeInTheDocument()
    expect(screen.getByText('Low discrimination')).toBeInTheDocument()
    expect(screen.getByText('Dead distractor')).toBeInTheDocument()
  })

  it('item rows are collapsible: expanding shows the distribution, explanation and who got it wrong', () => {
    render(<RoomInsights insights={teacher} isTeacher isMobile={false} />)
    const card = document.querySelector('[data-tour="item-analysis"]')
    expect(within(card).queryByText('Question 2')).toBeNull()       // the text is not a column any more
    const row = within(card).getByText('Q2').closest('tr')
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/Because 2/)).toBeNull()
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(within(card).getByText('Question 2')).toBeInTheDocument() // shown inside the expanded row
    expect(screen.getByText(/Because 2/)).toBeInTheDocument()
    expect(screen.getByText(/Got it wrong \(1\):/)).toBeInTheDocument()
    expect(screen.getByText(/57% of wrong picks/)).toBeInTheDocument()
    fireEvent.click(row)
    expect(screen.queryByText(/Because 2/)).toBeNull()
  })

  it('download dialog: CSV answer key, then PDF student copy', () => {
    render(<RoomInsights insights={teacher} isTeacher isMobile={false} />)
    fireEvent.click(screen.getByText('Download questions'))
    const dlg = screen.getByRole('dialog', { name: 'Download questions' })
    fireEvent.click(within(dlg).getByLabelText(/^CSV/))
    fireEvent.click(within(dlg).getByText('Download'))
    expect(downloadText).toHaveBeenCalledTimes(1)
    const [name, csv, mime] = downloadText.mock.calls[0]
    expect(name).toBe('Smoke_ABC123_questions.csv'); expect(mime).toBe('text/csv')
    expect(csv).toMatch(/^no,segment,type,question/); expect(csv).toMatch(/Because 1/)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByText('Download questions'))
    const dlg2 = screen.getByRole('dialog', { name: 'Download questions' })
    fireEvent.click(within(dlg2).getByLabelText(/^PDF/))
    fireEvent.click(within(dlg2).getByLabelText(/Student copy/))
    fireEvent.click(within(dlg2).getByText('Download'))
    expect(openPrintWindow).toHaveBeenCalledTimes(1)
    expect(openPrintWindow.mock.calls[0][0]).toMatch(/student copy/)
    expect(openPrintWindow.mock.calls[0][0]).not.toMatch(/Because 1/)
  })
})

describe('RoomInsights, anonymous session', () => {
  it('explains why heatmap names are hidden', () => {
    render(<RoomInsights insights={{ ...teacher, anonymity: { percent: 20 } }} isTeacher isMobile={false} />)
    expect(screen.getByText(/names are hidden here too, except the lowest-scoring 20%/)).toBeInTheDocument()
  })
  it('shows no note for a named session', () => {
    render(<RoomInsights insights={teacher} isTeacher isMobile={false} />)
    expect(screen.queryByText(/names are hidden/)).toBeNull()
  })
})

describe('RoomInsights on a phone', () => {
  it('rows are Qn + 4 numbers; the question, difficulty and flags appear when expanded', () => {
    const { container } = render(<RoomInsights insights={teacher} isTeacher isMobile />)
    const card = container.querySelector('[data-tour="item-analysis"]')
    expect([...card.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual(['#', 'Answered', 'Correct', 'Time', 'Discrim.'])
    expect(within(card).queryByText('Question 1')).toBeNull()
    fireEvent.click(within(card).getByText('Q1').closest('tr'))
    expect(within(card).getByText('Question 1')).toBeInTheDocument()
    expect(within(card).getByText(/difficulty 0.7/)).toBeInTheDocument()
    expect(container.querySelector('[data-tour="results-heatmap"]')).not.toBeNull()
  })
})

describe('RoomInsights segments', () => {
  it('shows live segments as stored (1 = Segment 1) and groups 0 as "Manual / pasted"', () => {
    const segs = [{ segmentIndex: 1, questions: 2, responses: 10, correct: 7, words: 300, durationSec: 600, correctRate: 70 }, { segmentIndex: 0, questions: 1, responses: 5, correct: 1, words: 0, durationSec: 0, correctRate: 20 }]
    render(<RoomInsights insights={{ ...teacher, segments: segs }} isTeacher isMobile={false} />)
    expect(screen.getByText('Segment 1')).toBeInTheDocument()
    expect(screen.queryByText('Segment 2')).toBeNull()
    expect(screen.getByText('Manual / pasted')).toBeInTheDocument()
  })
})
