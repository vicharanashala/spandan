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

## Authorization

Every API route must declare who may call it. The server refuses to start if one does not, naming
the offenders — so a handler nobody remembered to guard fails the deploy instead of shipping open.

Declare a policy by using one of these middlewares on the route:

| Middleware | Means |
|---|---|
| `publicRoute` | Unauthenticated by design (login, registration, password reset) |
| `authenticate` | Any signed-in user |
| `authorize('teacher')` | A role, and nothing more |
| `roomAccess('owner')` | The teacher who owns the room named in the request |
| `roomAccess('member')` | That teacher, or a student who has joined the room |

`roomAccess` finds the room id in the params, query or body, loads it once, and hands the handler
`req.room` plus `req.isRoomOwner` — so routes serving both audiences branch on that rather than
working out ownership again. It is the only place the rule lives.

Run `npm run routes` in `backend/` to print the current policy for every route.

Declaring *a* policy does not prove it is the *right* one. That is pinned by
`backend/src/__tests__/routeAccessMatrix.test.js`, which states, for every route, which of five
kinds of caller — anonymous, outside student, member student, other teacher, owning teacher — gets
in. Adding a route fails that suite until it has a row.

## License

Private — All rights reserved