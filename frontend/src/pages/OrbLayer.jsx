import React, { useEffect } from 'react'
import SpandanGPTWidget from '../components/SpandanGPTWidget'

export default function OrbLayer() {
  // In Electron, we can tell the OS to ignore mouse events where the window is transparent.
  // We only want to intercept clicks when the mouse is over an actual element.
  useEffect(() => {
    if (window.electronAPI) {
      const handleMouseEnter = () => window.electronAPI.setIgnoreMouseEvents(false)
      const handleMouseLeave = () => window.electronAPI.setIgnoreMouseEvents(true, { forward: true })

      document.body.addEventListener('mouseenter', handleMouseEnter)
      document.body.addEventListener('mouseleave', handleMouseLeave)

      // Start by ignoring events (so user can click through the transparent background)
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true })

      return () => {
        document.body.removeEventListener('mouseenter', handleMouseEnter)
        document.body.removeEventListener('mouseleave', handleMouseLeave)
      }
    }
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: 'transparent' }}>
      <SpandanGPTWidget />
    </div>
  )
}
