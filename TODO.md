# Spandan — TODO / Issue Log

> Open issues and follow-ups for the Spandan poll platform. Newest first.

---

## 2026-10-30 — ✅ Subtle waiting-room chime for teachers

**Added:**

- When a student actually **enters** the waiting room, the server emits `waiting:new` on the
  teacher's personal socket channel (`user:<teacherId>`). This fires from both the socket
  `room:join` and the REST `GET /rooms/join/:code` paths.
- The teacher console plays `playWaitingChime()` — two soft sine notes (E6 → A6) under half a
  second at peak 0.1 — so it is noticeable at the desk without interrupting the class.
- Only the transition INTO the waiting room chimes: a reconnect/rejoin by an already-waiting
  student is ignored (`becameWaiting` on `ensureRoomMember`).
- New room setting `waitingRoomChime` (default On) with an On/Off control in
  **Settings → Waiting Room & Chime**. The global device sound toggle still mutes everything.
- Covered by `sounds.test.js`, `waitingRoomMembership.test.js` (`becameWaiting`) and
  `roomUpdateValidation.test.js`, and verified live (chime on → one event, rejoin → no event,
  chime off → no event).

---

## 2026-10-30 — ✅ Rejoin and manual waiting-room attendance fixes

**Fixed:**

- **Leaving no longer deletes the membership row.** `room:leave` now sets `RoomMember.leftAt`
  instead of removing the document, so a rejoin (page navigation, tab close, network drop)
  restores the same admission decision. Previously the row was recreated from scratch: a manual
  room parked the returning student back in the waiting room, and an automatic room could
  re-classify them as `very_late` simply because time had passed.
- **Rejoins are auto-admitted.** An already-admitted student is never demoted, and `leftAt` is
  cleared on the next join. The original `joinedAt` / `admittedAt` / stamped attendance are kept,
  so the outcome is sticky.
- **Manual approval uses arrival time, not approval time.** `admitRoomMember` (and automatic
  promotion) now classifies attendance from `waitingRequestedAt || joinedAt`, so a teacher who
  approves an on-time student minutes later no longer marks them late or very late.
- Participant/waiting counts and the waiting list ignore `leftAt != null` (legacy rows without
  the field still count), including the participant count seeded by `GET /rooms/:id`.
- **Manual policy now gates only very-late arrivals.** On-time and late students are admitted
  automatically (late keeps the existing penalty notification); only `very_late` waits for the
  teacher's approval. Previously manual queued every student, which looked like everyone was
  being treated as late. The settings dialog copy was updated to match.
- Covered by new unit + DB tests (`waitingRoom.test.js`, `waitingRoomMembership.test.js`) and
  verified end-to-end against the running server (on-time → live, late → live with notice,
  very late → approve → watch-only, leave → rejoin → still admitted).

---

## 2026-10-30 — ✅ Student standing reset + Spurti live mirror

**Done:**

- Seeded SP now varies per student (deterministic FNV-1a offset, `STARTING_SP_VARIATION`,
  default ±250 around `STARTING_SP=1000`). Restart-safe: the same student always gets the
  same starting balance.
- All persisted strikes/ledger strike flags were cleared and every standing was rebuilt
  from the ledger. Run `node backend/scripts/reset_standing_strikes.js` (dry-run) and add
  `--apply` to perform the reset again.
- Dashboard SP + attendance can now mirror **Spurti** (`https://samagama.in/spurti`) live.
  Spurti is the source of truth for SP and standup attendance; Spandan only reads it.

**Enabling the mirror:** `SPURTI_MODE=auto` (the default) means "mirror Samagama if access is
available, otherwise use local data", decided per request:

- `SPURTI_ADMIN_EMAIL` + `SPURTI_ADMIN_TOKEN` set → `GET /admin/attendance` once per cache
  window (server-to-server, one call for the whole roster), matched by email.
- No admin credentials → the route forwards the browser's Samagama `chatengine_token` cookie
  to `GET /journey/state`.
- Neither available, the student is unknown to Spurti, or any call fails → the card keeps
  showing Spandan's local balances and the badge reads **Local data** instead of
  **Live from Spurti**. Nothing throws and the dashboard never waits on a dead endpoint.

So going live needs **no code change and no mode flip**: fill in the two admin values in
`backend/.env` and restart. `SPURTI_MODE=admin|sso|off` forces a branch; `SPURTI_DISABLED=1`
is a hard off switch. After a failed call the mirror backs off for `SPURTI_RETRY_MS`
(default 60 s), keeps serving the last good snapshot, and retries automatically — so access
granted later is picked up without a deploy. Boot logs one line (`[spurti] admin mirror of …`
or `[spurti] off — using local SP/attendance`), and the first successful/failed call logs the
active branch.

**Caveats:**

- Attendance is Spurti's standup minutes against the same 3,600-minute goal; values can
  exceed 3,600.
- The late streak / strike counter stays local to Spandan — the mirror only replaces the
  SP and attendance tiles.
- Local settlement still runs as a shadow ledger so strikes and history keep working; it
  is not shown while the mirror is live.

**Demo data:** `npm run seed:demo-activity` (`--workspace=backend`, add `-- --apply` to write)
gives every demo student real poll activity: room memberships, 40–100-point responses and at
least one deliberately missed poll, plus two approved polls in the live demo rooms. Stable per
email, so the dashboard does not reshuffle on refresh, and idempotent (`--apply` replaces the
demo students' responses only).

---

## 2026-05-29 — 🔴 MongoDB authentication failing for `rohit` user (`rohit_spandan` DB)

**Status:** ✅ RESOLVED 2026-05-29 ~13:54 IST.

**Root cause:** Password mismatch. The `rohit` user **still existed** on
`rohit_spandan` (roles `readWrite:rohit_spandan, readWrite:spandan`) — it was
NOT deleted. Its password in MongoDB no longer matched the one in
`backend/.env`, so both the app and `mongosh` got `Authentication failed`.

**Fix applied:**
1. Reset the `rohit` password on `rohit_spandan` to a known value via admin
   (`db.getSiblingDB('rohit_spandan').updateUser('rohit', { pwd: ... })`).
2. Updated `backend/.env` `MONGODB_URI` to match.
3. Restarted the **real backend** (`node src/index.js` on :3001) — note this is
   NOT the pm2-managed process; pm2 only runs the static/proxy `server.js` on
   :5002 which proxies to :3001. The backend came up `mongodb: "connected"`.
4. Verified end-to-end: `POST /spandan/api/auth/login` now returns a clean
   `401 Invalid email or password` for bad creds (real DB query) instead of the
   `users.findOne()` buffering timeout.

**Note:** The backend on :3001 was launched manually (orphaned `bash -c ... node
src/index.js`, not under pm2). Consider bringing it under pm2 so restarts are
one command and it survives reboots.

<details><summary>Original diagnostic notes (for the record)</summary>

## 2026-05-29 — 🔴 MongoDB authentication failing for `rohit` user (`rohit_spandan` DB)

**Severity:** Blocker — app is down. Login returns `401 Unauthorized`; UI shows
`Operation \`users.findOne()\` buffering timed out after 10000ms`.

### Symptoms
- Both backends report `mongodb: "disconnected"` after the last restart.
- `POST https://samagama.in/spandan/api/auth/login` → **401 (Unauthorized)**.
- Frontend console: `App: disconnecting socket` + `users.findOne()` buffering
  timeout (Mongoose can't reach an authenticated connection, so the query never
  resolves).
- Connecting **directly via `mongosh`** with the same credentials also fails:
  `MongoServerError: Authentication failed.`

### What we know
- The MongoDB **server itself is healthy** — the `chatengine` DB authenticates
  fine (verified from the Sakshi processes), so this is **not** a server outage.
- The failure is specific to the **`rohit` user on the `rohit_spandan` database**.
- It **worked earlier this morning** and broke sometime before now.
- Because native `mongosh` rejects the exact same credentials, the creds in the
  app config **no longer match any user in MongoDB** right now.

### Likely causes (to confirm)
1. The `rohit` user was **deleted or its password changed** since this morning.
2. The password was **entered incorrectly** in the email / when the connection
   string was set.

### Fix / next steps
1. Recover the **correct credentials** from whoever provisioned the
   `rohit_spandan` database (or check the original setup email).
2. If the user is gone, **recreate it** (run as an admin user via `mongosh`):
   ```javascript
   db.getSiblingDB('rohit_spandan').createUser({
     user: 'rohit',
     pwd:  'YOUR_PASSWORD_HERE',
     roles: [{ role: 'readWrite', db: 'rohit_spandan' }]
   })
   ```
3. Update the backend `.env` (`MONGODB_URI`) with the confirmed credentials and
   restart both backends; verify `mongodb: "connected"` and a successful login.
4. Add a startup health log / alert so a future auth break is caught immediately
   rather than surfacing as a 10s buffering timeout.

---
</details>
