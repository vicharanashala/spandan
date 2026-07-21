# Spandan - Workspace Context & Health Report

> **Last Updated:** July 8, 2026
> **System Status:** 🟡 Warning (Tests Passing, Build Successful, but Critical Bugs & Vulnerabilities Present)

---

## 📋 1. Project Overview

**Spandan** is a real-time polling and question generation platform designed for classroom environments and presentations. It enables teachers to create rooms, launch live multiple-choice (MCQ) or multiple-selection (MSQ) questions, and receive responses from students in real time with live leaderboard updates.

### Key Capabilities
*   **Authentication & Access Control**: Role-based access for Teachers (room/question management) and Students (participating in rooms).
*   **AI-Powered Question Generation**: Leverages Whisper audio transcription services and large language models (LLM providers like Minimax, OpenAI, Anthropic, Google) to automatically generate quiz questions based on live transcripts.
*   **Real-time Interaction**: Powered by Socket.IO for immediate question delivery, answer submission, and scoring.
*   **Score Calculations**: Features a time-decay points formula that rewards quick responses.
*   **Static Asset Delivery**: Hosted behind a reverse-proxy and static server (`server.js`) on port `5002` that routes traffic to backend and frontend services.

---

## 🗂️ 2. Codebase Structure

The workspace is organized as a monorepo containing a React-based frontend and an Express-based backend.

```
c:/Users/ssaur/Desktop/span/spandan/
├── backend/               # Express API and transcription server
│   ├── src/
│   │   ├── __tests__/     # Jest unit and integration tests (72 tests)
│   │   ├── middleware/    # Auth (JWT) and request validation
│   │   ├── models/        # Mongoose schemas (User, Room, Question, Response, etc.)
│   │   ├── routes/        # Router configuration for Auth, Rooms, Questions, etc.
│   │   ├── services/      # Business logic (Samagama SSO, Auth, Rooms, Emails)
│   │   ├── utils/         # Helper functions (Sanitization, etc.)
│   │   ├── index.js       # Main backend entry point (Port 3001)
│   │   └── transcriptionServer.js # Standalone WS Transcription Server (Port 3002)
│   ├── package.json       # Backend configuration & dependencies
│   └── .env.example       # Template for backend secrets and configuration
│
├── frontend/              # Vite-powered React client application
│   ├── src/
│   │   ├── __tests__/     # Jest components & store tests (32 tests)
│   │   ├── components/    # Reusable UI elements
│   │   ├── pages/         # Page modules (Teacher/Student Dashboards, Login)
│   │   ├── stores/        # Zustand state management stores
│   │   └── themes.css     # Dark/Light CSS design tokens
│   ├── package.json       # Frontend configuration & dependencies
│   ├── vite.config.js     # Dev server configuration with dynamic proxy settings
│   └── .env.example       # Template for client-side environment configs
│
├── dist/                  # Built static production client files (generated)
├── server.js              # Monorepo root static server and API/Socket proxy (Port 5002)
├── package.json           # Monorepo root package management
├── README.md              # Main project description and instructions
├── TODO.md                # Task list and resolved issues logs
├── bug.md                 # Technical breakdown of open codebase bugs
└── TESTING_PIPELINE_LOG.md# Pipeline setup documentation and history log
```

---

## ⚡ 3. Scripts & Development Workflow

To operate the monorepo, the following npm scripts are configured in the root:

| Command | Action | Location |
| :--- | :--- | :--- |
| `npm run install:all` | Installs root, frontend, and backend packages | Root |
| `npm run dev` | Starts frontend (Vite) and backend concurrently | Root |
| `npm run build` | Builds the frontend static production bundle into `/dist` | Root |
| `npm run dev:backend` | Starts the backend service directly | Root |
| `npm run dev:frontend` | Starts the frontend dev server directly | Root |
| `npm test` | Runs the test suites | Workspaces |

---

## 🧪 4. Component Verification & Diagnostic Report

We performed checks on the build integrity, unit tests, and integration pipelines. Here is the verified report:

### 🟢 Test Suites Status: PASS (104/104 Tests)
Both workspaces are fully tested with Jest:

*   **Backend (72 Tests Passed)**:
    *   `passwordService.test.js`: Validates hex token reset flow, expiration, and normalization.
    *   `msqCorrectness.test.js`: Validates MCQ/MSQ correctness formulas and time-decay scores.
    *   `roomsRoutes.test.js`: Validates schema checks, permissions, and validation middleware.
    *   `authRoutes.test.js`: Validates input parsing, registration rules, and login endpoints.
    *   `authMiddleware.test.js`: Validates token signing, headers, and authorization roles.
*   **Frontend (32 Tests Passed)**:
    *   `authStore.test.js`: Validates session stores, persistence configuration, and token clearance.
    *   `Leaderboard.test.js`: Validates rank tie-breakers, accuracy scores, and student filtering boundaries.

### 🟢 Production Compilation: SUCCESS
*   Vite builds the production package into `spandan/dist/` in **6.68 seconds**.
*   CSS components and JavaScript chunks compress successfully (`dist/assets/index-*.js` ~400.59 kB).
*   Monorepo proxy (`server.js`) resolves files out of the `/dist` directory.

### 🟢 Environment Configuration: VERIFIED
*   **Base Path Routing**: `VITE_BASE_PATH` is empty in `frontend/.env` for local development, which successfully triggers the dynamic proxy configuration in `vite.config.js`. This resolves fallback issues that previously caused `"Unexpected end of JSON input"` failures.
*   **Monorepo Proxying**: Port `5002` acts as a proxy:
    *   `localhost:5002/api/*` ➡️ `localhost:3001/api/*`
    *   `localhost:5002/socket.io/*` ➡️ `localhost:3001/spandan/socket.io/*`

---

## ⚠️ 5. Open Codebase Issues & Security Vulnerabilities

Although the tests pass and components build correctly, there are several **critical logic flaws and security vulnerabilities** currently present in the codebase. These are documented in `bug.md` and need immediate attention:

### 🔴 1. SSO Authentication Bypass (Account Takeover)
*   **Vulnerability**: The endpoint `/api/auth/samagama-auto-login` accepts raw user info (`email`, `name`, `isAdmin`) from the client without verifying the token signature.
*   **Risk**: Critical. Any user can spoof a request using curl/Postman to log in as an administrator by simply passing an admin's email.
*   **Status**: Unpatched.

### 🔴 2. Student Cheat Vulnerability (Answer Key Leak)
*   **Vulnerability**: The questions fetch route `GET /api/questions?roomId=xxx` queries `Question.find({ roomId })` directly.
*   **Risk**: High. Students enrolled in a room can view all questions (including unlaunched ones) and extract the correct answer choices by inspecting the options array (`isCorrect` key is sent to the client).
*   **Status**: Unpatched.

### 🔴 3. Server Crash on Student History Page (`TypeError`)
*   **Vulnerability**: In `roomService.js:getRoomsByStudent`, the populated `roomId` field can return `null` if a teacher deleted a room that a student attended. The code maps `r.roomId._id.toString()` without a null check.
*   **Risk**: High. Accessing the student dashboard after a room is deleted triggers a server crash (`TypeError: Cannot read properties of null (reading '_id')`).
*   **Status**: Unpatched.

### 🔴 4. Database Leak (Orphaned Collections on Room Deletion)
*   **Vulnerability**: Deleting a room removes the Room document, but leaves related collections (`RoomMember`, `Question`, `Response`, `Transcript`) orphaned in MongoDB.
*   **Risk**: Medium. Causes database bloat and storage leaks over time.
*   **Status**: Unpatched.

### 🔴 5. Response Leak (Access Control Bypass)
*   **Vulnerability**: Route `GET /api/responses?roomId=xxx` checks if a student is querying another student's data *only if* `studentId` is supplied. If `studentId` is omitted, the check is skipped and it returns all responses for the room.
*   **Risk**: High. Any student can inspect all submissions, scores, and timestamps of all classmates in a room.
*   **Status**: Unpatched.

### 🔴 6. Audio Decoders Mismatch in `transcriptionServer.js`
*   **Vulnerability**: The WebSocket transcription handler feeds base64 audio buffers directly to Whisper: `transcriber(audioBuffer, ...)`.
*   **Risk**: High. Whisper expects a normalized `Float32Array` of PCM audio samples, causing the transcription server to fail or crash when receiving client audio data.
*   **Status**: Unpatched.

---

## 📈 6. Recommendations & Next Steps

1.  **Resolve Security Vulnerabilities**:
    *   Verify the SSO token on the backend by calling the Samagama authentication endpoint directly.
    *   Strip the `isCorrect` markers from question options when sending queries to students.
    *   Add null checking filter to `getRoomsByStudent` before mapping room IDs.
    *   Implement cascading deletes for `RoomMember`, `Question`, `Response`, and `Transcript` when a room is deleted.
    *   Enforce `filter.studentId = currentUser._id` on `GET /api/responses` for student users.
    *   Integrate audio decoding helpers in the WebSocket server handler to convert audio buffers to PCM `Float32Array` before processing with Whisper.
2.  **Modernize Backend Services**:
    *   Configure the backend on port `3001` to run under PM2 (currently only the static proxy is configured under PM2).
    *   Add automated integration testing for the database connections using a memory-based database like `mongodb-memory-server` in the CI pipeline.
