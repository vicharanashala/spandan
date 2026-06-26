import zoomSdk from '@zoom/appssdk'
import * as microsoftTeams from '@microsoft/teams-js'

export const PLATFORMS = {
  WEB: 'web',
  ZOOM: 'zoom',
  TEAMS: 'teams'
}

let currentPlatform = PLATFORMS.WEB
let platformContext = null
let isInitialized = false

/**
 * Detects and initializes the current platform SDK (Zoom or Teams)
 * If neither is detected, falls back to standard WEB.
 */
export const initPlatform = async () => {
  if (isInitialized) return { platform: currentPlatform, context: platformContext }

  try {
    // 1. Try initializing Teams
    await microsoftTeams.app.initialize()
    currentPlatform = PLATFORMS.TEAMS
    const context = await microsoftTeams.app.getContext()
    platformContext = context
    console.log('[Platform] Detected Microsoft Teams', context)
    isInitialized = true
    return { platform: currentPlatform, context: platformContext }
  } catch (e) {
    // Expected to fail if not in an iframe within Teams
    // console.log('Not inside Teams:', e.message)
  }

  try {
    // 2. Try initializing Zoom
    // Zoom Apps SDK only works if running inside the Zoom Client environment
    // Checking for a specific Zoom user agent or relying on the config throw
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('zoom')) {
      const configResponse = await zoomSdk.config({
        popoutSize: { width: 480, height: 360 },
        capabilities: ['getMeetingContext']
      })
      currentPlatform = PLATFORMS.ZOOM
      
      try {
        const meetingContext = await zoomSdk.getMeetingContext()
        platformContext = meetingContext
      } catch (err) {
        console.warn('Could not get Zoom meeting context:', err)
      }
      
      console.log('[Platform] Detected Zoom App', configResponse)
      isInitialized = true
      return { platform: currentPlatform, context: platformContext }
    }
  } catch (e) {
    // Expected to fail if not in Zoom
    // console.log('Not inside Zoom:', e.message)
  }

  // 3. Fallback to Web
  currentPlatform = PLATFORMS.WEB
  isInitialized = true
  console.log('[Platform] Detected standard Web Browser')
  return { platform: currentPlatform, context: platformContext }
}

export const getPlatform = () => currentPlatform
export const getPlatformContext = () => platformContext
export const isEmbedded = () => currentPlatform !== PLATFORMS.WEB
