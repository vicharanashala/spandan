import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import QuestionEditor from '../components/QuestionEditor'

const opts = (flags) => flags.map((isCorrect, i) => ({ text: String.fromCharCode(65 + i), isCorrect }))

describe('QuestionEditor', () => {
  it('MCQ: selecting an option marks exactly one correct and clears the rest', () => {
    const onChange = jest.fn()
    render(<QuestionEditor question={{ type: 'MCQ', question: 'The question', options: opts([true, false, false, false]) }} onChange={onChange} />)
    // A is correct → only B/C/D show "Mark as correct". Click B (index 0 of those).
    fireEvent.click(screen.getAllByTitle('Mark as correct')[0])
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].options.map(o => o.isCorrect)).toEqual([false, true, false, false])
  })

  it('MSQ: toggling keeps other correct options (multi-select)', () => {
    const onChange = jest.fn()
    render(<QuestionEditor question={{ type: 'MSQ', question: 'Q', options: opts([true, false, false, false]) }} onChange={onChange} />)
    fireEvent.click(screen.getAllByTitle('Mark as correct')[0]) // B
    expect(onChange.mock.calls[0][0].options.map(o => o.isCorrect)).toEqual([true, true, false, false])
  })

  it('TF: single-correct toggle, options are not free-text, no add-option', () => {
    const onChange = jest.fn()
    render(<QuestionEditor question={{ type: 'TF', question: 'Q', options: [{ text: 'True', isCorrect: false }, { text: 'False', isCorrect: false }] }} onChange={onChange} />)
    fireEvent.click(screen.getAllByTitle('Mark as correct')[1]) // False
    expect(onChange.mock.calls[0][0].options.map(o => o.isCorrect)).toEqual([false, true])
    expect(screen.queryByDisplayValue('True')).toBeNull() // TF text is not an editable input
    expect(screen.queryByText('+ Add option')).toBeNull()
  })

  it('edits question text', () => {
    const onChange = jest.fn()
    render(<QuestionEditor question={{ type: 'MCQ', question: 'The question', options: opts([false, false]) }} onChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('The question'), { target: { value: 'A better question' } })
    expect(onChange.mock.calls[0][0].question).toBe('A better question')
  })

  it('edits an option text', () => {
    const onChange = jest.fn()
    render(<QuestionEditor question={{ type: 'MCQ', question: 'Q', options: opts([false, false, false, false]) }} onChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('B'), { target: { value: 'Bravo' } })
    expect(onChange.mock.calls[0][0].options[1].text).toBe('Bravo')
  })

  it('adds and removes options (min 2 enforced)', () => {
    const onChange = jest.fn()
    const { rerender } = render(<QuestionEditor question={{ type: 'MCQ', question: 'Q', options: opts([true, false, false, false]) }} onChange={onChange} />)
    fireEvent.click(screen.getByText('+ Add option'))
    expect(onChange.mock.calls[0][0].options).toHaveLength(5)
    expect(onChange.mock.calls[0][0].options[4]).toEqual({ text: '', isCorrect: false })

    // With only 2 options, no remove buttons are shown (can't go below 2).
    rerender(<QuestionEditor question={{ type: 'MCQ', question: 'Q', options: opts([true, false]) }} onChange={onChange} />)
    expect(screen.queryAllByTitle('Remove option')).toHaveLength(0)
  })
})
