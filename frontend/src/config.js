// Central configuration - change VITE_BASE_PATH in .env to update entire app
// Only ONE value to change when deploying to a different path

const BASE_PATH = import.meta.env.VITE_BASE_PATH || ''

export const API_URL = BASE_PATH + '/api'
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin

// Socket.IO server path — must match the path option on the server-side io() call.
// On localhost the Vite proxy forwards /socket.io → backend, so path is /socket.io
// On production (nginx, base=/spandan) the path becomes /spandan/socket.io
export const SOCKET_PATH = BASE_PATH ? BASE_PATH + '/socket.io' : '/socket.io'