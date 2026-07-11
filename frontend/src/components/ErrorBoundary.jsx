import React from 'react'

/**
 * ErrorBoundary — catches any unhandled render-time error in its subtree
 * and renders a friendly fallback UI instead of a blank page.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 *
 *   <ErrorBoundary fallback={<RouteFallback />}>
 *     <ProtectedRoutePage />
 *   </ErrorBoundary>
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback.
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Log to console with full component stack so devs can debug.
    // (Browser DevTools also captures this automatically.)
    console.error('[ErrorBoundary] Caught error:', error)
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    // Reset boundary state without a full page reload — useful for
    // per-route boundaries where a hard reload would be heavy.
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    // Allow a custom fallback if provided
    if (this.props.fallback) return this.props.fallback

    // Default fallback UI
    const isDev = import.meta.env?.DEV || process.env.NODE_ENV === 'development'
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '24px',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            maxWidth: '440px',
            padding: '32px',
            background: 'var(--bg-secondary, #fff)',
            borderRadius: '16px',
            border: '1px solid var(--border-color)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
          <h1 style={{ fontSize: '20px', margin: '0 0 8px', fontWeight: 700 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
            An unexpected error occurred. Your work has been preserved.
          </p>

          {isDev && this.state.error && (
            <details
              style={{
                marginBottom: '20px',
                padding: '12px',
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#b91c1c',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <summary style={{ fontWeight: 600 }}>Error details (dev only)</summary>
              <pre
                style={{
                  marginTop: '8px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                }}
              >
                {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack}
              </pre>
            </details>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '10px 18px',
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: '10px 18px',
                fontSize: '14px',
                fontWeight: 600,
                color: 'white',
                background: '#3b82f6',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary