# Teacher Evaluation Profiles — Context

## Existing Analytics Architecture

### Backend (Node.js / Express / Mongoose)
- **Entry**: `backend/src/index.js` — single Express app + Socket.IO server, Redis adapter for multi-instance. Auth on all `/api/*` routes except a small allowlist.
- **Models** (`backend/src/models/`):
  - `User.js` — `{ name, email, password, role: 'student'|'teacher' }`
  - `Room.js` — `{ name, teacher, code, isActive, endedAt, currentQuestion, settings: { … } }`
  - `RoomMember.js` — `{ roomId, studentId, joinedAt }` — **one row per (room, student), created on join**.
  - `Question.js` — `{ roomId, type: MCQ|TF|MSQ, question, options[{text,isCorrect}], status, timeToAnswer, points, … }`
  - `Response.js` — `{ roomId, questionId, studentId, selectedOption|selectedOptions, isCorrect, responseTime, points, createdAt }`
  - `Transcript.js`, `PasswordResetToken.js` — unrelated.
- **Routes** (`backend/src/routes/`):
  - `auth.js`, `rooms.js`, `questions.js`, `responses.js`, `transcription.js`, `transcripts.js`.
  - `responses.js` is the analytics surface:
    - `GET /api/responses/leaderboard/:roomId` — ranked board
    - `GET /api/responses/stats/room/:roomId` — per-question counts + room totals (teacher)
    - `GET /api/responses/stats/student/:studentId` — per-student stats across all rooms
    - `GET /api/responses/room/:roomId/student/:studentId` — per-student breakdown for a single room
  - No analytics-specific frontend module: the SPA calls these directly via `fetch`/`lib/api.js` inside pages like `RoomResultsPage.jsx`.
- **Services** (`backend/src/services/`):
  - `leaderboardAgg.js` — single source of truth for ranked board (`computeRanked`). One `$group` over `Response` + one batched User lookup → safe for 500–1000 students.
  - `resultsSnapshot.js` — caches a per-room snapshot in Redis when the room ends (single-flight, transparent miss → direct-compute fallback). Builds leaderboard + per-student payload + per-question stats in ~5 DB ops for the whole room.
  - Other: `responseBuffer.js`, `generationQueue.js`, `roomService.js`, `questionService.js`, `samagamaService.js`, `passwordService.js`, `authService.js`, `emailService.js`.

### Existing indexes (already in place; we reuse, not duplicate)
- `Response`: `{roomId:1, questionId:1, studentId:1}` unique; `{roomId:1, studentId:1, points:-1}`; `{studentId:1}`.
- `RoomMember`: `{roomId:1, studentId:1}` unique; `{roomId:1}`; `{studentId:1}`.
- `Question`: `{roomId:1, status:1, createdAt:-1}`.
- `Room`: `{teacher:1, createdAt:-1}`.

The existing `{roomId:1, studentId:1, points:-1}` index on `Response` already serves any "aggregate by student within a room" query (covers the `$match: {roomId}` + `$group: {_id: '$studentId'}` shape we need).

### Frontend (React / Vite / React Router v6 / Zustand)
- Pages in `frontend/src/pages/`: `AuthPage`, `DashboardPage` (teacher), `StudentDashboard`, `CreateRoomPage`, `JoinRoomPage`, `ManageRoomPage`, `RoomDetailPage` (teacher live), `StudentRoomPage` (student live), `RoomHistoryPage`, `RoomResultsPage`, `ProfilePage`, `ResetPasswordPage`.
- Components in `frontend/src/components/`: `Sidebar`, `Leaderboard`, `RoomSettingsModal`, etc.
- Services in `frontend/src/services/`: raw `fetch` + token via `useAuthStore.getState().token` or `lib/api.js`.
- Routing in `frontend/src/App.jsx`, gated by `<ProtectedRoute allowedRoles={[…]}>`. **No existing `/teacher/evaluation*` route or related component.**

---

## Existing Attendance Flow — Phase 1 Granularity Finding

`backend/src/models/RoomMember.js` — full schema:
```
{ roomId, studentId, joinedAt }
```

There is **no `leftAt`, no per-session `duration` field, no per-question "present at time T" log, no presence heartbeat**. Grep for `leftAt`, `leaveRoom`, `attendance`, `duration`, `present`, `absent` across the codebase returns zero matches.

What is therefore actually stored for attendance:
- **Binary join status**: a `RoomMember` row exists iff the student joined this session. This is the only available signal.
- The time of joining (`joinedAt`) is stored.

**What is NOT stored:**
- When the student left (no socket-disconnect duration is recorded anywhere).
- Whether the student was present at any given point after `joinedAt` (no periodic heartbeat, no quiz-by-quiz presence log).
- Total session length per student (no per-student denominator).

**Implication for this feature.** The brief's example "Attendance × 0.20" with "90 out of 115 minutes present" cannot be computed honestly from existing data. Per the brief's Phase 1 instruction:

> "If only a coarser signal exists, **stop and report this as a gap** rather than approximating or inventing a duration calculation that isn't backed by real stored data. Do not fabricate a 'minutes present' figure from data that doesn't actually support it."

We do **not** fabricate a duration. We expose attendance at the granularity actually stored: **Session Participation** = 1.0 if the student joined (has a `RoomMember` row), 0.0 otherwise. This is the honest, available signal. Teachers are told in the criteria UI exactly what the criterion means (e.g. "Did this student join the session?"), so they can decide whether to weight it given the binary nature.

Out-of-scope per the brief — adding a presence/duration collection is not done here.

---

## Existing Quiz Analytics

Quiz analytics reuse `Response` for everything:

- Per-question class stats — already aggregated server-side in `GET /api/responses/stats/room/:roomId` (one `$group` by `(questionId, selectedOption)`).
- Per-student stats — `GET /api/responses/stats/student/:studentId`, plus per-room per-student in `GET /api/responses/room/:roomId/student/:studentId` (uses `resultsSnapshot` cache when room is ended).
- Ranked leaderboard — single source `computeRanked(roomId)` in `services/leaderboardAgg.js`, shared by live socket + results page + snapshot cache.

Each `Response` row stores `selectedOption|selectedOptions`, `isCorrect`, `responseTime`, `points`, `createdAt`. `points` is already time-decayed at submit time (`isCorrect ? maxPoints × max(0.1, (tta − responseTime)/tta) : 0`).

---

## Existing Teacher Analytics

There is no single dedicated "Teacher Analytics" page; teacher analytics are rendered inline on existing surfaces:

- `frontend/src/pages/DashboardPage.jsx` — overview cards (rooms, polls, responses) + room list.
- `frontend/src/pages/RoomDetailPage.jsx` — live session controls for the teacher (questions, transcription, etc.).
- `frontend/src/pages/RoomResultsPage.jsx` — post-session results. Pulls data from the analytics routes above and renders the per-question analysis + per-student leaderboard.

Per the brief, this feature must **integrate into the existing Teacher Analytics experience**, not create a new module. Concretely: a profile-management page reachable from the existing teacher sidebar (alongside Dashboard / Create Room / Manage Room / Room History) and an "Apply Profile" CTA on `RoomResultsPage` (since that is the post-session analytics surface for a teacher).

---

## Affected Models / Services / APIs / Frontend

| Layer | Element | Impact |
|---|---|---|
| **Models (new)** | `EvaluationProfile` | New. Single source for teacher-authored profiles. |
| **Routes (new)** | `routes/evaluationProfiles.js` | New. CRUD + duplicate + apply. Mounted at `/api/evaluation-profiles`. |
| **Services (new)** | `services/evaluationCriteria.js` | New. Single source of truth for the criteria registry (key + label + the aggregate that produces it). |
| **Services (new)** | `services/evaluationService.js` | New. Pure aggregate computation — produces per-student scores for a `(roomId, profile)` pair. **No per-student loop in app code.** |
| **Frontend pages (new)** | `pages/EvaluationProfilesPage.jsx` | New. Profile list, create / edit / duplicate / delete, preview. |
| **Frontend components (new)** | `components/EvaluationProfileFormModal.jsx` | New. Form for criteria + weights + name, with live 100% validation. |
| **Frontend components (new)** | `components/EvaluationScoresModal.jsx` | New. Per-student score table (used by both Preview and Apply). |
| **Frontend services (new)** | `services/evaluationProfileService.js` | New. API wrapper using `lib/api.js` convention. |
| **Modified** | `backend/src/index.js` | Mount the new route. |
| **Modified** | `frontend/src/App.jsx` | New protected route `/teacher/evaluation-profiles`. |
| **Modified** | `frontend/src/components/Sidebar.jsx` | Add menu item. |
| **Modified** | `frontend/src/pages/RoomResultsPage.jsx` | Add "Apply Evaluation Profile" section (button → modal → results table). |

Nothing existing is removed or renamed.

---

## Integration Strategy

1. **Criteria are discovered, not invented.** All available criteria live in `services/evaluationCriteria.js`. The list is exposed via `GET /api/evaluation-profiles/criteria` so the frontend never hardcodes it. Adding a new criterion requires only changing that one file (one source of truth) + writing the corresponding `aggregate` projection.
2. **Profile CRUD is per-teacher.** A profile belongs to a `User`; teacher sees only their own.
3. **Apply is a computation, not a separate persisted artifact.** `POST /api/evaluation-profiles/:id/apply/:roomId` returns the per-student score array. We do not create a new collection to hold evaluation runs — that would be duplicate analytics storage. The same path is used by "Preview" and "Apply" — one source of truth, identical numbers, no risk of divergence.
4. **Weighted linear combination only.** No scripting, no expression builder. Each criterion value is normalized to `[0, 1]` in the aggregate; final score is a dot product of weights with those values.

---

## Feature Impact Analysis

- **Performance / scalability**: The hot path is `computeScoresForRoom(profile, roomId)`. It issues (a) one `Response.aggregate` over `{ roomId }` grouped by `studentId` — covered by the existing `{roomId:1, studentId:1, points:-1}` index — and (b) one `RoomMember.find({ roomId })` for the join roster — covered by the existing `{roomId:1}` index. Total O(N) work where N = number of responses in the room; no per-student loop. For 1000 students × ~10 responses ≈ 10k documents, the aggregate returns ≤1000 rows and the merge is trivial.
- **Regression**: All existing routes are unchanged. Adding a new mount point at `/api/evaluation-profiles` does not affect request routing elsewhere. No existing model field is renamed or removed. No existing service has new dependencies.
- **Backward compatibility**: All additions; no breaking changes.
- **Failure modes**: an invalid profile is rejected at save by server-side validation (weights must sum to 1.0 ±0.001). The aggregate is wrapped in try/catch and returns a clear error message.

---

## Implementation Plan

| Area | Decision |
|---|---|
| **Frontend** | New page `EvaluationProfilesPage.jsx`, new modals `EvaluationProfileFormModal` (criteria checkboxes + weight sliders with live 100% validation) and `EvaluationScoresModal` (reused for Preview and Apply — same payload). New route + sidebar entry. Apply CTA on `RoomResultsPage`. |
| **Backend** | New model `EvaluationProfile`. New route mounted at `/api/evaluation-profiles`. New services `evaluationCriteria` (registry) and `evaluationService` (aggregate). |
| **Repositories / persistence** | Single new Mongo collection. No modifications to `Response`, `RoomMember`, `Question`, `Room`, `User`. No new joins; no new migrations. |
| **APIs** | `GET /api/evaluation-profiles/criteria`, `GET /api/evaluation-profiles`, `POST /api/evaluation-profiles`, `PUT /api/evaluation-profiles/:id`, `DELETE /api/evaluation-profiles/:id`, `POST /api/evaluation-profiles/:id/duplicate`, `POST /api/evaluation-profiles/:id/apply/:roomId`. All teacher-only. |
| **Validation** | Name required (1–100 chars). At least one criterion selected. Weights (per criterion) ≥ 0. Sum of weights must equal 1.0 ± 0.001. All criteria must come from the registered criteria list. All-saved validation enforced server-side; client-side mirrors it so Save is disabled until the profile is valid. |
| **Testing** | Existing tests untouched. Add pure-logic tests for weight validation + score normalization (mirroring `Leaderboard.test.js`). |
| **Integration** | Routes use existing `authenticate` + `authorize('teacher')` middleware. Frontend uses the existing `lib/api.js` convention. No new auth code. |
| **Backward compatibility** | Strictly additive. No field is renamed. No existing endpoint changes behavior. |
| **Risk assessment** | Main risks: (a) the criteria list might feel sparse to teachers given the binary attendance signal — mitigate by being explicit in the UI about what each criterion means; (b) score semantics for time-based metrics (avg response time) — handled by inverting and clamping; (c) large rooms — handled by reusing the existing indexed aggregate pattern. |
| **Scalability requirement (mandatory)** | **Computed in one room-scoped `$group` aggregate** — never a per-student loop in app code. Existing index `{roomId:1, studentId:1, points:-1}` covers the query. Preview and Apply call the same `computeScoresForRoom` function (one source of truth). For a room of ~1000 joined students with ~10 responses each, the aggregate returns ≤1000 rows; we never load all raw responses into memory. |

---

## Prerequisite / Gap Report

- **Attendance granularity** (per Phase 1): **Session Participation** is offered at the granularity actually stored — binary (1.0 if joined, 0.0 otherwise). Teachers see the exact meaning in the criterion UI. A finer "minutes present" metric would require new data collection (out of scope per the brief). **Reported as a prerequisite gap.**
- All other criteria (Quiz Accuracy, Questions Attempted, Correct Responses, Incorrect Responses, Average Response Time, Total Points Earned, Session Participation) are available at sufficient granularity from `Response` + `RoomMember` and are supported.
