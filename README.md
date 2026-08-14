# Spandan — Real-Time Polling & Question Generation for Classrooms

> **What is Spandan?** A teacher records audio of their lecture (or uploads it
> later). Whisper transcribes it. Spandan auto-generates multiple-choice and
> open-ended questions from the transcript and pushes them live to every
> student's phone in the room. Students answer in real time. Teachers see a
> leaderboard, confusion spikes, and can re-explain the moments the class
> actually got lost on.
>
> Spandan is a **post-class polling tool** (not a live lecture platform). For
> live audio/video, pair it with Zoom / Google Meet.

**Version:** 0.8.0

---

## Table of Contents

- [What Spandan Does](#what-spandan-does)
- [Features](#features)
- [Doubt-Anchored Polling (NEW)](#doubt-anchored-polling-new)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Detailed Setup Guide](#detailed-setup-guide)
- [Project Structure](#project-structure)
- [How to Use](#how-to-use)
  - [As a Teacher](#as-a-teacher)
  - [As a Student](#as-a-student)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Known Issues / Status](#known-issues--status)
- [Roadmap](#roadmap)
- [License](#license)

---

## What Spandan Does

1. **Teacher records or uploads audio** of a class session (one-click in-app recording via `getUserMedia` + `MediaRecorder`, or upload a file).
2. **Whisper transcribes** the audio in 10-second chunks, producing timestamped segments with speaker turns.
3. **AI generates questions** (multiple-choice and open-ended) automatically from each transcript segment. Local heuristic fallback if the AI provider is down.
4. **Students join the room** via a 6-character code on their phones. No app install — just a URL.
5. **Live question delivery** via Socket.IO. Students answer in real time. Teachers see response counts update instantly.
6. **Doubt-Anchored Polling** — students can flag "I'm lost" with one tap, anchored to the transcript segment they were on. Teachers see **confusion spikes** (segments crossing `mean+2σ` or a 3-student floor) and the actual transcript snippet they need to re-explain.
7. **Leaderboard** gamifies participation. **Theme toggle** for dark / light mode. **JWT auth** with role-based access (Teacher / Student).

The point: turn one-way lectures into measurable, adaptive feedback loops.

---

## Features

- 🔐 **Authentication** — JWT-based login with role-based access (Teacher / Student)
- 🎯 **Room Management** — Create, join, and manage live polling sessions with 6-character codes
- ❓ **Auto Question Generation** — Whisper transcription → AI-generated MCQ + open-ended questions, segment-by-segment
- 📊 **Real-time Results** — Live response tracking via Socket.IO
- 🚩 **Doubt-Anchored Polling** *(new — see below)* — anonymous "I'm lost" button anchored to transcript segments
- 🎙 **Whisper Transcription** — in-browser (`transformers.js`) audio transcription for question generation
- 🌗 **Theme Toggle** — Dark and light mode
- 📱 **Responsive** — Works across phone / tablet / desktop
- 🏆 **Leaderboard** — Real-time ranking by points earned

---

## Doubt-Anchored Polling (NEW)

Students press a squishy flag in the top-right corner when they lose the
thread. The teacher sees counts per transcript segment and a list of
**confusion spikes** — segments where mark-count crosses a floor (3) or
the room's statistical threshold (mean + 2σ). Each spike card carries
the actual transcript snippet so the teacher can re-explain that exact
moment.

### What was added

| Layer | File | What it does |
|-------|------|--------------|
| Backend | `backend/src/models/DoubtSignal.js` | Mongoose schema (roomId, studentHash, segmentIndex, transcriptOffsetMs, retracted, createdAt) |
| Backend | `backend/src/services/doubtService.js` | `hashStudent`, `recordDoubt`, `retractLatestDoubt`, `getDoubtCountsBySegment`, `detectSpikes` |
| Backend | `backend/src/routes/doubts.js` | 5 REST endpoints (`POST /`, `POST /:id/retract`, `GET /room/:roomId`, `GET /room/:roomId/spikes`, `GET /:id`) |
| Backend | `backend/src/index.js` | Mounted `/api/doubts/*` + `socket.on('doubt:signal')` handler |
| Frontend | `frontend/src/components/ImLostButton.jsx` | Squishy top-right button, status colors, audio feedback, socket-first + REST fallback |
| Frontend | `frontend/src/components/ConfusionSpikePanel.jsx` | Teacher dashboard — bar chart, spike cards, polling every 5s + socket push |
| Frontend | `frontend/src/lib/sounds.js` | Web Audio API synth (3 cues: tap, send, deny) |
| Frontend | `frontend/src/lib/api.js` | New `doubtApi` namespace |
| Docs | `docs/doubt-anchored-polling.md` | Full design doc — privacy model, anti-spam math, spike detection math, deferred work, open questions |
| Tests | `backend/src/__tests__/doubtService.test.js` | 28 unit tests — hash determinism, anonymization, anti-spam, retract, spike detection |
| Infra | `backend/jest-mongodb.config.js` | Wires `@shelf/jest-mongodb` preset for in-memory MongoDB tests |

### Privacy model

- **Anonymization**: `studentHash = HMAC-SHA256(roomSalt, userId)` — raw userId is never stored
- **Per-room salt**: generated lazily on first signal, **rotated when the room ends**
- **Anti-spam**: 30-second window per (room, student); server returns `retryAfterMs` on 429
- **Retraction**: 60-second window — student can undo their last signal
- **No audio or video** is ever captured from students. The button is text-only.

### Spike detection math

A segment is flagged as a **confusion spike** if EITHER:
- `markCount ≥ minMarkCount` (= 3, configurable in `doubtService.js`), OR
- `markCount ≥ roomAvg + 2σ` where `roomAvg` and `σ` are computed across all segments in the room

This means both very small rooms (where σ is noisy) and very large rooms (where σ is informative) surface meaningful spikes. Defaults err on surfacing more signals rather than fewer — the teacher's time is the constraint, not the alert budget.

### Why this matters

Traditional polling tells the teacher "what % got Q3 right." Doubt-Anchored Polling tells the teacher "**at the moment you explained the Calvin cycle, 8 students got lost**" — and gives them the transcript snippet to re-explain. It's the difference between a gradebook and a teaching tool.

---

## Architecture

```
                ┌────────────────┐
                │  Browser (T)   │ ← Teacher records audio
                └────────┬───────┘
                         │ MediaRecorder (10s chunks)
                         ▼
┌────────────────────────────────────────────────┐
│  Backend (Express + Socket.IO)                 │
│                                                │
│  POST /api/transcription                       │
│    → Whisper (transformers.js, in-browser)     │
│    → Transcript segment stored                 │
│                                                │
│  POST /api/questions/generate (per segment)   │
│    → MiniMax AI (api.minimaxi.chat)            │
│    → fallback to local heuristic generator     │
│                                                │
│  POST /api/doubts                              │
│    → studentHash = HMAC(roomSalt, userId)      │
│    → store DoubtSignal { segmentIndex, ... }   │
│    → emit doubt:new to room                    │
│                                                │
│  GET /api/doubts/room/:id/spikes               │
│    → aggregate by segment                      │
│    → mean+2σ or minMarkCount                   │
└──────────────────┬─────────────────────────────┘
                   │ Socket.IO + REST
                   ▼
┌────────────────────────────────────────────────┐
│  Browser (T) ← ConfusionSpikePanel            │
│  Browser (S) → ImLostButton (top-right)       │
└────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React, Vite, TailwindCSS, Zustand, Socket.IO Client, React Router |
| **Backend** | Node.js, Express, Socket.IO, MongoDB (Mongoose), Whisper (Transformers) |
| **Auth** | JWT, bcryptjs |
| **AI** | Xenova Transformers (Whisper for transcription), MiniMax for question generation |
| **Testing** | Jest + in-memory MongoDB (`@shelf/jest-mongodb`) |

---

## Quick Start

```bash
# 1. Install all dependencies
npm run install:all

# 2. Make sure MongoDB is running locally
#    Windows: usually auto-starts as a service, otherwise:
#    mongod --dbpath C:\data\db

# 3. Start backend (port 3001)
cd backend
npm run dev

# 4. Start frontend (port 5173, base path /spandan)
cd ../frontend
npm run dev

# 5. Open http://localhost:5173/spandan in your browser
```

For the Doubt-Anchored Polling feature specifically:

```bash
cd backend
npx jest src/__tests__/doubtService.test.js   # 28 unit tests
npm test                                      # all 100 tests
```

---

## Detailed Setup Guide

### Prerequisites

- **Node.js** ≥ 18 (tested on 20.x and 24.x)
- **MongoDB** ≥ 6.0 running locally on `mongodb://localhost:27017`
- **Git** (you're here, so ✓)
- A modern browser with `getUserMedia` support (Chrome, Edge, Firefox)

### Step 1 — Clone and install

```bash
git clone https://github.com/Rashmirisha/Test-spandan.git
cd spandan

# Install both monorepo packages
npm run install:all
```

This installs root + `frontend/` + `backend/` deps. Whisper model weights (~150MB) download on first use.

### Step 2 — Configure environment

Create `backend/.env`:

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/spandan
JWT_SECRET=your-secret-key-change-me
MINIMAX_API_KEY=your-minimax-key        # optional — local fallback works without it
```

Create `frontend/.env`:

```env
VITE_BASE_PATH=/spandan
VITE_API_BASE_URL=http://localhost:3001/api
VITE_SOCKET_URL=http://localhost:3001
```

### Step 3 — Seed test users (optional)

The `backend/.env` includes seed credentials on first start. Test logins (all `Test1234!`):

| Email | Role |
|-------|------|
| `rashmi@spandan.local` | Teacher (primary) |
| `test@spandan.local` | Teacher |
| `student@spandan.local` | Student |
| `student2@spandan.local` | Student |

### Step 4 — Run

```bash
npm run dev   # both frontend + backend in parallel
```

Then open **<http://localhost:5173/spandan>**.

### Common setup pitfalls

- **PowerShell BOM**: If you save `.jsx` / `.css` / `.js` files from PowerShell, use `[System.IO.File]::WriteAllBytes($p, $bytes)` or `WriteAllText($p, $c, [System.Text.UTF8Encoding]::new($false))` — never `Set-Content` or `Out-File -Encoding utf8` (they add UTF-8 BOM which breaks Vite/esbuild).
- **Port 3001 in use**: change `PORT` in `backend/.env`.
- **Vite config changes don't HMR**: kill + restart `npm run dev` after editing `vite.config.js`.
- **MongoDB not running**: `mongod --dbpath C:\data\db` in another terminal.

---

## Project Structure

```
spandan/
├── docs/
│   └── doubt-anchored-polling.md          # Full design doc for the new feature
├── frontend/                              # React app (Vite + Tailwind + Zustand)
│   ├── .env                               # VITE_BASE_PATH, VITE_API_BASE_URL
│   └── src/
│       ├── components/
│       │   ├── ImLostButton.jsx           # NEW — squishy top-right student button
│       │   ├── ConfusionSpikePanel.jsx    # NEW — teacher spike dashboard
│       │   └── ... (other components)
│       ├── pages/
│       │   ├── RoomDetailPage.jsx         # Teacher's room view (mounts ConfusionSpikePanel)
│       │   ├── StudentRoomPage.jsx        # Student's room view (mounts ImLostButton)
│       │   └── ... (other pages)
│       ├── stores/                        # Zustand stores (auth, socket, etc.)
│       ├── lib/
│       │   ├── api.js                     # REST client (incl. doubtApi namespace)
│       │   └── sounds.js                  # NEW — Web Audio API cues
│       └── index.css                      # Global styles (incl. .imlost-* and .csp-*)
├── backend/                               # Express + Socket.IO + Mongoose
│   ├── jest-mongodb.config.js             # NEW — in-memory MongoDB for tests
│   ├── .env                               # PORT, MONGODB_URI, JWT_SECRET, MINIMAX_API_KEY
│   └── src/
│       ├── index.js                       # Entry point (mounts all routes + socket handlers)
│       ├── models/
│       │   ├── DoubtSignal.js             # NEW — doubt signal schema
│       │   ├── Room.js                    # Room schema (incl. doubtSalt field)
│       │   └── ... (User, Question, Response, Transcript)
│       ├── routes/
│       │   ├── doubts.js                  # NEW — 5 endpoints for doubt signaling
│       │   └── ... (auth, rooms, questions, responses, transcripts, transcription)
│       ├── services/
│       │   ├── doubtService.js            # NEW — core logic (hash, anti-spam, spikes)
│       │   ├── localQuestionGenerator.js  # NEW — heuristic AI fallback
│       │   ├── questionService.js         # MiniMax + fallback wrapper
│       │   └── ... (auth, etc.)
│       └── __tests__/
│           ├── setup.cjs                  # Jest bootstrap
│           └── doubtService.test.js       # NEW — 28 unit tests
├── package.json                           # Monorepo root scripts
└── README.md                              # This file
```

---

## How to Use

### As a Teacher

1. **Sign up** at `/spandan/register` or log in with `rashmi@spandan.local` / `Test1234!`
2. **Create a room** from the dashboard — you'll get a 6-character room code
3. **Open the room** and click 🎙 **Record** — your mic starts recording in 10-second chunks
4. **Whisper transcribes** each chunk live, and the AI generates questions from each segment
5. **Share the room code** with students
6. **Watch the Confusion Spike panel** — segments where students got lost will appear in red with the transcript snippet
7. **Re-explain** the highlighted moment, mark questions as approved, advance to next

### As a Student

1. **Log in** at `/spandan/login`
2. **Join a room** with the 6-character code
3. **Answer questions** as they appear in real time
4. **Press the red flag** in the top-right corner any time you're confused — it's anonymous
5. **Check the leaderboard** to see your rank

> **Note**: You won't hear the teacher through Spandan. Pair it with Zoom / Google Meet for live audio. Spandan is for **after the lecture** — or in parallel with a live call.

---

## API Reference

### Doubt-Anchored Polling (new)

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/doubts` | `{roomId, segmentIndex, transcriptOffsetMs?}` | `{id, studentHash, createdAt}` or `{error: 'anti_spam', retryAfterMs}` |
| POST | `/api/doubts/:id/retract` | — | `{ok: true}` or `{error: 'nothing_to_retract' \| 'retract_window_expired'}` |
| GET | `/api/doubts/room/:roomId` | — | `[{id, segmentIndex, transcriptOffsetMs, retracted, createdAt}]` |
| GET | `/api/doubts/room/:roomId/spikes` | — | `[{segmentIndex, markCount, transcriptSnippet, threshold}]` |
| GET | `/api/doubts/:id` | — | `{id, segmentIndex, retracted, ...}` |

### Other endpoints

- `POST /api/auth/register` / `/api/auth/login` — JWT auth
- `POST /api/rooms` / `GET /api/rooms/:code` — Room CRUD
- `POST /api/questions` — Manual question creation
- `POST /api/transcription` — Whisper transcription upload
- `GET /api/responses/:roomId` — Response aggregation

Full request/response shapes are in the OpenAPI-style comments at the top of each route file.

---

## Environment Variables

### Backend (`backend/.env`)

| Var | Default | Required | Description |
|-----|---------|----------|-------------|
| `PORT` | `3001` | No | Express port |
| `MONGODB_URI` | `mongodb://localhost:27017/spandan` | Yes | MongoDB connection string |
| `JWT_SECRET` | (none — required in prod) | Yes (prod) | JWT signing secret |
| `MINIMAX_API_KEY` | (none) | No | MiniMax API key for question generation. If missing or invalid, falls back to local heuristic generator automatically. |

### Frontend (`frontend/.env`)

| Var | Default | Description |
|-----|---------|-------------|
| `VITE_BASE_PATH` | `/spandan` | Base path for Vite + React Router |
| `VITE_API_BASE_URL` | `http://localhost:3001/api` | Backend REST base |
| `VITE_SOCKET_URL` | `http://localhost:3001` | Backend Socket.IO endpoint |

---

## Testing

```bash
cd backend
npm test                                    # all 6 test suites, 100 tests
npm run test:coverage                       # with coverage report
npx jest src/__tests__/doubtService.test.js # just the doubt service tests (28)
```

The Doubt-Anchored Polling service has 28 unit tests covering:
- **Hash determinism** — same userId always produces same hash
- **Salt sensitivity** — different salts → different hashes
- **Anonymization** — raw userId never leaks to the database
- **Anti-spam** — 30s window enforced, `retryAfterMs` returned
- **Retraction** — 60s window, multi-student ownership safety
- **Aggregation** — distinct hash counting per segment
- **Spike detection** — mean+2σ + minMarkCount floor math, transcript snippet truncation

Tests use `@shelf/jest-mongodb` (in-memory MongoDB) — they don't touch your real database.

---

## Known Issues / Status

This is a working draft. Known limitations:

- 🐛 **Squishy animation** on `ImLostButton` is **not yet implemented** — the button uses CSS `:hover` and `:active` lift only. The spring-back overshoot animation was planned but not added in this iteration.
- 🐛 **Audio-quality vs concept confusion** — the single "I'm lost" button conflates "I can't hear the teacher" with "I don't understand the concept." A second 🔊 button would help but requires new aggregation logic and was deferred to keep this PR focused.
- 🐛 **Spike detection heuristic** — no benchmark calibration. Defaults err on surfacing more signals. May need tuning once real classroom data is collected.
- 🐛 **Mojibake history** — original repo had double-UTF-8-encoded mojibake throughout (`â·`, `ðŸ·`, `âšï¸`). We swept 3 files clean. **New files should be saved with `[System.IO.File]::WriteAllBytes` (PowerShell) or via Node — never `Set-Content` without `-Encoding utf8NoBOM`.**
- 🚧 **Mobile UX not formally audited** — tested on Chrome desktop only.
- 🚧 **Accessibility not formally audited** — keyboard navigation works but no screen-reader testing.

## Roadmap

What's planned next (in priority order):

1. **Squishy animation** on `ImLostButton` — proper spring physics
2. **Audio-quality signal separation** — second button "🔊 Can't hear"
3. **Per-question confusion badge** on `RoomResultsPage`
4. **Teacher annotations** — mark a spike as "explained" so it stops surfacing
5. **Differential privacy** — add noise to per-student aggregates to prevent reconstruction attacks
6. **Live audio** — embed a Daily.co / 100ms / LiveKit room for real-time voice (separate product decision; Spandan is currently post-class polling only)
7. **Feature 2: Adaptive Cognitive Friction Calibration** — stashed in `git stash` of the older `spandan` repo. Adds `ConfidencePulse` (per-student real-time confidence tracking), `AnxietyIndexPanel` (teacher view), `NormalizationToast` (UX cue that "it's normal to be confused right now").

---

