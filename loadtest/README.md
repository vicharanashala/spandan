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

> **`localhost` is not proof the database is local.** An SSH tunnel (`ssh -L 27017:…`), a Docker
> port mapping or `kubectl port-forward` all make a remote database answer on `localhost`, and the
> scripts cannot tell. They print the target hosts and database before connecting, and refuse a
> database or host name that looks like production even on `localhost`. Still check `MONGODB_URI`
> in `backend/.env` yourself before seeding or cleaning, and never run them with a tunnel to a
> shared or production database open.

Seeding a **non-local** development database is refused unless all of these hold: you pass
`--allow-remote --yes`, `LOADTEST_PASSWORD` is set to something other than the published default,
and neither the database name nor a host name looks like production (`prod`, `production`, `prd`,
`live`). The target hosts and database are printed before anything is written:

```bash
LOADTEST_PASSWORD='<private value>' npm run seed:loadtest -- --students 50 --allow-remote --yes
```

## Run a small test

```bash
cd loadtest
npm start                       # 50 students, 10 s ramp, 3 polls of 15 s (about 90 s)
npm start -- --students 20 --polls 2 --answer-time 10
npm start -- --help             # all options
```

The exit code is `0` when every check passes, `1` when any check fails, and `2` when the run
could not start (for example, the backend is not running) or an error stopped it part-way.

If an error stops a run after it has started (for example, the teacher cannot join its room), the
simulator still cleans up: it ends the room if one was created, closes every socket and stops its
timers and monitors, then saves a partial result with `"status": "failed"` and the `failure`
(phase and message). A Ctrl+C run is saved the same way with `"status": "aborted"`. Checks that
the run never reached are N/A, not passed.

**Ctrl+C.** The first Ctrl+C stops the run early:
- Students still waiting for their ramp slot are cancelled at once and never connect.
- No further poll starts. A poll already running finishes its answer window first.
- Students still signing in or joining get at most 5 s. They are then stopped, which counts as
  `startsAbandoned`, never as a failed student or a failed operation.

A second Ctrl+C exits immediately, without cleanup or a result file.

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
| `--resync-retry-ms MS` | 11000 | After a reconnect, if the past-answers re-fetch missed a poll, re-fetch once this long later (0 to 120000; 0 turns the retry off). The default is the backend's question-cache lifetime (`ROOM_QUESTIONS_CACHE_TTL_MS` if it is set in this shell, else 10 s) plus 1 s. See "Outages and reconnects". |
| `--password P` | `LoadTest@123` | Seeded load-test password. Prefer `LOADTEST_PASSWORD`: a value on the command line is visible in the process list and shell history, and the run prints a warning. |
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
   Any poll it missed while disconnected counts as recovered if that re-fetch returns it. The
   backend caches each room's question list (default 10 s) and does not refresh it when a poll is
   launched, so a re-fetch right after a launch can miss that poll. Real students hit this too.
   When that happens, the student re-fetches **once** more after the cache lifetime
   (`--resync-retry-ms`). A poll only that retry returned still counts as recovered, and is
   reported as INFO with its delay. A poll that neither fetch returned, or whose retry the run
   ended before, is **not recovered** and fails the run.
7. After the last poll, it reads the leaderboard once more.

After the last poll's `segment-done`, the run waits up to `--settle` seconds for a
`leaderboard:updated` broadcast. None arriving fails the check "final leaderboard push received
after the last segment-done". It is N/A when the run was aborted, failed first, or no poll
completed.

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
| `leaderboard_push_spread` | For each leaderboard broadcast, how long after the first student each student received it. With `SERVER_EVENT_TRACE=on`, receipts are matched to their broadcast by its sequence number, which is exact even when a student misses a push. Without tracing they are matched by each student's receipt order (its k-th push belongs to broadcast k). After any disconnect that is reported as approximate (an INFO line), since a missed push shifts that student's later receipts. |
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
- It refuses **browser requests from other sites**, since a web page open on this machine also
  connects from loopback. The `Host` header must be `localhost`, `127.0.0.1` or `[::1]` (this
  blocks DNS rebinding). A request the browser marks `Sec-Fetch-Site: cross-site` or `same-site`,
  or that carries a non-loopback `Origin`, gets a 403.
- `POST /internal/metrics/reset` also needs the header `X-Loadtest-Metrics: reset`. A page on
  another site cannot send a custom header without a CORS preflight, and this route never approves
  one, so it cannot wipe the counters mid-run. The simulator sends the header; by hand:
  `curl -X POST -H 'X-Loadtest-Metrics: reset' http://localhost:3001/internal/metrics/reset`.
- It sits **outside `/api`**, so a reverse proxy that forwards `/api` and `/socket.io` never
  routes to it.
- It never records URLs, query strings, request bodies, headers, tokens, user ids, emails, room
  codes, socket ids or event payloads. Only route patterns, status codes, timings and event
  names. Unknown event names are grouped as `(invalid)` and key counts are capped, so memory
  stays bounded.

**One simulator run per backend at a time.** Each run resets the backend's counters (and its
event-trace ledger) when it starts, and every run signs in the same seeded students, so two runs
against one backend corrupt each other's figures and cross their students' private channels.
- At the start, the run reads how many sockets are already connected. If any are (another run, or
  open app tabs), it prints a warning and records `server.preexistingSockets`; their traffic is in
  the server figures.
- Every snapshot is checked against the reset time the run's own reset returned. If it changes,
  someone else reset the counters or the backend restarted. The run then records
  `server.compromised`, ignores the ledger (the tail check reports `compromised`), and adds a
  **FAIL** check, "server metrics not reset by another client during the run", so such a run is
  never an ordinary PASS. Re-run it on its own.

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

Counting which polls arrived only catches lost polls. To check every **room-wide** broadcast
(`new_question`, `counts:updated`, `leaderboard:updated`, `room:joined`, `room:left`,
`question:started`/`ended` and `room:ended`), start the backend with **both**
`SERVER_METRICS=on` and `SERVER_EVENT_TRACE=on`. The simulator picks it up automatically.

**Out of scope (not numbered, so a loss there goes undetected):**
- the private per-student `leaderboard:you` channel;
- events relayed to everyone except the sender: `video:progress`, `video:pause`, `video:resume`,
  `questions:ready`;
- the separate transcription server's `transcription_broadcast`.

The simulator does not use the video or transcription features, so their events are not part of a
run. Only `leaderboard:you` is received, and it is counted as an event but not checked for loss.

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
- `missedQuestions`, each with `recovered` (whether a re-fetch returned it), `recoveredAfterMs`
  (reconnect to the fetch that returned it) and `retry`: `none` (no retry needed or retries off),
  `recovered` (only the one retry returned it), `still_missing` or `not_completed` (the run ended
  first). The last two are not recovered.
- `stuck`: still disconnected at the end, or reconnected without re-joining within 15 s

The section also gives totals: `stuck`, `byReason`, `missedPolls`, `recoveredPolls`,
`unrecoveredPolls`, p50/p95/max of the three durations, `recoveryDelayMs` (reported only) and
`resyncRetry` (how many polls only the retry returned, were still missing, or the run ended before).

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

This deletes only `@loadtest.spandan.test` data. Real users and rooms are never touched. As with
seeding, check that `MONGODB_URI` really is your development database (see the `localhost` note
under Setup). A remote clean needs `--allow-remote --yes`; `--dry-run` only counts.

## Known limits

- One process generates all the load, so very large runs are limited by this machine.
- Per-broadcast tracing needs `SERVER_EVENT_TRACE=on` (and `SERVER_METRICS=on`). Without it,
  delivery is judged only for polls and `room:ended`, and the tracing checks are `N/A`.
- Disconnects happen only if the network or server causes them. The simulator cannot force
  disconnects, so the reconnect path is exercised only when a real drop occurs during a run.
- The report is the console summary, the JSON file and the offline HTML page. There is no live
  dashboard during a run.
- **More than 20 trace streams per student** (only with several backend instances or repeated
  metrics resets) evicts the least recently used stream on the student's side. Its figures are kept
  in the totals, but its open gaps become final losses. A seq for it that arrives later is then
  counted as both lost and `unclassified`. A re-join to an evicted stream starts it afresh, so that
  outage's missed broadcasts are not counted in `missedOutage`. Its tail check becomes `partial`.
- **Reset detection relies on the backend's `since`.** The run compares the reset time its own
  `POST /internal/metrics/reset` returned with every later snapshot. This backend always returns
  it. Against a backend that did not, detection would be silently off.
- **A reset by another client seen only at the very last read** (after the event-trace ledger was
  read) still fails the run. The tail check is then labelled `compromised` although the ledger it
  used was read before the reset. That is a cosmetic mismatch only.
- **A resync retry still pending when the run ends** (an outage in roughly the last
  `--resync-retry-ms` before shutdown) counts as not recovered (`retry: not_completed`) and fails
  the run.

## Tests

```bash
npm test    # unit tests for config, metrics, answer timing, CPU analysis, delivery tracking, outages, the verdict and the HTML report
```

`npm test` runs `node --test`, which finds every file under `test/` on Node 18.17 and later. The
tests are offline: socket and HTTP peers are in-process stubs, and no backend or database is
needed. CI runs them on Node 20 (the `Load Simulator Tests` job in `.github/workflows/ci.yml`).

Inspired by the load harness proposed in PR #31, rewritten for the current API: email-code sign-up,
Terms acceptance, server-side poll windows, and the removed client-side socket events.
