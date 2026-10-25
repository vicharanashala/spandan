// Shareable "join this room" links.
//   buildInviteLink(code, origin) → https://host/spandan/student/join-room?code=ABC123
//   readInviteCode(search)        → the cleaned 6-character code from a ?code= query, or ''
// The path mirrors the router basename in App.jsx and the /student/join-room route.

const JOIN_PATH = '/spandan/student/join-room'

// Same cleaning the join input applies to typed codes: uppercase, A-Z/0-9 only, max 6.
export const cleanRoomCode = (raw) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)

export function buildInviteLink(code, origin = window.location.origin) {
  return `${origin}${JOIN_PATH}?code=${encodeURIComponent(cleanRoomCode(code))}`
}

export function readInviteCode(search) {
  return cleanRoomCode(new URLSearchParams(search).get('code'))
}
