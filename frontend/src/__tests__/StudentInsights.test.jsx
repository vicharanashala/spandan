import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import StudentInsights from '../components/StudentInsights'

const insights = {
  role: 'student',
  questions: [
    { id: 'q1', n: 1, text: 'Question 1', options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }], explanation: '', correctRate: 70 },
    { id: 'q2', n: 2, text: 'Question 2', options: [{ text: 'A', isCorrect: false }, { text: 'B', isCorrect: true }, { text: 'C', isCorrect: false }], explanation: 'B because', correctRate: 30 },
    { id: 'q3', n: 3, text: 'Question 3', options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }], explanation: '', correctRate: 55 },
  ],
  scores: { buckets: [{ from: 0, to: 100, count: 3 }, { from: 100, to: 200, count: 5 }, { from: 200, to: 300, count: 2 }], mean: 150, median: 140, max: 280, maxPossible: 300 },
  me: {
    rank: 4, of: 10, points: 170, maxPossible: 300, answered: 2, correct: 1, missed: 1, correctRate: 50, medianResponseTime: 7,
    fasterThanClass: 1, bestStreak: 1, classMedianScore: 140, classCorrectRate: 52, classMedianResponseTime: 9,
    perQuestion: [
      { id: 'q1', n: 1, answered: true, isCorrect: true, points: 90, cumulativePoints: 90, responseTime: 4, selected: [0], classCorrectRate: 70, classMedianResponseTime: 8, maxPoints: 100 },
      { id: 'q2', n: 2, answered: true, isCorrect: false, points: 0, cumulativePoints: 90, responseTime: 10, selected: [2], classCorrectRate: 30, classMedianResponseTime: 9, maxPoints: 100 },
      { id: 'q3', n: 3, answered: false, isCorrect: null, points: 0, cumulativePoints: 90, responseTime: null, selected: [], classCorrectRate: 55, classMedianResponseTime: 7, maxPoints: 100 },
    ]
  }
}

describe('StudentInsights', () => {
  it("shows the student's own tiles against the class", () => {
    render(<StudentInsights insights={insights} isMobile={false} />)
    expect(screen.getByText('#4')).toBeInTheDocument()
    expect(screen.getByText('of 10 who answered')).toBeInTheDocument()
    expect(screen.getByText('class median 140 · better than the class')).toBeInTheDocument()
    expect(screen.getByText('1 of 2 correct · class 52% · below the class')).toBeInTheDocument()
    expect(screen.getByText('class 9s · faster on 1 of 2')).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('hides the rank when the leaderboard is anonymous', () => {
    render(<StudentInsights insights={{ ...insights, me: { ...insights.me, rank: null, rankHidden: true } }} isMobile={false} />)
    expect(screen.getByText('Hidden')).toBeInTheDocument()
    expect(screen.getByText('the leaderboard is anonymous')).toBeInTheDocument()
    expect(screen.queryByText('#4')).toBeNull()
  })

  it('has one tile row (the tour target) with six tiles', () => {
    const { container } = render(<StudentInsights insights={insights} isMobile={false} />)
    const rows = container.querySelectorAll('[data-tour="results-stats"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].children).toHaveLength(6)
  })

  it('renders the merged collapsible question-wise analysis with filters', () => {
    render(<StudentInsights insights={insights} isMobile={false} />)
    for (const t of ['Your points through the session', 'You vs the class, per question', 'Question-wise analysis', 'Where you sit in the class']) {
      expect(screen.getByRole('heading', { name: t })).toBeInTheDocument()
    }
    expect(screen.queryByRole('heading', { name: 'Your speed, per question' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Worth a second look' })).toBeNull()
    expect(screen.getByText('correct', { selector: 'td span' })).toBeInTheDocument()
    expect(screen.getByText('wrong', { selector: 'td span' })).toBeInTheDocument()
    expect(screen.getByText('· faster')).toBeInTheDocument()            // Q1: 4s vs class 8s
    const card = document.querySelector('[data-tour="question-analysis"]')
    expect(within(card).queryByText('Question 2')).toBeNull()       // the text is not a column any more
    const row = within(card).getByText('Q2').closest('tr')
    expect(row).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(within(card).getByText('Question 2')).toBeInTheDocument()
    expect(screen.getByText(/C\. C \(your pick\)/)).toBeInTheDocument()
    expect(screen.getByText(/B\. B/).querySelector('svg[aria-label="correct"]')).not.toBeNull()
    expect(screen.getByText(/B because/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Wrong \(1\)/ }))
    expect(within(card).queryByText('Q1')).toBeNull()
    expect(within(card).getByText('Q2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Not answered \(1\)/ }))
    expect(within(card).getByText('Q3')).toBeInTheDocument()
    expect(within(card).queryByText('Q2')).toBeNull()
  })

  it('renders nothing without `me` (defensive)', () => {
    const { container } = render(<StudentInsights insights={{ ...insights, me: undefined }} isMobile={false} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('StudentInsights on a phone', () => {
  it('rows are Qn + 4 numbers; the question and class median time appear when expanded', () => {
    render(<StudentInsights insights={insights} isMobile />)
    const card = document.querySelector('[data-tour="question-analysis"]')
    expect([...card.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual(['#', 'Result', 'Time', 'Class', 'Points'])
    expect(within(card).queryByText('Question 1')).toBeNull()
    fireEvent.click(within(card).getByText('Q1').closest('tr'))
    expect(within(card).getByText('Question 1')).toBeInTheDocument()
    expect(screen.getByText('Class median time 8s · you were faster')).toBeInTheDocument()
  })
})
