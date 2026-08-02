// Central configuration - change VITE_BASE_PATH in .env to update entire app
// Only ONE value to change when deploying to a different path

const BASE_PATH = import.meta.env.VITE_BASE_PATH || ''

export const API_URL = BASE_PATH ? BASE_PATH + '/api' : '/api'
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin
// Socket path must always be an absolute path (start with /). If BASE_PATH is set (e.g. for
// a production nginx sub-path deployment), prepend it; otherwise use the default '/socket.io'.
export const SOCKET_PATH = BASE_PATH ? BASE_PATH + '/socket.io' : '/socket.io'