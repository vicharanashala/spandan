# Spandan load simulator

Simulates a live Spandan classroom: one teacher runs polls while N students join, answer each
poll inside its time window, and read the leaderboard. It measures latency (p50 / p95 / p99),
errors, connection failures, disconnects and reconnects, watches this machine's CPU, and saves
every run to `results/<timestamp>.json`. With the backend's optional event tracing it also checks
that every room broadcast reached every student, in order and exactly once (see
[Delivery tracking](#delivery-tracking-server_event_traceon)).

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

# 3. Start the backend (in its own terminal), with the optional server-side metrics and event tracing
SERVER_METRICS=on SERVER_EVENT_TRACE=on npm run dev     # Git Bash / macOS / Linux
# PowerShell:  $env:SERVER_METRICS='on'; $env:SERVER_EVENT_TRACE='on'; npm run dev
# (plain `npm run dev` also works; the run then has client-side numbers only)
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
| `--server-metrics M` | `auto` | Read the backend's `/internal/metrics`: `auto` (use it if enabled), `require` (fail if not enabled), `off` |
| `--late-ms MS` | 2000 | A traced broadcast delivered later than this counts as late (1 to 60000). Reported only; it never fails the run. |
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
   Any poll it missed while disconnected counts as recovered if that re-fetch returns it.
7. After the last poll, it reads the leaderboard once more.

Students start one after another across the ramp period.

## Reading the results

The console prints a table and a PASS/FAIL list. The full detail is in `results/<timestamp>.json`,
and an offline HTML report of the same run is saved next to it as `results/<timestamp>.html`.

### HTML report

Every run writes `results/<timestamp>.html`. To (re)build it from a saved result file:

```bash
npm run report                                        # newest results/*.json
npm run report -- results/2026-11-06T02-15-30Z.json   # a specific run
npm run report -- results/<file>.json --out my.html   # choose the output file
```

Open the `.html` file in any browser by double-clicking it, or with `start results\<file>.html`
(Windows), `open` (macOS) or `xdg-open` (Linux). It is one self-contained file: no network access,
no JavaScript, and nothing loaded from outside, so it can be attached or archived as is. It shows:
- the overall verdict, and each check as **PASS**, **FAIL** or **N/A** (not measurable, with the
  reason). INFO items are listed separately as reported only.
- performance per operation against its p95 limit, with error kinds
- connections, and polls, including students who got a poll only from the post-reconnect re-fetch
- broadcast delivery, split into **failures** (lost while connected, out-of-order, duplicates) and
  **reported only** (late, missed while disconnected, latency)
- outages and reconnects: down, re-join and resync times, stuck students, and poll recovery per
  outage
- the load generator's and the server's CPU and memory, and error samples

Anything a run could not measure is shown as *unavailable*, never as 0: delivery when tracing was
off, late events and latency for a remote target, and re-join times for an untraced run. Older
(schema v1) result files still render, with the newer sections marked as not recorded. Every
value from the result file is escaped, and tables are capped at 200 rows (the JSON has everything).

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
| `polls[]` | Per poll: how many students received it over the socket (`deliveredTo`), how many got it only from the post-reconnect re-fetch (`recoveredByResync`), and answers accepted or rejected |
| `delivery` | Per-broadcast delivery, when the backend traces events (see [Delivery tracking](#delivery-tracking-server_event_traceon)) |
| `outages` | One record per student disconnect: how long it lasted, re-join and re-fetch times, what was missed and whether it was recovered |
| `socketEventsReceived` | Total events of each type received by all students |
| `generator` | This machine's CPU and event-loop lag, plus bottleneck warnings |
| `server` | The backend's own metrics for this run, when `SERVER_METRICS=on` (see below) |
| `timeline[]` | Per second: requests, errors, connected sockets, CPU |

Errors are grouped by kind, for example `http_409:poll_closed` (answer arrived outside the poll
window), `http_429` (rate limited), `timeout`, or `network:ECONNREFUSED`.

**The PASS/FAIL checks** are:
- p95 limits per operation (login under 2 s; answer and leaderboard reads under 1.5 s; poll
  delivery under 1 s), and at most 1% errors per operation
- at least 99% of students joined
- every poll reached every joined student, over the socket or the post-reconnect re-fetch, and
  `room:ended` reached every joined student
- no correct answers leaking in what students receive
- with event tracing: no broadcast lost while connected (including the last one), **no
  out-of-order broadcasts**, no duplicates, and every joined student got a trace baseline
- when students disconnected: none stayed stuck, every poll missed while disconnected was
  recovered, and the outage p95 was at most 8 s

A check that cannot be measured in a run is printed as **`N/A`** with the reason (for example
"unavailable: backend event tracing is off"). It never counts as a pass and never fails the run.
Lines marked **`INFO`** are reported only: late broadcasts, delivery latency, and an
unverified tail.

The results file has `schemaVersion: 2`. Each check has `status` `PASS`, `FAIL` or `N/A`, and
reported-only figures are in `verdict.info`.

## Server-side metrics (`SERVER_METRICS=on`)

The simulator only sees what the clients see. To also see the backend's side, start the
backend with `SERVER_METRICS=on`. This enables two endpoints:

| Endpoint | Returns |
|---|---|
| `GET /internal/metrics` | A JSON snapshot (see below) |
| `POST /internal/metrics/reset` | Clears the counters |

With the default `--server-metrics auto`, the simulator:
1. resets the counters when the run starts, so the snapshot covers exactly this run,
2. samples the endpoint every 2 s into the `timeline` (`serverCpu`, `serverRssMb`, `serverHeapMb`,
   `serverLoopP99Ms`, `serverSockets`, `serverInFlight`),
3. saves the final snapshot as `server.metrics` in the results file, and prints the server's CPU,
   memory, slowest routes and socket message counts.

If metrics are off, the run continues and the summary says so. Use `--server-metrics require`
to make that an error instead.

The snapshot contains:

| Section | Contents |
|---|---|
| `http.routes` | Per route **pattern** (e.g. `GET /api/responses/leaderboard/:roomId`): count, status codes, 5xx errors, mean, p50, p95, p99 and max latency (percentiles over the most recent 1,024 requests). Requests a limiter rejected before routing appear as `… (unmatched)`. |
| `http` | Totals, in-flight requests and aborted requests |
| `sockets` | Active, peak and total connections; disconnect reasons; engine connection errors; incoming and outgoing event counts by name. Outgoing counts are per-socket deliveries, so one broadcast to 50 students counts 50. |
| `process` | CPU % of one core (1 s samples), RSS and heap memory, event-loop delay, uptime, MongoDB and Redis state |

You can also look at it directly: `curl http://localhost:3001/internal/metrics`.

**Safety.** The endpoint is designed so it can't leak data or be reached from outside:
- It is **off unless `SERVER_METRICS=on`** and is **ignored when `NODE_ENV=production`**. When
  off, nothing is installed and the URL is a normal 404.
- It answers only **direct requests from this machine**. A non-loopback address, or any
  `X-Forwarded-For`, `X-Real-IP`, `Forwarded` or `X-Forwarded-Host` header, gets a 403.
- It sits **outside `/api`**, so a reverse proxy that forwards `/api` and `/socket.io` never
  routes to it.
- It never records URLs, query strings, request bodies, headers, tokens, user ids, emails, room
  codes, socket ids or event payloads. Only route patterns, status codes, timings and event
  names. Unknown event names are grouped as `(invalid)` and key counts are capped, so memory
  stays bounded.

**Limits.**
- Each backend process keeps its own counters. Under PM2 cluster mode, each scrape reads
  whichever worker answers (`process.pid` tells you which).
- CPU and memory cover the Node process only, not MongoDB or Redis.

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

## Delivery tracking (`SERVER_EVENT_TRACE=on`)

Counting which polls arrived only catches lost polls. To check **every** room broadcast
(`new_question`, `counts:updated`, `leaderboard:updated`, `room:joined`, `room:left`,
`question:started`/`ended` and `room:ended`), start the backend with **both**
`SERVER_METRICS=on` and `SERVER_EVENT_TRACE=on`. The simulator picks it up automatically.

How it works:
- The backend numbers each room's broadcasts in order. There is one numbered stream per room per
  backend process. The number travels in an extra `__lt` field, which the app ignores.
- When a socket joins a room, the backend tells it the stream's current number (`lt:hello`). The
  student then expects every number above that, so a late joiner never counts earlier broadcasts
  as missing.
- At the end, the simulator reads the backend's last number per stream from `/internal/metrics`.
  This catches a lost **final** broadcast, such as `room:ended`. It reads this before closing any
  socket, so the normal shutdown is never counted as a disconnect.

Each student's broadcasts are classified as follows:

| Result | Meaning | Effect |
|---|---|---|
| `droppedConnected` | Never arrived although the socket was connected (a gap that never filled). Includes `tailMissing`: numbers the backend sent after the student's last one. | **FAIL** |
| `outOfOrder` | Arrived after a later one | **FAIL** |
| `duplicates` | Arrived twice | **FAIL** |
| `missedOutage` | Sent while that student was disconnected. Expected; judged through `outages` instead. | reported |
| `late` | Arrived more than `--late-ms` (default 2000 ms) after the backend sent it. Still delivered. | reported |
| `beforeBaseline`, `unclassified`, `invalid`, `baselineInferred` | Diagnostics that should stay 0. `unclassified` appears only after more than 512 separate gaps. | reported |

The `delivery` section of the results file also has:

| Field | Meaning |
|---|---|
| `status` | `traced`, or `unavailable` with a `reason` (tracing off, metrics off). Unavailable is never shown as zero. |
| `clock` | `local`, or `unavailable` for a remote target. Latency and `late` need the backend and the simulator on one clock; when it is unavailable they are `null`, but gaps, order and duplicates are still checked. |
| `tail` | `verified`, `partial` (a stream was missing from the backend's numbers) or `unverified` (backend numbers not read). Only `verified` can detect a lost last broadcast. |
| `latencyMs` | Mean and max delivery time over all traced broadcasts |
| `byEvent` | Per event type: received, duplicates, out-of-order and late. A missing broadcast cannot be attributed to an event type, because the student never saw it. |
| `worstStudents` | Up to 10 students with the most lost, out-of-order or duplicate broadcasts (by student number) |

The `outages` section has one record per student disconnect (up to 200; `total` counts all). Each
record holds:
- `reason`, and `outageMs` (disconnect to reconnect)
- `rejoinMs` (reconnect to the new `lt:hello`; traced runs only, otherwise `null`)
- `resyncMs` (reconnect to the end of the past-answers re-fetch)
- `missedSeqs`, the broadcasts missed while disconnected
- `missedQuestions`, each with `recovered` saying whether the re-fetch returned it
- `stuck`: still disconnected at the end, or reconnected without re-joining within 15 s

The section also gives totals: `stuck`, `byReason`, `missedPolls`, `recoveredPolls`,
`unrecoveredPolls`, and p50/p95/max of the three durations.

**Limits.** Each backend process numbers its own stream, so under several instances a student
sees one stream per instance, and an instance it never got `lt:hello` from is baselined on its first
broadcast (`baselineInferred`). The private `leaderboard:you` channel and the video events
(`video:*`, `questions:ready`) are not numbered.

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
- Per-broadcast tracing needs `SERVER_EVENT_TRACE=on` (and `SERVER_METRICS=on`). Without it,
  delivery is judged only for polls and `room:ended`, and the tracing checks are `N/A`.
- Disconnects happen only if the network or server causes them. Forced disconnects for testing the
  reconnect path come in a later step.
- The report is the console summary, the JSON file and the offline HTML page. There is no live
  dashboard during a run.

## Tests

```bash
npm test    # unit tests for config, metrics, answer timing, CPU analysis, delivery tracking, outages, the verdict and the HTML report
```

Inspired by the load harness proposed in PR #31, rewritten for the current API: email-code sign-up,
Terms acceptance, server-side poll windows, and the removed client-side socket events.
