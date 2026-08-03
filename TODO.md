# Spandan — TODO / Issue Log

> Open issues and follow-ups for the Spandan poll platform. Newest first.

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
