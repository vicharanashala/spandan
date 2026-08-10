# Spandan - Interactive Live Polling & Learning Platform

> A real-time polling, question generation, and interactive learning platform for classrooms and presentations.

**Version:** 0.8.0

## 🌟 Key Features

- 🔐 **Authentication** — JWT-based secure login with role-based access (Teacher/Student/Admin).
- 🎯 **Room Management** — Create, join, and manage live interactive sessions.
- ❓ **AI Question Generation** — Automated multiple-choice and open-ended question generation.
- 📊 **Real-time Leaderboard** — Live response tracking with robust caching and socket self-healing.
- 🎤 **Advanced Transcription** — Dedicated Python-based `faster-whisper` service for non-blocking, high-performance speech-to-text.
- 🧠 **Mind Mapping & Terminology** — Auto-generated concept mind maps providing visual learning aids and a terminology sidebar for enhanced learning context.
- 🌙 **Dynamic Theming** — Built-in support for dark and light modes.
- 📱 **Responsive Design** — Fully optimized for desktop, tablet, and mobile viewing.

## 🛠️ Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React, Vite, TailwindCSS, Zustand, Socket.IO Client, React Router |
| **Backend** | Node.js, Express, Socket.IO, MongoDB (Mongoose) |
| **AI Services** | Python, FastAPI, `faster-whisper` |
| **Auth** | JWT, bcryptjs |

## 🚀 Quick Start

### Prerequisites
- Node.js (v18+)
- MongoDB (Running locally or via Atlas)
- Python 3.9+ (For the Transcription Service)

### Installation & Execution

```bash
# Install all root, frontend, and Node backend dependencies
npm run install:all

# Run development servers (Frontend & Node Backend)
npm run dev

# Build frontend for production
npm run build
```

## 📂 Project Structure

```
spandan/
├── frontend/              # React App (Vite)
│   ├── src/
│   │   ├── components/    # UI components (e.g. MindMapViewer, TerminologySidebar)
│   │   ├── pages/         # Page components (Teacher & Student dashboards)
│   │   ├── stores/        # Zustand state management
│   │   └── index.css      # Theme & Tailwind styles
│   └── package.json
├── backend/               # Express API Node Server
│   ├── src/
│   │   ├── models/        # Mongoose data schemas
│   │   ├── routes/        # Express API endpoints
│   │   ├── services/      # Business logic (e.g. leaderboardCache)
│   │   └── index.js       # Entry point
│   └── package.json
├── transcription_service/ # (If applicable) Python faster-whisper service
├── package.json           # Monorepo root workspace
└── README.md
```

## ⚙️ Environment Configuration

Copy `.env.example` to `.env` in the backend folder and configure your variables:

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/spandan
JWT_SECRET=your-secret-key
TRANSCRIPTION_SERVICE_URL=http://127.0.0.1:3003
```

## 👥 User Roles

| Role | Capabilities |
|------|-------------|
| **Teacher** | Create rooms, control live sessions, approve questions, view full results and leaderboards. |
| **Student** | Join active rooms, answer questions, view relative rank (top 10), access mind maps. |
| **Admin** | Approve teacher accounts. |

## 🤝 Contributors

- **Suhani** (@Suhani-prog-alt) - Core Development, Mind Mapping & Terminology UI integration.
- **Samridhhi** - Core Development & Features.

## 📄 License

Private — All rights reserved