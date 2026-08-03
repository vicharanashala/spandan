# Reconnection Fix Context

## Current WebSocket Flow
1. **App Mount:** The client socket connection is established at the root level (`App.jsx`) when the application loads and the user is authenticated. The socket is stored in the Zustand `useSocketStore`.
2. **Socket Initialization:** `useSocketStore` sets up listeners for `connect`, `disconnect`, `authenticated`, `room:joined`, etc.
3. **Handshake Auth:** The socket connection includes an initial handshake token (`auth: { token }`) which is verified by the backend middleware `io.use(...)`.
4. **On Connection:**
   - The backend `connection` event registers event listeners for `authenticate`, `room:join`, `room:leave`, `new_question`, etc.
   - The client `connect` listener fires and immediately emits `authenticate` and `room:join` (if `joinedRoom` is stored in the store).
5. **Room Join:** When a student enters a room, `StudentRoomPage` invokes `joinRoom(roomCode, userId)`, which stores the room code in the Zustand store (`joinedRoom`) and emits `room:join` via the socket.

## Reconnect Flow
1. **Network Disruption:** The socket disconnects. The client `useSocketStore` handles the `disconnect` event, updating `isConnected` to `false`.
2. **Auto-Reconnection:** `socket.io-client` automatically attempts to re-establish the connection in the background.
3. **Socket Re-connect:** Once re-connected, the socket emits the `connect` event.
4. **Client-side Store Handler:** The store's `'connect'` handler runs:
   - Sets `isConnected` to `true`.
   - Emits `socket.emit('authenticate', { token })`.
   - Emits `socket.emit('room:join', { roomCode, userId })` (using stored `joinedRoom` parameters).
5. **Client-side Page Handler:** The `StudentRoomPage.jsx` `'connect'` listener (`handleReconnect`) runs:
   - Fetches `/api/responses/room/:roomId/student/:studentId` (past responses).
   - Fetches `/api/rooms/:roomCode/active-question` (the currently active question).

## Room Membership Lifecycle
1. **Joining Room:**
   - Student joins room via HTTP POST or socket `'room:join'`.
   - The backend adds/updates a record in the `RoomMember` collection in MongoDB.
   - The student socket is joined to the socket.io room via `socket.join(roomCode)`.
2. **Leaving Room:**
   - The student explicitly leaves the room (clicks "Leave").
   - The backend deletes the record from `RoomMember`.
   - The student socket leaves the socket.io room via `socket.leave(roomCode)`.
3. **Disconnection:**
   - Temporary disconnection does NOT remove the student from `RoomMember` database table.
   - However, a re-connected socket is a member of **no** socket rooms on the server. Hence, they must re-join the socket.io room (`socket.join(roomCode)`) upon reconnecting.

## Active Poll Lifecycle
1. **Launch Poll:**
   - The teacher publishes a question.
   - The backend socket handler `'new_question'` updates the question document's `launchedAt` timestamp in MongoDB to `new Date()`.
   - The backend broadcasts `new_question` event to all sockets joined to the socket room.
2. **Answer Submission:**
   - Students submit their answers within the `timeToAnswer` window.
3. **Poll Expiry:**
   - When the timer runs out, the teacher ends the question (which emits `question:ended` with results, or client fetches past responses).

## Identified Root Cause
1. **Websocket Re-authentication Race Condition (Primary Cause):**
   When the socket reconnects, the client emits `'authenticate'` and `'room:join'` concurrently in the same turn of the event loop.
   On the backend, `'authenticate'` is an asynchronous handler because it queries MongoDB (`await User.findById(decoded.userId).select('role').lean()`). While this database query is in-flight, the server processes the next message in the queue (`'room:join'`).
   Since `'authenticate'` has not finished, `socket.data.userId` is still `undefined`. The backend `'room:join'` handler checks `socket.data.userId`, finds it missing, emits a `'room:error'` (`Not authenticated`), and exits early.
   As a result, the student is **never** added back to the socket.io room on the server and silently misses all future broadcast events (new questions, leaderboard updates, poll ended events).
2. **Incomplete Client Reconnection Sync (Secondary Cause):**
   - The client `StudentRoomPage` registers `handleReconnect` on the `'connect'` socket event. If the socket is already connected when the student joins (which is the default on mount since the socket connects in `App.jsx`), this event listener is not executed, meaning they never fetch the active question on initial mount.
   - In `handleReconnect`, the client does not check if they already answered the recovered question.
   - In `handleNewQuestion`, the client sets `timeLeft` to the full `timeToAnswer` value instead of subtracting the elapsed time, leading to desynchronization of the countdown timer.

## Proposed Fix
1. **Synchronous Sequence for Auth/Room Join:**
   Modify `socketStore.js` to wait for the `'authenticated'` socket event from the server before emitting `'room:join'`. This ensures the backend has successfully authenticated the socket and populated `socket.data` before trying to join the room.
2. **State-Driven Sync on Client:**
   Implement a `useEffect` hook in `StudentRoomPage.jsx` that triggers state synchronization whenever the socket connection state (`isConnected`) transitions to `true` and the room details are loaded.
   This hook will fetch both the student's past responses and the active question in parallel (`Promise.all`), resolving:
   - Whether the active question exists and its correct remaining time (calculating `Math.max(0, question.timeToAnswer - elapsed)` using the question's `launchedAt` timestamp).
   - Whether the student has already responded to the active question. If they have, set `submitted: true` and load their selected options so they don't see a clean, submit-ready page for a question they already answered.
3. **Clean Up socket.on('connect') event listener:**
   Remove the manual `socket.on('connect', handleReconnect)` listener and use the React-state-driven effect instead to prevent stale closure bugs.

## Affected Frontend Files
- `frontend/src/stores/socketStore.js` — Modify `'connect'` and `'authenticated'` listeners.
- `frontend/src/pages/StudentRoomPage.jsx` — Replace the socket `'connect'` listener with a unified state-driven `useEffect` sync hook.

## Affected Backend Files
- `backend/src/index.js` — Emit `'authenticated'` automatically upon connection if the handshake authentication succeeded.
