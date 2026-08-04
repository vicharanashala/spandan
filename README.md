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

### Google Sign-In

Google Sign-In uses Google Identity Services ID tokens. Create a Web application OAuth client in
Google Cloud Console, then put its client ID in both `frontend/.env` as
`VITE_GOOGLE_CLIENT_ID` and `backend/.env` as `GOOGLE_CLIENT_ID`. Restart both dev servers after
changing environment files.

For local development, add `http://localhost:5173` under **Authorized JavaScript origins**. This
flow uses the Google Identity Services button and server-side ID-token verification, so it does
not require a client secret or a backend OAuth callback URI. Never commit the real client ID or
other credentials; the ignored `.env` files are the place to paste local values.

## Roles

| Role | Capabilities |
|------|-------------|
| **Teacher** | Create rooms, manage questions, approve responses, view results |
| **Student** | Join rooms, answer questions, view own history |

## License

Private — All rights reserved
