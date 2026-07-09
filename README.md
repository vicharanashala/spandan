# Spandan Vicharanashala

An advanced, real-time interactive polling and student evaluation platform designed to reduce time friction and prevent cheating through active session monitoring.

## 🚀 Features

### 1. Real-Time Socket Infrastructure
* **Room-Based WebSockets:** Dedicated connection namespaces for teachers and students via Socket.IO.
* **Server-Authoritative Timer:** A centralized backend timer broadcasts the remaining time to all clients, preventing local clock tampering and ensuring perfect synchronization.
* **Resiliency:** Built-in disconnect/reconnect logic allows dropped students to instantly resync to the active poll upon reconnecting.

### 2. Frictionless Poll Interface
* **Zero-Click Submit:** Poll cards (MCQ, True/False, Short Answer) lock the answer instantly upon selection and fire it over the socket to eliminate time friction.
* **Fluid UI:** Built with `framer-motion` for smooth, spring-based countdown timers and entrance animations.
* **Audio Cues:** Pre-poll audio notifications to ensure students never miss a question.

### 3. Lockdown Browser Extension
* **Anti-Cheat Enforcement:** Uses Manifest V3 and `declarativeNetRequest` to lock down internet access during active polls.
* **Tab-Switch Detection:** Instantly flags students and alerts the teacher in real-time via WebSockets if a student navigates away from the active poll tab.
* **Session Capture:** Background scripts handle system audio/video capture and chunked uploads to the backend.

### 4. Dashboards & Scoring Engine
* **TTA (Time-to-Answer) Scoring:** A dynamic scoring algorithm that rewards speed and actively penalizes edited answers.
* **Teacher Dashboard:** Live session analytics, per-question breakdown (correct percentages, answer distributions, tab-switch flags), and a real-time leaderboard.
* **Student Dashboard:** Individual performance tracking, including lifetime score, accuracy, and weekly rollups.
* **Strict Auth Routing:** Secure entrance flow that forces unauthenticated users directly to an animated login page.

## Scope
This PR adds *in-session, real-time* functionality: a Socket.IO layer, live teacher/student dashboards, server-authoritative TTA (time-to-answer) scoring, an anti-cheat browser extension, and a standalone ai-service for adaptive question generation. It operates entirely on live session data while a class is in progress. It does not touch notes, saved transcripts, or post-session revision workflows — that surface area is out of scope here.

### 5. Autonomous AI Microservice (`ai-service`)
A standalone Node.js/Express service running alongside the core application, powered by Google's Gemini 2.5 Flash LLM.
* **Transcript-to-Question:** Automatically ingests live class transcripts from MongoDB and generates relevant interactive questions on the fly.
* **Adaptive Timer Calculation:** Intelligently determines the cognitive load of a generated question and assigns a tailored countdown timer (e.g., 15s for recall, 45s for calculation).
* **Semantic Grading:** Evaluates short text answers based on meaning and rubric alignment, rather than rigid string matching.
* **Adaptive Question Selection:** Analyzes a student's live performance stats during an active session to steer which category of question (recall / analysis / calculation) the AI generates next. This is a real-time, in-session mechanism — distinct from post-session study/revision workflows.

---

## 🛠️ Tech Stack
* **Frontend:** React, Vite, TailwindCSS, Framer Motion, Zustand
* **Backend:** Node.js, Express, Socket.IO, MongoDB (Mongoose)
* **AI Service:** Node.js, Express, `@google/genai` (Gemini 2.5 Flash)
* **Extension:** Chrome Extension API (Manifest V3)

---

## 💻 Running the Application Locally

The project is structured as an NPM monorepo using workspaces. 

### Prerequisites
* Node.js (v18+)
* MongoDB running locally on port `27017`
* A valid `GOOGLE_API_KEY` placed in `ai-service/.env`

### Installation
From the root directory, install all dependencies across all workspaces:
```bash
npm run install:all
```

### Start the Dev Servers
You can boot the entire stack (Frontend on `5173`, Backend on `3001`, and AI Service on `3002`) with a single command:
```bash
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) to view the portal.