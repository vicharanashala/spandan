# Spandan — Team Battle Mode: Development Context

> This document centralizes all development context for the Collaborative Team Battle Mode feature.
> It maps how the feature integrates with the existing codebase and documents every new component.

---

## 1. Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│  Frontend (Vite + React, Port 5173 dev)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Zustand Stores                                      │  │
│  │  authStore ─ socketStore ─ roomStore ─ teamStore     │  │
│  └──────────────┬───────────────────────────────────────┘  │
│                 │ socket.io-client                          │
└─────────────────┼──────────────────────────────────────────┘
                  │  WebSocket + HTTP
┌─────────────────┼──────────────────────────────────────────┐
│  Root Proxy (server.js, Port 5002)                         │
│  Routes /api → :3001, /socket.io → :3001                   │
└─────────────────┼──────────────────────────────────────────┘
                  │
┌─────────────────┼──────────────────────────────────────────┐
│  Backend (Express + Socket.IO, Port 3001)                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Models: User, Room, Question, Response, RoomMember,  │  │
│  │         PasswordResetToken, **Team** (NEW)            │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ Services: roomService, responseService, questionSvc  │  │
│  │           **teamService** (NEW)                       │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ Routes: /auth, /rooms, /questions, /responses,       │  │
│  │         /transcription, /transcripts, **/teams** (NEW)│  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ Socket.IO handlers in index.js:                      │  │
│  │   authenticate, room:join/leave, response:submit     │  │
│  │   question:start/end, new_question, points:update    │  │
│  │   **team:join_channel** (NEW)                         │  │
│  │   **team:message** (NEW)                              │  │
│  │   **team:select_option** (NEW)                        │  │
│  │   **team:check_consensus** (NEW)                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                        ↕ Mongoose                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MongoDB (Atlas / local)                              │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## 2. New Files Created

| Layer | File | Purpose |
|-------|------|---------|
| **Backend Model** | `backend/src/models/Team.js` | Mongoose schema: name, roomId, members[], points, streakCount, avatar |
| **Backend Service** | `backend/src/services/teamService.js` | Team creation (random/serpentine/student-choice), late-joiner assignment, orphan cleanup |
| **Backend Route** | `backend/src/routes/teams.js` | REST API: POST /create, GET /:roomId, GET /my-team/:roomId, DELETE /:roomId |
| **Frontend Store** | `frontend/src/stores/teamStore.js` | Zustand: teams[], myTeam, teamMessages[], partnerChoices, consensusCelebration |
| **Frontend Component** | `frontend/src/components/TeamBattleSetup.jsx` | Teacher config panel: team size, grouping mode, create/reset |
| **Frontend Component** | `frontend/src/components/TeamDiscussionCanvas.jsx` | Student discussion view: option voting + partner overlays + chat |
| **Frontend Component** | `frontend/src/components/TeamTugOfWar.jsx` | Teacher live leaderboard: racing lanes + streak + consensus flash |
| **Frontend Component** | `frontend/src/components/TeamLobby.jsx` | Pre-game lobby: team cards grid + waiting indicator |

---

## 3. Modified Files

| File | Changes |
|------|---------|
| `backend/src/models/Room.js` | Added `settings.teamBattleActive` (Boolean) and `settings.teamBattleConfig` (teamSize, groupingMode) |
| `backend/src/models/index.js` | Added `Team` barrel export |
| `backend/src/middleware/validation.js` | Added `teamBattleConfigSchema` Zod schema |
| `backend/src/index.js` | Mounted `/api/teams` route, added token-bucket rate limiter, added 4 team socket handlers, modified `room:join` for late-joiner + spoofing protection, cleanup on disconnect |
| `frontend/src/stores/socketStore.js` | Added 7 team socket listeners + 4 team emit methods |
| `frontend/src/pages/RoomDetailPage.jsx` | Added Team Battle toggle button, TeamBattleSetup panel, conditional TeamTugOfWar leaderboard |
| `frontend/src/pages/StudentRoomPage.jsx` | Added team battle detection, TeamLobby display, conditional TeamDiscussionCanvas, consensus trigger |

---

## 4. Database Schema: Team Model

```javascript
{
  name:        String,       // e.g. "Whisper Wizards"
  roomId:      ObjectId,     // ref: 'Room'
  members:     [ObjectId],   // ref: 'User' (student IDs)
  points:      Number,       // team total points (server-calculated)
  streakCount: Number,       // consecutive consensus answers
  avatar:      String,       // emoji: '🧙‍♂️'
  createdAt:   Date,
  updatedAt:   Date
}

Indexes:
  { roomId: 1 }              // Fast room lookups
  { roomId: 1, members: 1 }  // Fast student→team lookups
```

---

## 5. Socket Event Map (Team Battle)

### Client → Server (Emitted)

| Event | Payload | Description |
|-------|---------|-------------|
| `team:join_channel` | `{ teamId }` | Join team's private socket room |
| `team:message` | `{ teamId, text }` | Send ephemeral chat message |
| `team:select_option` | `{ teamId, selectedOption }` | Sync option selection to partners |
| `team:check_consensus` | `{ roomId, questionId }` | Trigger consensus scoring check |

### Server → Client (Received)

| Event | Payload | Description |
|-------|---------|-------------|
| `team:message_received` | `{ studentId, studentName, text, timestamp }` | Chat message from teammate |
| `team:partner_selected` | `{ studentId, selectedOption }` | Partner's option choice overlay |
| `team:score_updated` | `{ teamId, points, streakCount, consensusBonus }` | Team score change (broadcast to room) |
| `team:consensus_success` | `{ teamId, bonusPoints, totalPoints }` | Consensus achieved (team-only) |
| `team:battle_started` | `{ roomId, teams, teamSize, groupingMode }` | Teams created by teacher |
| `team:battle_ended` | `{ roomId }` | Teams reset/deleted |
| `team:assigned` | `{ team }` | Late-joiner auto-assignment |
| `rate_limit_exceeded` | `{ message }` | Socket rate limit hit |

---

## 6. REST API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/teams/create` | Teacher | Creates teams (validates teamBattleConfigSchema) |
| `GET` | `/api/teams/:roomId` | Authenticated | List all teams for a room |
| `GET` | `/api/teams/my-team/:roomId` | Authenticated | Get student's own team |
| `DELETE` | `/api/teams/:roomId` | Teacher (owner) | Delete all teams, deactivate mode |

---

## 7. Security Safeguards (10 Rules)

| # | Rule | Implementation |
|---|------|---------------|
| 1 | **BOLA Guard** | `team:join_channel` verifies `Team.findOne({ _id: teamId, members: userId })` before `socket.join()` |
| 2 | **Zero-Trust Scoring** | Points calculated server-side from Response model data; `$inc` atomic updates |
| 3 | **Rate Limiting** | Token-bucket (5 tokens/sec) on `team:message`, `team:select_option`, `team:check_consensus` |
| 4 | **Atomic Transactions** | `Team.findByIdAndUpdate($inc)` for consensus scoring |
| 5 | **Orphan Cleanup** | After distribution, teams with < 2 members are merged into smallest other team |
| 6 | **Dropout Resilience** | Team member count from DB (not connected sockets); consensus checks against `team.members.length` |
| 7 | **Post-Submission Lock** | Frontend disables buttons; backend has unique index `{ roomId, questionId, studentId }` on Response |
| 8 | **Late-Joiner Catch-All** | `room:join` handler checks `teamBattleActive`, calls `assignLateJoiner()` to add to smallest team |
| 9 | **ObjectId Validation** | All socket handlers validate `mongoose.Types.ObjectId.isValid()` before DB queries |
| 10 | **Spoofing Protection** | `socket.roomCode` set on `room:join`; broadcasts use `socket.roomCode`, never `data.roomId` |

---

## 8. Team Creation Algorithms

### Random Mode
Fisher-Yates shuffle → round-robin distribution into `ceil(students/teamSize)` teams.

### Performance-Mixed Mode (Serpentine)
1. Query all students' Response accuracy
2. Sort best → worst
3. Serpentine distribute: fill team 0→N, then N→0, then 0→N...
4. Result: each team gets a mix of top and struggling students

### Student-Choice Mode
Creates empty team slots; students are assigned sequentially (same as random for now, can be extended to allow self-selection UI).

### Edge Cases
- **0 students** → Error thrown: "Cannot start Team Battle"
- **Students < teamSize** → Override teamSize to student count, create 1 team
- **Orphan teams (< 2 members)** → Dissolved and merged into smallest other team
- **Late joiners** → Auto-assigned to team with fewest members via `assignLateJoiner()`

---

## 9. Consensus Scoring Logic

```
When team:check_consensus fires:
  1. Fetch all Response docs for { roomId, questionId, studentId ∈ team.members }
  2. If responses.length < team.members.length → exit (not all answered)
  3. If ALL picked same option AND it's correct:
       → bonusPoints = sum(individual points) × 0.5
       → Team.findByIdAndUpdate({ $inc: { points: total + bonus, streakCount: 1 } })
       → Emit team:consensus_success + team:score_updated (consensusBonus: true)
  4. Else:
       → Team.findByIdAndUpdate({ $inc: { points: total }, $set: { streakCount: 0 } })
       → Emit team:score_updated (consensusBonus: false)
```

---

## 10. Frontend Component Hierarchy

```
RoomDetailPage (Teacher)
├── TopBar
│   ├── Room Code + Copy
│   ├── Segment Timer
│   ├── Question Timer
│   ├── Paste & Generate Button
│   ├── ⚔️ Team Battle Button (NEW) ← toggles TeamBattleSetup
│   ├── Create Q Button
│   ├── Settings Button
│   └── End Room Button
├── Recording + Transcription Row
├── Session Questions + Leaderboard Row
│   └── if teamBattleActive:
│       └── TeamTugOfWar (replaces Leaderboard)
└── TeamBattleSetup Panel (NEW, collapsible)

StudentRoomPage (Student)
├── Header
├── Connection Status Bar
├── if currentQuestion:
│   ├── if teamBattleActive && myTeam:
│   │   └── TeamDiscussionCanvas (NEW)
│   │       ├── Question Options (65%) with partner choice badges
│   │       └── Team Chat (35%)
│   └── else:
│       └── Standard Question Card (existing)
├── if !currentQuestion && teamBattleActive:
│   └── TeamLobby (NEW)
├── Past Questions Panel
└── Leaderboard Panel
```

---

## 11. State Flow: Team Battle Lifecycle

```
1. Teacher opens RoomDetailPage
2. Teacher clicks ⚔️ Team Battle button → TeamBattleSetup shows
3. Teacher configures teamSize, groupingMode → clicks "Create Teams"
   → POST /api/teams/create
   → Backend: createTeams() runs grouping algorithm
   → Backend: Room.settings.teamBattleActive = true
   → Backend: io.to(roomCode).emit('team:battle_started', { teams })
4. Students receive 'team:battle_started' → fetchMyTeam()
   → StudentRoomPage shows TeamLobby
5. Teacher launches a question (existing flow)
   → Students see TeamDiscussionCanvas instead of standard card
6. Students discuss in chat (team:message ↔ team:message_received)
7. Students see partner choices (team:select_option ↔ team:partner_selected)
8. Student submits → POST /responses + socket response:submit
   → 1.2s later: team:check_consensus emitted
   → Backend checks all members' responses
   → If consensus → team:score_updated + team:consensus_success
   → TeamTugOfWar updates on teacher screen
9. Next question → repeat from step 5
10. Teacher ends room (existing flow) → results page
```

---

## 12. Known Limitations & Future Work

- **Student-Choice Mode**: Currently behaves like random. Future: add a self-selection UI where students pick from team list.
- **MSQ Consensus**: Current consensus only checks `selectedOption` (single). For MSQ, need to compare full `selectedOptions` arrays.
- **Dropout Timer**: Currently uses DB member count. Future: track connected sockets per team for 45s disconnect grace period.
- **Team Chat Persistence**: Messages are ephemeral (in-memory only). Future: optional MongoDB persistence for review.
- **Team Avatars**: Currently auto-assigned from preset list. Future: let teacher/students pick custom avatars.
