import React from 'react'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../components/ErrorBoundary'

const Boom = () => { throw new Error('boom') }

describe('ErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    render(<ErrorBoundary message="Leaderboard unavailable"><div>child-ok</div></ErrorBoundary>)
    expect(screen.getByText('child-ok')).toBeInTheDocument()
  })

  it('shows the fallback message when a child throws (page is not blanked)', () => {
    // React logs the caught error to console.error — silence it for a clean test run.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary message="Leaderboard unavailable"><Boom /></ErrorBoundary>)
    expect(screen.getByText('Leaderboard unavailable')).toBeInTheDocument()
    spy.mockRestore()
  })

  it('falls back to a default message when none is provided', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
    spy.mockRestore()
  })
})
