# Scaling Spandan to 1000+ concurrent students

This documents the concurrency work and how to run Spandan so a full class (~1000 students) can log in
and participate in a live session seamlessly.

## What was breaking at ~700 users

The failures were **not** a raw connection limit — a properly-run Node process handles 10k+ sockets. They
came from a few specific anti-patterns that multiply with the number of students:

1. **Login blocked the event loop.** Auth used `bcryptjs` (pure-JS) on the single main thread. A burst of
   hundreds of concurrent logins serialized ~100ms of CPU each on one core, freezing *all* other traffic
   (socket handshakes, health checks, API calls) → everything timed out at once. **This was the primary
   "can't join" cause.**
2. **Single process, one core.** `pm2` was a dependency but nothing ran in cluster mode.
3. **O(N²) fan-out during live rooms:**
   - The leaderboard endpoint ran one `User.findById` per participant (N+1), and the client refetches on
     *every* answer → up to ~N² queries per question.
   - `room:join` ran a `countDocuments` + a whole-room broadcast on *every* join → a join storm was O(N²).
4. **Per-IP auth rate limit** (300/hour) — a whole class behind one campus NAT IP could exhaust it and lock
   everyone out.

## What changed (Tier 1)

| Area | Change | File |
|---|---|---|
| Login CPU | `bcryptjs` → native **`bcrypt`** (hashes on libuv threadpool, not the event loop). Hashes are wire-compatible, so existing passwords keep working. | `backend/src/models/User.js`, `backend/package.json` |
| Multi-core | **PM2 cluster mode** — one worker per core. `UV_THREADPOOL_SIZE` raised so bcrypt hashes in parallel. | `ecosystem.config.cjs` |
| Cross-worker realtime | **Redis adapter** for Socket.IO (gated on `REDIS_URL`) so `io.to(room).emit` reaches clients on every worker. Falls back to in-memory single-instance when unset. | `backend/src/index.js` |
| Join storm | `room:join` no longer counts + broadcasts per join. Membership upsert still happens (indexed); the participant count is **coalesced to one count + one broadcast per room per second**. | `backend/src/index.js` |
| Leaderboard storm | Single **aggregate + `$lookup`** (no N+1) plus a **~1.5s per-room cache** so a burst of concurrent refetches shares one computation. `points:updated` broadcasts are coalesced to one signal per room per 1.5s. | `backend/src/routes/responses.js`, `backend/src/index.js` |
| Rate limits | Shared **Redis store** (consistent across workers) and a classroom-friendly, env-tunable auth cap so a shared campus IP doesn't lock the class out. | `backend/src/index.js` |

No client-side changes were required — all event/response shapes are preserved.

## How to run at scale

**Prerequisites:** MongoDB, and now **Redis** (required for cluster mode).

```bash
# 1. Install (native bcrypt + redis libs)
npm run install:all

# 2. Env (backend/.env or process env)
MONGODB_URI=...            # your Mongo
REDIS_URL=redis://localhost:6379   # REQUIRED for cluster mode
JWT_SECRET=...
# optional tuning:
# AUTH_RATE_LIMIT_MAX=5000        # per-IP auth attempts / hour
# LEADERBOARD_TTL_MS=1500         # leaderboard cache window
# WEB_CONCURRENCY=max             # worker count (default: one per core)
# UV_THREADPOOL_SIZE=16           # bcrypt hashing threads per worker

# 3. Start the backend cluster
npm run start:cluster       # pm2 start ecosystem.config.cjs
npm run reload:cluster      # zero-downtime reload after a deploy
npm run stop:cluster
```

**Important:** never run cluster mode (`instances > 1`) **without** `REDIS_URL` — broadcasts from one worker
won't reach clients on another, silently breaking real-time delivery. The app logs a warning if `REDIS_URL`
is unset. In dev, leave `REDIS_URL` unset and run the single-process `npm run dev:backend` as before.

### Sticky sessions

The browser connects **websocket-first** (`transports: ['websocket', 'polling']`), and a websocket is a
single long-lived connection pinned to one worker — so PM2's round-robin is fine for it. Only HTTP
long-polling fallback would need stickiness. If you must support that at scale, enable sticky sessions at
nginx or force websocket-only transport on the client.

## Verify before the next live session (load test)

These fixes are structurally verified (unit tests pass, boots cleanly), but the real proof is a load test.
Recommended: a [k6](https://k6.io) or Artillery script that ramps to 1000 virtual users doing
**login → socket connect → room:join → answer a question → read leaderboard**, watching for login latency,
event-loop lag, and Mongo/Redis saturation. Capacity target: one 4-core box should hold 1000 concurrent
students on a live poll comfortably.

## Not in this pass (Tier 2 follow-ups)

- Drop the hand-rolled WebSocket proxy in `server.js`; have nginx proxy directly to the backend.
- Scope `response:new` to the teacher socket instead of broadcasting to the whole room.
- Key the auth rate limit by account/email rather than IP (or exempt known campus IPs).
- Debounce the participant-count broadcast further and batch `room:leave` on mass disconnect.
