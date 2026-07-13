# Spandan load test

Simulates a surge of students all doing the real live-session flow at once —
**login → socket connect → room:join → answer → read leaderboard** — and holds the sockets open.
This reproduces the two things that broke at ~700 users (the login surge and the live-session O(N²)
fan-out) so you can prove the fixes hold to 1000+ **before** risking a real class.

It's a Node harness using the real `socket.io-client`, because the join storm goes over Socket.IO
(which k6/HTTP tools can't speak natively).

## ⚠️ Run against STAGING, not production
It creates ~1000 throwaway accounts, a room, and a question, then hammers them. Point it at a staging
deploy that mirrors production — ideally with **Redis running and the backend in cluster mode**
(`npm run start:cluster`), since that's the configuration you're validating.

## Setup

```bash
cd loadtest
npm install
```

Set where the app lives (pick ONE style):

```bash
# Behind the nginx + server.js proxy (like production):
export BASE_URL=https://staging.spandan.fun
export API_PREFIX=/spandan

# …or hitting the backend directly:
export BASE_URL=http://localhost:3001
export API_PREFIX=
```

## Run

```bash
# 1. Create the teacher, room, approved question, and student accounts (one-time; safe to re-run)
USERS=1000 npm run seed

# 2. Fire the surge
USERS=1000 RAMP_MS=10000 npm run run
```

Knobs (env vars):
- `USERS` — how many students (default 1000). Start smaller (e.g. 100, 300) and climb.
- `RAMP_MS` — spread the surge over this many ms. `0` = everyone at once (worst case). `10000` ≈ a
  realistic "class starts, everyone logs in over 10s".
- `SEED_CONCURRENCY` — parallel registrations during seed (default 50).

## Reading the results

You get per-phase latency percentiles, error counts, and a PASS/FAIL per phase plus an overall verdict:

```
login        n= 1000  p50=  120ms  p95=  480ms  p99=   900ms  max=  1400ms  err=0   PASS (p95<=2000)
connect      n= 1000  p50=   40ms  p95=  210ms  ...                                  PASS (p95<=3000)
join         n= 1000  p50=  260ms  p95=  980ms  ...                                  PASS (p95<=3000)
answer       n= 1000  p50=   35ms  p95=  190ms  ...                                  PASS (p95<=1500)
leaderboard  n= 1000  p50=   45ms  p95=  260ms  ...                                  PASS (p95<=1500)
success rate: 99.8%   OVERALL: ✅ PASS
```

Default pass thresholds: login p95 ≤ 2s, connect/join p95 ≤ 3s, answer/leaderboard p95 ≤ 1.5s, and
≥99% of students complete the full flow. Tune them in `run.mjs` to your SLA.

## What to watch on the server during the run

- **Event-loop lag** should stay low even during the login surge (the bcrypt fix). If login p95 climbs
  into seconds, hashing is still blocking — check that native `bcrypt` and cluster mode are actually live.
- **CPU across all cores** should be used (cluster mode), not just one.
- **MongoDB**: connections and slow queries — the leaderboard cache should keep query volume flat as
  USERS grows.
- **Redis**: confirm it's connected (the backend logs "Socket.IO Redis adapter enabled" on start).

## Notes / limits

- Running ~1000 `socket.io-client` connections from **one** machine is fine on a modern laptop/VM. For
  much higher numbers, run this from a couple of boxes in parallel and combine the numbers.
- On re-runs, students who already answered get a `409` on submit — that's counted as success, not error.
