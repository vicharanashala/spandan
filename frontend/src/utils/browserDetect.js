/**
 * Browser and OS detection utilities for audio capture capabilities.
 */

/**
 * Returns true if the current browser is Chromium-based (Chrome, Edge, Opera, Brave)
 * and supports getDisplayMedia with audio capture.
 */
export function supportsSystemAudioCapture() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isChromiumBased = /Chrome|Edg|OPR|Brave/.test(ua) && !/Firefox/.test(ua)
  return isChromiumBased && !!navigator.mediaDevices?.getDisplayMedia
}

/**
 * Returns the operating system category: 'windows' | 'mac' | 'linux' | 'other'
 */
export function getOS() {
  if (typeof navigator === 'undefined') return 'other'

  // User-Agent Data API (Modern browsers)
  if (navigator.userAgentData?.platform) {
    const platform = navigator.userAgentData.platform.toLowerCase()
    if (platform.includes('win')) return 'windows'
    if (platform.includes('mac')) return 'mac'
    if (platform.includes('linux')) return 'linux'
  }

  // Fallback to platform string / userAgent matching
  const platform = (navigator.platform || '').toLowerCase()
  const ua = (navigator.userAgent || '').toLowerCase()

  if (platform.includes('win') || ua.includes('windows')) return 'windows'
  if (platform.includes('mac') || ua.includes('macintosh') || ua.includes('mac os')) return 'mac'
  if (platform.includes('linux') || ua.includes('linux')) return 'linux'

  return 'other'
}
