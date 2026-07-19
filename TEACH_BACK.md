# Teach-Back Mode

A new poll mode for Spandan. Instead of picking a multiple-choice answer,
students explain a concept **in their own words**, live, and the teacher
reviews responses in real time to see who actually understands it — not
just who guessed the right letter.

This is based on the [teach-back method](https://en.wikipedia.org/wiki/Teach-back_method),
a technique used in education and healthcare to confirm understanding by
having the learner restate information themselves.

## How it works

1. A teacher opens the **Teacher** view, which creates a room and shows a
   6-character room code.
2. Students open the **Student** view, enter the code and their name, and
   join the room.
3. The teacher types a prompt (e.g. *"Explain photosynthesis in your own
   words"*) and sends it to the class.
4. Every student sees the prompt and submits a short free-text explanation.
5. The teacher sees explanations stream in live and marks each one
   **Got it** or **Needs review**. Students see that feedback instantly.
6. The teacher can end the prompt and send a new one at any time.

## Structure

```
server/   Express + Socket.io backend (in-memory room store)
client/   React (Vite) frontend — landing page, Teacher view, Student view
```

## Running locally

**Backend**
```bash
cd server
npm install
npm run dev        # listens on :4001
```

**Frontend**
```bash
cd client
npm install
npm run dev         # listens on :5173
```

Open two browser windows: one on `/` choosing "I'm teaching a session",
another choosing "I'm joining with a code" and pasting the code from the
teacher window.

### Environment variables

- `PORT` (server, default `4001`)
- `CLIENT_ORIGIN` (server, default `http://localhost:5173`) — for CORS
- `VITE_SERVER_URL` (client, default `http://localhost:4001`)

## Design notes / scope

- **Storage is in-memory** on purpose, so this feature can be reviewed and
  merged independently of whatever persistence layer the rest of Spandan
  settles on. Swapping in a real DB later just means implementing the same
  methods in `server/rooms.js` against Mongo/Postgres/etc.
- **One submission per student per prompt** — resubmitting overwrites the
  previous answer rather than creating duplicates, so the teacher's list
  stays clean.
- **No auth** yet — room codes are the access control for now, matching
  how the rest of Spandan's live-session features (e.g. Live Polling) are
  described in the README. Wiring this into whatever auth Spandan adopts
  is a natural follow-up PR.
- Visual direction leans into the "classroom" subject matter (chalkboard
  palette, chalk-style accents) rather than a generic UI kit look.

## Possible follow-ups (not in this PR)

- Persist rooms/sessions to a database for post-class analytics.
- Optional AI-assisted first-pass scoring of explanations, surfaced as a
  suggestion the teacher can accept or override (keeping the teacher as
  the final judge of understanding).
- Export a session's submissions + review outcomes as a CSV.
