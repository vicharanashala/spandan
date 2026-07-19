// Central configuration - change VITE_BASE_PATH in .env to update entire app
// Only ONE value to change when deploying to a different path

const RAW_BASE = import.meta.env.VITE_BASE_PATH || ''
// Normalize: '', '/spandan', '/spandan/' all collapse to a single basename
export const BASE_PATH = RAW_BASE
  ? '/' + RAW_BASE.replace(/^\/+|\/+$/g, '')
  : ''

export const API_URL = BASE_PATH + '/api'
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin
export const ROUTER_BASENAME = BASE_PATH