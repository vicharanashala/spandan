// Central configuration - change VITE_BASE_PATH in .env to update entire app
// Only ONE value to change when deploying to a different path

// Normalised base path: '' for local dev at the root, '/spandan' for a sub-path deployment.
// Everything that needs to be base-aware (API prefix, socket path, router basename) reads this.
const rawBase = (import.meta.env.VITE_BASE_PATH || '').replace(/^\/+|\/+$/g, '')
export const BASE_PATH = rawBase ? `/${rawBase}` : ''

export const API_URL = BASE_PATH + '/api'
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin