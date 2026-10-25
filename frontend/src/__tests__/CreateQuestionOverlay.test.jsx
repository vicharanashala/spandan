import React from 'react'
import { render, screen } from '@testing-library/react'
import CreateQuestionOverlay from '../components/CreateQuestionOverlay'

describe('CreateQuestionOverlay', () => {
  it('starts Time to Answer and Points from the room settings', () => {
    render(<CreateQuestionOverlay isOpen onClose={() => {}} onLaunch={() => {}} defaultTimeToAnswer={45} defaultPoints={500} />)
    expect(screen.getByText('45s')).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
  })

  it('falls back to 30s and 100 points without room settings', () => {
    render(<CreateQuestionOverlay isOpen onClose={() => {}} onLaunch={() => {}} />)
    expect(screen.getByText('30s')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })
})
