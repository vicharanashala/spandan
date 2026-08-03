# Reconnection Debug Context — Persistent Student "Reconnecting..." (Root Cause + Fix)

## System Under Test

- **Topology:** Frontend (Vite dev server on `:5173`, or production static server `server.js` on `:5002`) proxies to backend (`:3001`). Browser → proxy → backend.
- **Socket.IO client** (`frontend/src/stores/socketStore.js`): connects to `window.location.origin` with `path: '/spandan/socket.io'`, `auth: { token }` handshake, transports `['websocket', 'polling']`, auto-reconnect enabled.
- **Socket.IO server** (`backend/src/index.js`): `new Server(httpServer, { cors })` — no `path` option, i.e. the engine.io default `/socket.io/`.
- **Proxies forward the client path verbatim (no rewrite):**
  - Vite dev proxy: `frontend/vite.config.js` → `'/spandan/socket.io'` → `http://localhost:3001` (`ws: true`).
  - Production static server: `server.js` → `BASE_PATH/socket.io/*` → `localhost:3001/spandan/socket.io/*`.

## The Bug

After any connection attempt (initial load AND reconnect), the student UI stays on
"Reconnecting..." forever, never receives polls, and requires a manual page refresh to recover.

`isConnected` in the Zustand socket store is only set to `true` on the socket.io `connect` event.
It never becomes `true`, so `StudentRoomPage` renders "Reconnecting..." permanently
(`StudentRoomPage.jsx:531`).

## WebSocket Lifecycle Traced (current code)

| Step | Client | Backend | Result (before fix) |
|---|---|---|---|
| 1. Socket created | `io(SOCKET_URL, { path: '/spandan/socket.io', auth: {token} })` | — | — |
| 2. Handshake request | `GET /spandan/socket.io/?EIO=4&transport=polling` via proxy | server mounted at default `/socket.io` | **404** (request falls through to Express) |
| 3. Handshake | — | `io.use` middleware would authenticate | never reached |
| 4. `connect` event | never fires → `isConnected` stays `false` | — | UI shows "Reconnecting..." |
| 5. `authenticate` + `room:join` emits | never emitted | — | — |
| 6. Reconnect attempts | Socket.IO retries (backoff) | — | every attempt 404s again → **permanent "Reconnecting..."** |

## Root Cause (verified with runtime evidence)

**The backend Socket.IO server is mounted at the default path `/socket.io`, but the client (and
every proxy in front of the backend) uses `/spandan/socket.io`.** Every handshake — initial and
reconnect — returns HTTP 404, so no socket ever connects, authenticates, joins a room, or receives
a broadcast. This is a deployment-path regression, not a race, not an auth bug, and not a client
sync bug.

Runtime evidence (backend running on `:3001`, Vite dev proxy on `:5173`):

```
GET http://localhost:3001/socket.io/?EIO=4&transport=polling        → 200 0{"sid":"a0NR3rs...","upgrades":["websocket"],...}
GET http://localhost:3001/spandan/socket.io/?EIO=4&transport=polling → 404  Not Found
GET http://localhost:5173/spandan/socket.io/?EIO=4&transport=polling → 404  Not Found   (exact browser path via Vite proxy)
```

After the fix, all three return `200 0{"sid":...}` and a real socket round-trip (connect → emit
`authenticate` → receive `authenticated` → manual disconnect → reconnect → round-trip again)
succeeds.

## How the regression was introduced (git archaeology)

The backend path was removed by two commits that assumed a reverse proxy strips the prefix:

- `65f119f` "Fix backend Socket.IO path - remove /spandan prefix since nginx already strips it"
  → removed `path: '/spandan/socket.io'`.
- `7e3d505` "Revert 'fix: route spandan socket events under app path'" → removed `path: SOCKET_PATH`.

Meanwhile the client kept the explicit path (`socketStore.js`) and both current proxies
(`vite.config.js`, `server.js`) forward `/spandan/socket.io` **verbatim** to the backend. The
"nginx already strips it" assumption does not hold for the current deployment, so the backend
never serves the client's path.

Note: the default-path handshake `GET /socket.io/...` returns 200, which is why the server looks
healthy. Nothing in the current code connects to the default path, so the two never meet.

## Why previous symptom-level fixes could not help

Earlier fixes added `launchedAt` tracking, a `GET /rooms/:code/active-question` recovery endpoint,
and state-driven reconnect sync in `StudentRoomPage`. They are correct and remain in the fix, but
they only take effect **after** a socket connects. Because the handshake itself 404'd, the socket
never connected, so:

- the teacher's `new_question` broadcast never reached the room,
- `launchedAt` was never stamped (it is set inside the socket `new_question` handler),
- the recovery endpoint correctly returned 204 (no launched question),
- the student stayed stuck on "Reconnecting...".

The teacher appeared to "publish" because question creation succeeds over REST
(`POST /api/questions`), which is unaffected by the socket path.

## The Fix

`backend/src/index.js` — mount the Socket.IO server at the client path, matching the client and
both proxies:

```js
const io = new Server(httpServer, {
  path: '/spandan/socket.io',
  cors: { ... }
})
```

This is the only change required to eliminate the permanent "Reconnecting..." state. It is
additive, changes no protocol, no authentication, no room logic, no polling logic.

## Files Modified (entire PR)

| File | Change | Purpose |
|---|---|---|
| `backend/src/index.js` | `path: '/spandan/socket.io'` on `new Server(...)` | **Root-cause fix**: serve the handshake at the client path |
| `backend/src/index.js` | stamp `launchedAt` before broadcasting in `new_question` handler | reconnect recovery window |
| `backend/src/models/Question.js` | `launchedAt: { type: Date, default: null }` | persistence for recovery |
| `backend/src/routes/rooms.js` | `GET /:roomCode/active-question` (200/204/403/404) | REST recovery of the live poll |
| `frontend/vite.config.js` | proxy `/spandan/socket.io` → `:3001` (`ws: true`) | dev proxy matches the client path |
| `frontend/src/pages/StudentRoomPage.jsx` | state-driven sync effect on `[isConnected, room?._id]`; `fetchSessionState()` recovers active poll, accurate remaining timer from `launchedAt`, restores submitted state; removed `socket.on('connect', handleReconnect)`; `roomRef` avoids stale closures | reconnect synchronization |

## Validation

- Handshake `200` at `/spandan/socket.io` (direct + via Vite proxy); old default `/socket.io` now
  404s but nothing uses it.
- Socket.IO client through the Vite proxy: connect → event round-trip → manual disconnect →
  reconnect → round-trip again. PASS.
- Full E2E (real users via REST + sockets): teacher registers/creates room, student registers and
  joins, both sockets connect and receive `room:joined`, teacher emits `new_question`, student
  receives the broadcast, `GET /rooms/:code/active-question` returns `200 {question}`. PASS.
- `node --check` on changed backend files; `vite build` succeeds (115 modules).

## Regression

- Socket.IO protocol/events unchanged; authentication (`io.use` handshake + `authenticate` event)
  unchanged; room management unchanged; polling workflow unchanged.
- Teacher create room / publish poll flow verified working (REST + socket broadcast).
- Student connect → disconnect → reconnect → rejoin → receive poll → receive remaining timer →
  submit answer path verified end-to-end.
