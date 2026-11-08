Low-Bandwidth "Audio Only" Mode — Student Classroom View

A student-facing mode that cuts network and rendering load during a live session while
preserving everything a student needs to participate: audio playback, live transcription,
real-time poll alerts, and offline answer sync.

## User-facing behaviour

- **Toggle.** A high-visibility `Audio Only Mode` switch (wifi-off icon, ON/OFF badge,
  `role="switch"`) sits in the session status bar next to the sound and Leave controls.
- **Persistence.** The preference is stored in `localStorage['spandan.audioOnlyMode']` and
  survives page reloads and brief disconnects.
- **Audio-only viewport.** When active, the video container is replaced by
  `AudioOnlyViewport`: a status banner ("Audio Only Mode Active — Stream Paused"), a live
  speech-to-text transcript panel with auto-scroll, and a dynamic poll HUD card that
  activates (question, options, countdown, submit) the moment a poll goes live.
- **Feedback toasts.** A floating toast announces manual toggles
  ("Audio Only Mode Active — Stream Paused" / "Standard Video Mode Restored") and both
  automatic switches (below).
- **Resume.** "Resume Video" in the viewport banner or the status-bar switch restores the
  live video immediately — no page refresh required.
- **Uninterrupted alerts.** Poll chimes (Web Audio) and haptic pulses
  (`navigator.vibrate([100, 50, 100])`) fire exactly as in standard mode.

## Automatic switching

Two independent detectors flip the student into Audio Only Mode (with a toast) when the
link looks bad:

1. **Network Information API** (Chromium only): `navigator.connection.saveData` or
   `effectiveType` of `2g` / `slow-2g`, evaluated on mount and on every `change` event.
2. **Socket reconnect probe** (all browsers): timestamps of socket `disconnect` events are
   kept in a sliding window; `RECONNECT_TRIGGER_COUNT` (3) disconnects inside
   `RECONNECT_WINDOW_MS` (60 s) trips the switch. This covers browsers without the Network
   Information API and congested links the OS misreports as fast. The window resets after
   triggering so a student who manually switches back is not immediately flipped again.

Both detectors only act while Audio Only Mode is off.

## What is reduced vs. preserved

| Preserved in Audio Only | Reduced / dropped in Audio Only |
|---|---|
| Audio playback (video element kept mounted in a zero-render wrapper) | Video rendering/compositing (player hidden off-screen) |
| `transcription:chunk` live transcript stream | `video:progress` throttled to one update per 8 s |
| `question:started`, `question:ended`, `new_question`, `questions:ready` | `cursor:move`, `cursor:update`, `canvas:draw`, `whiteboard:update`, `chat:image`, `chat:typing` discarded |
| Poll chimes + haptics | — |
| Response submission, with offline vault fallback and reconnect sync | — |

## Media stream control

`frontend/src/lib/mediaStreamControl.js` disables video tracks and force-enables audio
tracks on every `<video>` element with a `srcObject`, and on any WebRTC peer connections
registered in `window.__spandanPeerConnections`. The classroom video itself is a YouTube
IFrame player (no WebRTC in production), so the dominant savings come from socket payload
throttling and removing the player from the rendered layout; the iframe stays mounted
(hidden) so its audio track keeps playing.

## Offline response sync (Response Vault)

`frontend/src/lib/responseVault.js` queues a response in `localStorage` whenever the submit
POST fails, and `syncPendingResponses()` replays the queue on socket reconnect (and on
join). Successful or already-answered (HTTP 400) replies retire the queued item.

## Implementation map

| File | Role |
|---|---|
| `frontend/src/pages/StudentRoomPage.jsx` | Toggle, persistence, detectors, socket throttling, toasts, viewport wiring |
| `frontend/src/components/AudioOnlyViewport.jsx` | Status banner, transcript panel, poll HUD card |
| `frontend/src/lib/mediaStreamControl.js` | Video/audio track enable/disable |
| `frontend/src/lib/responseVault.js` | Offline queue + reconnect sync |
| `backend/src/index.js` | `transcription:chunk` owner-to-room relay |
| `frontend/src/pages/RoomDetailPage.jsx` | Teacher-side emission of `transcription:chunk` |

## Testing

- `frontend/src/__tests__/AudioOnlyMode.test.jsx` — 7 cases: toggle + persistence, reload
  persistence, reconnect-probe auto-switch (2 disconnects no-op, 3rd switches + toast),
  live transcript streaming, poll HUD answering with haptics, Response Vault sync, and
  media track control.
- Run with `npm test --workspace=frontend` (or `npx jest` inside `frontend/`).

## Manual demo recipe

1. `node backend/scripts/seed_dev.js` creates `teacher@spandan.local` /
   `student@spandan.local` (password `Password123!`).
2. Start backend (`node backend/src/index.js`, port 3001) and frontend
   (`npx vite`, port 5173; app served under `/spandan`).
3. As teacher: `POST /api/rooms` with `settings.mode = "video"` and a YouTube URL, then
   `POST /api/questions` for a poll.
4. As student: join by room code. A teacher-side socket client (authenticated with the
   teacher JWT) can emit `transcription:chunk` and `question:start` to stream transcript
   text and launch the poll; killing/restarting the backend three times inside a minute
   demonstrates the reconnect probe.

## Known limitations

- The Network Information API detector is inert on Safari/Firefox (API absent); the
  reconnect probe covers those browsers.
- The probe reacts to connection loss, not to measured throughput; a slow-but-stable link
  will not trip it.
- YouTube iframe audio cannot be separated from its video bytes client-side; "audio only"
  hides the player rather than requesting an audio-only stream from YouTube.
