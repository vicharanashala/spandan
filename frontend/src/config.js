// Central configuration - change VITE_BASE_PATH in .env to update entire app
// Only ONE value to change when deploying to a different path

const BASE_PATH = import.meta.env.VITE_BASE_PATH || ''
const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL
const SOCKET_ORIGIN = configuredSocketUrl
  ? (() => {
      try { return new URL(configuredSocketUrl, window.location.origin).origin }
      catch { return window.location.origin }
    })()
  : window.location.origin

export const API_URL = BASE_PATH + '/api'
export const SOCKET_URL = SOCKET_ORIGIN
export const SOCKET_PATH = BASE_PATH ? `${BASE_PATH}/socket.io` : '/socket.io'
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
