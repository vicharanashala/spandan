import React, { createContext, useContext, useEffect, useState } from 'react'
import { initPlatform, PLATFORMS, isEmbedded } from '../config/platform'

const PlatformContext = createContext({
  platform: PLATFORMS.WEB,
  context: null,
  isEmbedded: false,
  isInitializing: true
})

export const PlatformProvider = ({ children }) => {
  const [platformState, setPlatformState] = useState({
    platform: PLATFORMS.WEB,
    context: null,
    isEmbedded: false,
    isInitializing: true
  })

  useEffect(() => {
    let mounted = true

    const setupPlatform = async () => {
      try {
        const result = await initPlatform()
        if (mounted) {
          setPlatformState({
            platform: result.platform,
            context: result.context,
            isEmbedded: isEmbedded(),
            isInitializing: false
          })
        }
      } catch (error) {
        console.error('Error initializing platform SDKs:', error)
        if (mounted) {
          setPlatformState(prev => ({ ...prev, isInitializing: false }))
        }
      }
    }

    setupPlatform()

    return () => {
      mounted = false
    }
  }, [])

  return (
    <PlatformContext.Provider value={platformState}>
      {children}
    </PlatformContext.Provider>
  )
}

export const usePlatform = () => useContext(PlatformContext)
