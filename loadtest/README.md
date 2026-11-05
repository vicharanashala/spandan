# Spandan load simulator

Simulates a live Spandan classroom: one teacher runs polls while N students join, answer each
poll inside its time window, and read the leaderboard. It measures latency (p50 / p95 / p99),
errors, connection failures, disconnects and reconnects, watches this machine's CPU, and saves
every run to `results/<timestamp>.json`.

The simulated clients follow the real app's requests and Socket.IO events step for step (see
[What a run does](#what-a-run-does)), so the numbers reflect what real students would see.

> [!WARNING]
> **Use only a local or explicitly authorized test environment. Never production.**
> A run creates a room, questions and answers, and drives many logins and sockets at once.
> The simulator refuses any non-`localhost` target unless you pass `--allow-remote`, and
> refuses more than 200 students unless you pass `--confirm-large`. Use those flags only
> on a test server you are authorized to load-test.

No question generation endpoint is called, so **no paid AI provider is ever used**. Polls are
hand-written questions created as `approved` through `POST /api/questions`, the same path as the
teacher console's "Create Q".

## Setup

Requirements: Node 18.17+ (Node 22+ recommended), and a local MongoDB with the backend's `.env`
configured as usual.

```bash
# 1. Install the simulator (its own package; the app's dependencies are unchanged)
cd loadtest
npm install

# 2. Seed the load-test accounts (dev databases only; refuses production / remote DBs)
cd ../backend
npm run seed:loadtest -- --students 50

# 3. Start the backend (in its own terminal)
npm run dev
```

The seed creates `lt.teacher@loadtest.spandan.test` and `lt.student0001@…` to `lt.student00NN@…`,
all with the password `LoadTest@123` (override with `LOADTEST_PASSWORD` for both the seed and the
simulator). Seed at least as many students as you plan to simulate. The simulator checks this
before it starts.

## Run a small test

```bash
cd loadtest
npm start                       # 50 students, 10 s ramp, 3 polls of 15 s (about 90 s)
npm start -- --students 20 --polls 2 --answer-time 10
npm start -- --help             # all options
```

The exit code is `0` when every check passes, `1` when any check fails, and `2` when the run
could not start (for example, the backend is not running).

Start small and climb gradually (50, then 100, then 200). **Larger runs are never started
automatically.** Above 200 students you must add `--confirm-large`.

### Options

| Flag | Default | Meaning |
|---|---|---|
| `--students N` | 50 | Simulated students (needs `--confirm-large` above 200) |
| `--ramp S` | 10 | Spread student arrivals over S seconds instead of all at once |
| `--polls N` | 3 | Poll cycles the teacher runs |
| `--duration S` | off | Keep cycling polls until S seconds have passed (capped by `--polls` if both are given) |
| `--answer-time S` | 15 | Each poll's time to answer (5 to 300) |
| `--gap S` | 5 | Pause between polls |
| `--answer-rate F` | 1 | Fraction of students who answer each poll (0 to 1) |
| `--settle S` | 25 | After the last poll, wait for the leaderboard update (the server delays it by 15 s) |
| `--base-url URL` | `http://localhost:3001` | Backend URL |
| `--api-prefix P` | none | `/spandan` when going through the nginx proxy |
| `--allow-remote` | off | Allow a non-localhost target (authorized test servers only) |
| `--confirm-large` | off | Allow more than 200 students |

Every option can also be set by an environment variable, for example `LOADTEST_STUDENTS` or
`LOADTEST_RAMP_SECONDS` (see `lib/config.mjs`).

### Rate limits

Every simulated student comes from **one IP**, so the backend's per-IP rate limits apply to
the whole simulated class. The defaults are plenty for 50 students. For larger local runs, raise
them **on your local backend only** by setting these in `backend/.env` and restarting it:

```bash
API_RATE_LIMIT_MAX=1000000
RESPONSE_RATE_LIMIT_MAX=1000000
LEADERBOARD_RATE_LIMIT_MAX=1000000
```

If you see `http_429` errors in a run, the rate limiter was hit, not a server failure.

## What a run does

**Teacher**, following the teacher console:
1. `POST /auth/login`, then `POST /rooms`.
2. Opens a socket and sends `room:join`.
3. For each poll: `POST /questions` with `status: approved`, then emits `new_question`. It waits
   out the answer window and calls `POST /responses/leaderboard/:roomId/segment-done`.
4. At the end: `PUT /rooms/:id { isActive: false, endedAt }`, which makes the server emit
   `room:ended`.

**Each student**, following `StudentRoomPage` and `socketStore`:
1. `POST /auth/login`, then `GET /rooms/join/:code`.
2. Opens a socket (token in the handshake), emits `authenticate` and `room:join`, and waits for
   `room:joined`.
3. Loads its past answers (`GET /responses/room/:roomId/student/:id`) and the leaderboard
   (`GET /responses/leaderboard/:roomId`).
4. On `new_question`: "thinks" for 1 s up to (answer time − 3 s), freezes `responseTime` at that
   click, waits the app's own 0–2 s send jitter, and sends `POST /responses`. The answer is a
   random guess, because students never see which option is correct.
5. When the poll's timer runs out, it re-fetches its past answers, as the real client does.
6. After a reconnect, it re-sends `authenticate` and `room:join` and re-fetches its past answers.
7. After the last poll, it reads the leaderboard once more.

Students start one after another across the ramp period.

## Reading the results

The console prints a table and a PASS/FAIL list. The full detail is in `results/<timestamp>.json`.

| Metric | Meaning |
|---|---|
| `login`, `join_http`, `socket_connect`, `join_socket` | Time to sign in, join over HTTP, open the socket, and get `room:joined` |
| `answer` | `POST /responses` round trip |
| `poll_delivery` | Time from the teacher emitting `new_question` until each student received it. Teacher and students share one clock, so this is true end-to-end fan-out time. |
| `poll_expiry_refetch` | The past-answers re-fetch every student makes when a poll's timer ends. All students fire it at the same moment. |
| `leaderboard_get`, `leaderboard_get_final` | Leaderboard reads on join and after the polls |
| `leaderboard_push_spread` | For each leaderboard broadcast, how long after the first student each student received it |
| `leaderboard_push_after_segment_done` | Time from the last `segment-done` until the leaderboard update. About 15 s by design (`LEADERBOARD_SEGMENT_DELAY_MS`). |
| `connections` | Students joined, connect failures, disconnects (by reason) and reconnects |
| `polls[]` | Per poll: how many students received it, and answers accepted or rejected |
| `socketEventsReceived` | Total events of each type received by all students |
| `generator` | This machine's CPU and event-loop lag, plus bottleneck warnings |
| `timeline[]` | Per second: requests, errors, connected sockets, CPU |

Errors are grouped by kind, for example `http_409:poll_closed` (answer arrived outside the poll
window), `http_429` (rate limited), `timeout`, or `network:ECONNREFUSED`.

**The PASS/FAIL checks** are p95 limits per operation (login under 2 s; answer and leaderboard
reads under 1.5 s; poll delivery under 1 s), at most 1% errors per operation, at least 99% of
students joined, every poll and `room:ended` reaching every joined student, and no correct
answers leaking in what students receive.

### "Is it my laptop or the server?"

Locally, the server, MongoDB and the simulator all share one machine. The simulator samples its
own CPU, the whole machine's CPU and its event-loop lag every second. It **warns** when, for at
least 20% of the run:
- it used 85% or more of a CPU core,
- the machine was 90% or more busy, or
- its event loop lagged 200 ms or more.

If you see a warning, reduce `--students`, or treat the latencies as an upper bound. On Windows the
event-loop lag never drops below about 30–40 ms, because of the system timer resolution. That is
normal.

## Clean up

Test rooms, questions and answers stay in the database so you can inspect them. Remove everything
belonging to the load-test accounts with:

```bash
cd backend
npm run clean:loadtest -- --dry-run   # preview
npm run clean:loadtest
```

This deletes only `@loadtest.spandan.test` data. Real users and rooms are never touched.

## Limits of this MVP

- One process generates all the load, so very large runs are limited by this machine.
- Delivery is measured by what the clients received. The server does not yet trace events
  (that comes in a later step), and there are no server CPU or memory metrics yet.
- The report is the console table plus the JSON file. A dashboard comes later.

## Tests

```bash
npm test    # unit tests for config, metrics, answer timing, CPU analysis and the verdict
```

Inspired by the load harness proposed in PR #31, rewritten for the current API: email-code sign-up,
Terms acceptance, server-side poll windows, and the removed client-side socket events.
