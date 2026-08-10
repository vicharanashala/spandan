import { Component } from 'react'

// Wraps a section of the UI so that if it crashes during render, ONLY that
// section shows an error message instead of taking down the entire page.
// This is a class component because React error boundaries currently require
// the class-based lifecycle methods (no hook equivalent exists yet).
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // This is the exact error we need to see in the console to fix the real bug.
    console.error(`[ErrorBoundary: ${this.props.label || 'section'}] crashed:`, error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '16px', border: '1px solid #f5c2c2', borderRadius: '8px', background: '#fff5f5', color: '#b91c1c', fontSize: '13px' }}>
          {this.props.message || 'Something went wrong.'}
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
