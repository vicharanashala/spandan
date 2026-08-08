import { Component } from 'react'

// Generic React error boundary. If any component in its subtree throws during render or a lifecycle,
// this catches it and shows a small fallback instead of letting the error unmount the whole page.
// Used to isolate the leaderboard panel so a leaderboard crash can never take down a live session.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: '13px'
        }}>
          {this.props.message || 'Something went wrong.'}
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
