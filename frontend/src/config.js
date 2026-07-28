// Central configuration - change VITE_BASE_PATH in .env to update entire app
// Only ONE value to change when deploying to a different path

const BASE_PATH = import.meta.env.VITE_BASE_PATH || ''

export { BASE_PATH }
export const API_URL = BASE_PATH + '/api'
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin
export const SOCKET_PATH = (BASE_PATH || '') + '/socket.io'