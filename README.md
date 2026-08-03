# Spandan - Poll Question Generator

> A real-time polling and question generation platform for classrooms and presentations.

**Version:** 0.8.0

## Features

- 🔐 **Authentication** — JWT-based login with role-based access (Teacher/Student)
- 🎯 **Room Management** — Create, join, and manage live polling sessions
- ❓ **Question Types** — Multiple choice and open-ended questions with approval workflow
- 📊 **Real-time Results** — Live response tracking with Socket.IO
- 🎤 **Transcription** — Whisper-powered audio transcription for question generation
- 🌙 **Theme Toggle** — Dark and light mode support
- 📱 **Responsive** — Works across devices with teacher and student dashboards

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React, Vite, TailwindCSS, Zustand, Socket.IO Client, React Router |
| **Backend** | Node.js, Express, Socket.IO, MongoDB (Mongoose), Whisper (Transformers) |
| **Auth** | JWT, bcryptjs |
| **AI** | Xenova Transformers (Whisper for transcription) |

## Quick Start

```bash
# Install all dependencies
npm run install:all

# Run development (both frontend and backend)
npm run dev

# Build frontend
npm run build
```

## Project Structure

```
spandan/
├── frontend/              # React app (Vite)
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── pages/         # Page components
│   │   ├── stores/        # Zustand stores
│   │   └── themes.css     # Theme styles
│   └── package.json
├── backend/               # Express API
│   ├── src/
│   │   ├── models/        # Mongoose schemas
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   └── index.js       # Entry point
│   └── package.json
├── package.json           # Monorepo root
└── README.md
```

## Environment

Copy `.env.example` to `.env` in the backend folder and configure as needed.

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/spandan
JWT_SECRET=your-secret-key
```

## Roles

| Role | Capabilities |
|------|-------------|
| **Teacher** | Create rooms, manage questions, approve responses, view results |
| **Student** | Join rooms, answer questions, view own history |

## License

Private — All rights reserved