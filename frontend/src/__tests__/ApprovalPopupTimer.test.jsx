import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import QuestionApprovalPopup from '../components/QuestionApprovalPopup'
import TextQuestionApprovalPopup from '../components/TextQuestionApprovalPopup'

// Both approval pop-ups must keep the live question's timer running while the teacher switches
// between questions, and must never launch the same question twice.

const makeQuestions = () => [
  { id: 'a', type: 'MCQ', question: 'First question?', timeToAnswer: 30, options: [{ text: 'x', isCorrect: true }, { text: 'y' }] },
  { id: 'b', type: 'TF', question: 'Second question?', timeToAnswer: 20, options: [{ text: 'True', isCorrect: true }, { text: 'False' }] },
  { id: 'c', type: 'MSQ', question: 'Third question?', timeToAnswer: 15, options: [{ text: 'p', isCorrect: true }, { text: 'q' }] }
]

const popups = [
  {
    name: 'automatic mode (QuestionApprovalPopup)',
    launchLabel: /Approve & Launch/,
    renderPopup: (questions, cbs) => render(
      <QuestionApprovalPopup questions={questions} onApprove={cbs.onApprove} onReject={cbs.onReject}
        onClose={cbs.onClose} onComplete={cbs.onFinish} />
    )
  },
  {
    name: 'Paste & Generate (TextQuestionApprovalPopup)',
    launchLabel: /Launch to Class/,
    renderPopup: (questions, cbs) => render(
      <TextQuestionApprovalPopup questions={questions} onApprove={cbs.onApprove} onReject={cbs.onReject}
        onClose={cbs.onClose} onNext={cbs.onFinish} isLast />
    )
  }
]

const tick = (ms) => act(() => { jest.advanceTimersByTime(ms) })
const pill = (n) => screen.getByRole('button', { name: new RegExp(`Q${n} \\(`) })

describe.each(popups)('$name', ({ launchLabel, renderPopup }) => {
  let cbs
  beforeEach(() => {
    jest.useFakeTimers()
    cbs = { onApprove: jest.fn(), onReject: jest.fn(), onClose: jest.fn(), onFinish: jest.fn() }
  })
  afterEach(() => { jest.useRealTimers() })

  test('has a pill for every question and switches between them', () => {
    renderPopup(makeQuestions(), cbs)
    expect(screen.getByText('First question?')).toBeInTheDocument()
    fireEvent.click(pill(3))
    expect(screen.getByText('Third question?')).toBeInTheDocument()
    fireEvent.click(pill(1))
    expect(screen.getByText('First question?')).toBeInTheDocument()
  })

  test('the live timer keeps running while the teacher switches questions', () => {
    renderPopup(makeQuestions(), cbs)
    fireEvent.click(screen.getByRole('button', { name: launchLabel }))
    expect(cbs.onApprove).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Q1 live')).toBeInTheDocument()
    expect(screen.getByText(/30s/)).toBeInTheDocument()

    fireEvent.click(pill(2))
    expect(screen.getByText('Second question?')).toBeInTheDocument()
    tick(5000)
    expect(screen.getByText('Q1 live')).toBeInTheDocument()
    expect(screen.getByText(/25s/)).toBeInTheDocument()

    fireEvent.click(pill(3))
    tick(5000)
    expect(screen.getByText(/20s/)).toBeInTheDocument()
  })

  test('a launched question is locked and cannot be launched twice', () => {
    renderPopup(makeQuestions(), cbs)
    fireEvent.click(screen.getByRole('button', { name: launchLabel }))
    fireEvent.click(pill(2))
    fireEvent.click(pill(1))
    expect(screen.queryByRole('button', { name: launchLabel })).not.toBeInTheDocument()
    expect(screen.getByText(/· Launched/)).toBeInTheDocument()
    expect(cbs.onApprove).toHaveBeenCalledTimes(1)
  })

  test('launching another question replaces the timer with that question\'s time', () => {
    renderPopup(makeQuestions(), cbs)
    fireEvent.click(screen.getByRole('button', { name: launchLabel }))
    tick(4000)
    fireEvent.click(pill(2))
    fireEvent.click(screen.getByRole('button', { name: launchLabel }))
    expect(screen.getByText('Q2 live')).toBeInTheDocument()
    expect(screen.getByText(/20s/)).toBeInTheDocument()
    expect(cbs.onApprove).toHaveBeenCalledTimes(2)
  })

  test('rejecting another question does not stop the live timer', () => {
    renderPopup(makeQuestions(), cbs)
    fireEvent.click(screen.getByRole('button', { name: launchLabel }))
    fireEvent.click(pill(2))
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }))
    tick(300)
    expect(cbs.onReject).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Q1 live')).toBeInTheDocument()
    tick(3000)
    expect(screen.getByText(/2[67]s/)).toBeInTheDocument()
  })

  test('when time runs out on another question, the teacher stays put and sees Time\'s up', () => {
    renderPopup(makeQuestions(), cbs)
    fireEvent.click(screen.getByRole('button', { name: launchLabel }))
    fireEvent.click(pill(3))
    tick(31000)
    expect(screen.getByText('Third question?')).toBeInTheDocument()
    expect(screen.getByText(/Time's up/)).toBeInTheDocument()
    expect(cbs.onFinish).not.toHaveBeenCalled()
  })

  test('when time runs out on the live question, it moves to the next undecided question', () => {
    renderPopup(makeQuestions(), cbs)
    fireEvent.click(screen.getByRole('button', { name: launchLabel }))
    tick(31000)
    expect(screen.getByText('Second question?')).toBeInTheDocument()
  })

  test('the pop-up finishes only once every question is decided and the live timer has ended', () => {
    renderPopup(makeQuestions(), cbs)
    fireEvent.click(pill(2))
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }))
    tick(300)
    fireEvent.click(pill(3))
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }))
    tick(300)
    fireEvent.click(pill(1))
    fireEvent.click(screen.getByRole('button', { name: launchLabel }))
    tick(10000)
    expect(cbs.onFinish).not.toHaveBeenCalled()
    tick(21000)
    expect(cbs.onFinish).toHaveBeenCalledTimes(1)
  })

  test('closing the pop-up stops the countdown', () => {
    const { unmount } = renderPopup(makeQuestions(), cbs)
    fireEvent.click(screen.getByRole('button', { name: launchLabel }))
    unmount()
    expect(jest.getTimerCount()).toBe(0)
  })
})
