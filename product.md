# Spandan - Product & Architectural Context

Welcome to the **Spandan** platform documentation. Spandan is a state-of-the-art, real-time polling and interactive question generation platform designed for classrooms, presentations, and live lectures.

This document outlines the product vision, core features, technical stack, system architecture, database models, real-time communication events, and installation guidelines.

---

## 1. Product Concept & Core Philosophy

### The Core Idea
During traditional presentations or classroom lectures, student engagement decays rapidly. Instructors lack active, real-time channels to verify comprehension without interrupting the flow of their speech. 

**Spandan** solves this by converting live speech into interactive, real-time quizzes. While the teacher speaks:
1. The teacher's microphone audio is captured in the browser.
2. The audio is transcribed in real-time into discrete lecture segments using a local **Whisper AI model**.
3. At configured intervals (e.g., every 2 minutes), the accumulated transcription text is orchestrated through a generative AI model (such as OpenAI, Anthropic, Gemini, or MiniMax) to generate contextual questions (MCQ, True/False, Multiple Select) based *only* on what was spoken.
4. The teacher approves, modifies, or discards the generated questions.
5. Launched questions appear instantly on students' screens with a ticking countdown timer.
6. Real-time responses are analyzed, scored via a time-decay algorithm, and aggregated into a competitive room leaderboard, boosting engagement through gamification.

---

## 2. Feature Walkthrough

### 🔐 Role-based Access, Auth & Samagama SSO
*   **Standard Auth**: JWT-based secure registration, login, profile updates, and transactional password-reset flows via email (SMTP / Resend API).
*   **Seamless SSO Integration**: Direct integration with the parent portal `samagama.in`. If a user is logged into Samagama and navigates to Spandan, the frontend automatically grabs their auth token and triggers auto-login/auto-provisioning on the Spandan backend.
*   **Role-Based Security**: Role is determined on first login (users with admin/super-admin privileges on Samagama are assigned the `teacher` role, while others are assigned `student`). Once a role is set, it is locked to prevent privilege escalation.

### 🏫 Classroom Lifecycle & Room Management
*   **Teacher Actions**: Create rooms with custom parameters (segment timer, questions per segment, difficulty, AI question provider, base question points, response timer limit, and allowed question types).
*   **Student Actions**: Join live sessions using a 6-character room code (e.g., `AB3DXE`), re-join active sessions, or check past room statistics in the room history section.

### 🎤 Real-Time Lecture Transcription
*   **Browser-Side Capture**: High-quality audio captured directly from the teacher's mic.
*   **Local Audio Conversion**: A native client-side script uses the browser's Web Audio API to decode WebM/OGG compressed audio and re-encode it to a clean **16kHz mono WAV format** containing 16-bit PCM samples. This format ensures low latency and high accuracy for AI transcription.
*   **Whisper AI Engine**: The backend runs an in-process instance of the local ONNX-powered `Xenova/whisper-base` transcription pipeline (via `@xenova/transformers`). Transcripts are generated, saved to MongoDB, and broadcasted to room members in real-time.

### 🤖 Generative AI Question Orchestration
*   **Orchestration Layer**: Automatically schedules question generation when a segment timer runs out, or lets teachers trigger it manually.
*   **Supported Providers**:
    *   **MiniMax API**: Runs `MiniMax-M2.7` model for generation.
    *   **OpenAI API**: Runs `gpt-4o-mini` model.
    *   **Anthropic API**: Runs `claude-sonnet-4-20250514`.
    *   **Google Gemini API**: Runs `gemini-2.0-flash`.
*   **Supported Formats**:
    *   **MCQ (Multiple Choice)**: 4 options, 1 correct.
    *   **TF (True/False)**: 2 options.
    *   **MSQ (Multiple Select)**: 4 options, 2-4 correct answers. (Students must select all correct options and no incorrect options to score points).

### 📊 Real-Time Interactive Polling
*   **Moderation Workflow**: Teachers review questions in a modal popup. They can edit question wording, choices, change the correct option indices, or delete items before launching.
*   **Ticking Timer**: A ticking countdown timer starts on the student dashboard as soon as a question is pushed.
*   **Live Tallies**: As students vote, Socket.IO channels feed live response tallies directly into the teacher's chart interface.

### 🏆 Gamified Scoring & Leaderboard
*   **Time-Decay Formula**: Correct answers reward points based on response speed:
    $$\text{Earned Points} = \text{Max Points} \times \max\left(0.1, \frac{\text{Time to Answer} - \text{Response Time}}{\text{Time to Answer}}\right)$$
    This keeps the environment competitive while guaranteeing a minimum of 10% points for correct answers even if a student responds at the last second.
*   **Ellipsis Leaderboard**: Teachers see the entire room's rank, while students see the top 10 students plus their own rank to preserve privacy and encourage self-improvement.

### 📈 Post-Session Analytics & Performance Reports
*   **Teacher View**: Room statistics dashboard highlighting total response counts, student participation rate, average performance, and detailed bar charts for option selections per question.
*   **Student Report Card**: High-fidelity personal history summarizing the questions launched, options selected, correctness, time taken, points earned, and explanations.

---

## 3. Tech Stack & Repository Structure

### Technical Stack
| Component | Technologies |
|---|---|
| **Frontend** | React (Vite scaffold), Zustand (State), Socket.IO Client, TailwindCSS, React Router |
| **Backend** | Node.js, Express, Socket.IO Server, MongoDB (Mongoose ODM) |
| **AI Transcription** | Transformers.js (`@xenova/transformers`) running local ONNX `whisper-base` |
| **AI Generation** | MiniMax API, OpenAI API, Anthropic API, Google Gemini API |
| **Authentication** | JSON Web Tokens (JWT), Bcrypt.js (Password hashing) |
| **Reverse Proxy** | Node-based proxy static server (`server.js`) on port 5002 |

### Directory Structure
```
spandan/
├── package.json                 # Monorepo workspaces setup (frontend, backend)
├── server.js                    # SPA static server & Reverse Proxy (port 5002)
├── frontend/                    # Vite React app
│   ├── src/
│   │   ├── main.jsx             # Entry script
│   │   ├── App.jsx              # React Router mapping, Samagama SSO init
│   │   ├── config.js            # Path & base configs
│   │   ├── index.css            # Core CSS
│   │   ├── themes.css           # Light and Dark theme configurations
│   │   ├── components/          # Reusable components (Sidebar, Leaderboard, etc.)
│   │   ├── pages/               # Dashboard pages (Teacher, Student, Room detail)
│   │   ├── stores/              # Zustand stores (auth, room, socket, theme)
│   │   └── services/            # APIs (audio conversion, transcription, etc.)
│   └── package.json
├── backend/                     # Express REST API & WebSocket server
│   ├── src/
│   │   ├── index.js             # Express + Socket.IO Server startup (port 3001)
│   │   ├── config.js            # Global API configurations and env parsing
│   │   ├── middleware/          # JWT check, Zod validations
│   │   ├── models/              # Mongoose database schemas
│   │   ├── routes/              # Express route controllers
│   │   ├── services/            # Services (Auth, AI Question Gen, SSO, Email)
│   │   └── transcriptionServer.js # Standalone real-time audio WebSocket server (port 3002)
│   └── package.json
└── Spandan_Version_MDs/         # Version plans and SRS references
```

---

## 4. Database Schema Design (MongoDB/Mongoose)

### User Model (`User.js`)
Stores account information, SSO status, role-based attributes, and profile metrics.
*   `email`: String (Unique, lowercase, indexes for logins).
*   `password`: Hashed string (with fallback placeholder for Samagama SSO users).
*   `role`: String (`teacher` or `student`).
*   `department` / `employeeId` / `qualifications`: Profile properties for teachers.
*   `enrollmentNumber` / `class`: Profile properties for students.

### Room Model (`Room.js`)
Configures room meta-state and real-time settings.
*   `name`: String (Title of room).
*   `teacher`: ObjectId (Ref to `User`).
*   `code`: String (Unique, upper-case, 6-character room identifier).
*   `isActive`: Boolean (For tracking active sessions).
*   `endedAt`: Date (Ended timestamp).
*   `currentQuestion`: ObjectId (Ref to `Question`).
*   `settings`: Object containing default durations, AI providers, and question type mix ratios.

### RoomMember Model (`RoomMember.js`)
Maintains session enrollment, verifying student participation in rooms.
*   `roomId`: ObjectId (Ref to `Room`).
*   `studentId`: ObjectId (Ref to `User`).
*   `joinedAt`: Date.
*   *Indexes*: Unique compound index on `{ roomId, studentId }`.

### Question Model (`Question.js`)
Maintains quiz structures generated by AI or typed by the teacher.
*   `roomId`: ObjectId (Ref to `Room`).
*   `type`: String (`MCQ`, `TF`, or `MSQ`).
*   `question`: String (Question prompt).
*   `options`: Array of objects (`text` and `isCorrect`).
*   `explanation`: String (AI-generated explanation).
*   `segmentIndex`: Number (Associated lecture segment).
*   `status`: String (`pending`, `approved`, `rejected`).
*   `timeToAnswer`: Number (Seconds limit).
*   `points`: Number (Base reward).

### Response Model (`Response.js`)
Tracks answer submissions, response times, and calculated points.
*   `roomId`: ObjectId (Ref to `Room`).
*   `questionId`: ObjectId (Ref to `Question`).
*   `studentId`: ObjectId (Ref to `User`).
*   `selectedOption`: Number (First choice index, MCQ backward compatibility).
*   `selectedOptions`: Array of Numbers (All choices, for MSQ).
*   `isCorrect`: Boolean.
*   `responseTime`: Number.
*   `points`: Number (Decayed score).
*   *Indexes*: Compound index on `{ roomId, questionId, studentId }` preventing duplicate voting.

### Transcript Model (`Transcript.js`)
Saves chronological lecture text blocks.
*   `roomId`: ObjectId (Ref to `Room`).
*   `segmentIndex`: Number.
*   `teacherId`: ObjectId (Ref to `User`).
*   `text`: String (Transcribed text block).
*   `duration` / `wordCount`: Metadata for performance checking.

---

## 5. Architectural Workflows & Data Flows

```
  [Teacher Speaks] 
        │
        ▼ (Audio Capture via Browser MediaRecorder)
  [WebM/OGG Audio] 
        │
        ▼ (Client-side Web Audio API Conversion)
  [16kHz Mono WAV (PCM)] 
        │
        ▼ (HTTP POST /api/transcription/transcribe)
  [Xenova Whisper-Base ONNX Pipeline] 
        │
        ▼ (Real-time Socket.IO Broadcast to Classroom)
  [Transcribed segments displayed on screens]
        │
        ▼ (Segment Timer reaches zero / manual trigger)
  [Orchestrate Generative AI Question Generation] 
        │
        ▼ (Fetch Questions from OpenAI/Gemini/Claude/MiniMax)
  [Teacher Moderation and Question Launch] 
        │
        ▼ (Socket.IO event "question:started" push to Student Dashboard)
  [Student Submit Answers] 
        │
        ▼ (Express routes calculate Time-Decayed Score & save to DB)
  [Real-Time Live Response Tally on Teacher Dashboard] 
        │
        ▼ (Timer finishes: Socket.IO event "question:ended")
  [Student dashboard displays correctness, points earned, and explanations] 
        │
        ▼ (WebSocket synchronizes rank updates)
  [Leaderboard Refresh]
```

### Real-Time Socket.IO Protocol
The interactive state is synced using these Socket.IO event namespaces:
*   `room:join` / `room:joined`: Fires when a user connects to a room room code channel, updating room enrollment tallies.
*   `room:leave` / `room:left`: Fires when a user leaves the room, updating counts.
*   `question:start` / `question:started`: Fired by the teacher to push a live quiz structure to students and start timers.
*   `response:submit` / `response:new`: Fired on student submission, feeding tallies into the teacher's statistics canvas.
*   `points:update` / `points:updated`: Notifies students of their individual performance.
*   `question:end` / `question:ended`: Fired to terminate voting, revealing correct options, points earned, and explanations.
*   `leaderboard:update` / `leaderboard:updated`: Synchronizes room rankings.

---

## 6. How to Build & Run Locally

### Prerequisites
*   Node.js (v18 or higher recommended)
*   MongoDB running locally (`mongodb://localhost:27017`) or a connection string to MongoDB Atlas.

### 1. Initialize Project & Install Dependencies
From the repository root directory, run:
```bash
# Installs packages in the root, backend, and frontend workspaces
npm run install:all
```

### 2. Configure Environment Files
Copy the `.env.example` templates to `.env` in both folders.

**Backend (`backend/.env`):**
```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173/spandan
CORS_ORIGINS=http://localhost:5173,http://localhost:3001,http://localhost:8080
MONGODB_URI=mongodb://localhost:27017/spandan
JWT_SECRET=your-super-secret-jwt-string-here

# Generative AI Keys (Choose at least one)
OPENAI_API_KEY=your_openai_key
GOOGLE_API_KEY=your_gemini_key
ANTHROPIC_API_KEY=your_claude_key
MINIMAX_API_KEY=your_minimax_key

# Transactional Email configs
SMTP_EMAIL=your@gmail.com
SMTP_PASSWORD=your_gmail_app_password
```

**Frontend (`frontend/.env`):**
```env
# URL base path matching router configurations
VITE_BASE_PATH=/spandan
```

### 3. Run the Servers
To run both the backend and frontend simultaneously in development mode (with file-watchers active):
```bash
npm run dev
```
*   **React Frontend** will start at: [http://localhost:5173](http://localhost:5173) (forwarded base path: `http://localhost:5173/spandan`)
*   **Express API Backend** will start at: [http://localhost:3001](http://localhost:3001)

### 4. Running the Test Suites
Spandan comes with comprehensive Jest tests to verify calculations, authentication middleware, password reset tokens, and store logic.
```bash
# Run backend tests
npm test --workspace=backend

# Run frontend tests
npm test --workspace=frontend
```
