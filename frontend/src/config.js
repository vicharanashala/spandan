// Central configuration - change VITE_BASE_PATH in .env to update entire app
// Only ONE value to change when deploying to a different path

const BASE_PATH = import.meta.env.VITE_BASE_PATH || ''

export const API_URL = BASE_PATH + '/api'
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin
// Socket.io mount path — mirrors the API base path so it works both locally (empty → '/socket.io')
// and when the app is deployed under a sub-path like '/spandan' (→ '/spandan/socket.io').
export const SOCKET_PATH = BASE_PATH
  ? '/' + BASE_PATH.replace(/^\//, '').replace(/\/+$/, '') + '/socket.io'
  : '/socket.io'