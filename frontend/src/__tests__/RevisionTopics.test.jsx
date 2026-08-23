import React from 'react'
import { render, screen } from '@testing-library/react'
import RevisionTopics from '../components/RevisionTopics'

describe('RevisionTopics', () => {
  it('does not render during an active session', () => {
    render(<RevisionTopics
      isSessionComplete={false}
      questions={[{ answered: true, isCorrect: false, topic: 'Backpropagation' }]}
    />)
    expect(screen.queryByText('3 Things to Revise')).not.toBeInTheDocument()
  })

  it('shows the all-correct empty state after a session', () => {
    render(<RevisionTopics
      isSessionComplete
      questions={[{ answered: true, isCorrect: true, topic: 'Backpropagation' }]}
    />)
    expect(screen.getByText('Nothing to revise from this session 🎉')).toBeInTheDocument()
  })

  it('hides safely when all incorrect older questions lack topics', () => {
    render(<RevisionTopics
      isSessionComplete
      questions={[{ answered: true, isCorrect: false }]}
    />)
    expect(screen.queryByText('3 Things to Revise')).not.toBeInTheDocument()
  })
})
