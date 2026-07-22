import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Silence debug logging in the deployed app; keep it on localhost for development. This is a runtime
// gate (not a build-time strip) because the local build is served the same way as production — so
// the same bundle stays quiet on any non-local host and verbose on localhost. console.warn and
// console.error are left intact so real problems still surface in production.
if (!['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  console.log = () => {}
  console.debug = () => {}
  console.info = () => {}
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)