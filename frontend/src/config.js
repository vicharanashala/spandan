// Central configuration
// Set VITE_BACKEND_URL in frontend/.env to point directly to your backend tunnel URL
// (e.g. VITE_BACKEND_URL=https://your-backend-tunnel.trycloudflare.com)

const customBackendUrl = (import.meta.env.VITE_BACKEND_URL || '').trim()

export const API_URL = customBackendUrl
  ? `${customBackendUrl.replace(/\/+$/, '')}/api`
  : `${import.meta.env.VITE_BASE_PATH || ''}/api`

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || customBackendUrl || window.location.origin