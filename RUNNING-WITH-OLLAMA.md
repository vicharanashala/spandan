# Spandan — Run locally with Ollama (no agent needed)

This file is self-contained. It assumes you have:
- Windows 10/11 with PowerShell
- MongoDB installed at `C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe`
- Ollama installed and at least one chat model pulled (e.g. `llama3.1:8b`)
- Node.js 20+ on PATH
- This repo cloned at `C:\Users\ajith\Desktop\spandan-fresh-archived-2026-07-12\`

## 1. One-time setup

```powershell
cd C:\Users\ajith\Desktop\spandan-fresh-archived-2026-07-12
npm install
```

If `npm install` fails because workspaces can't find deps in member dirs, run it from the repo root once (this is a known npm-workspaces hoisting quirk; the lockfile is committed so a clean install reproduces the same tree).

## 2. Start MongoDB (leave running)

```powershell
& "C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe" --dbpath C:\data\db
```

If `C:\data\db` doesn't exist:
```powershell
mkdir C:\data\db -Force
```

## 3. Configure Ollama endpoint in backend

Edit `backend/.env` (create if it doesn't exist) and ensure it has:

```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
PORT=3001
MONGO_URL=mongodb://localhost:27017/spandan
JWT_SECRET=local-dev-secret-change-me
```

## 4. Swap the LLM endpoint to Ollama

Open `backend/src/services/questionService.js` and replace the `chatCompletion(...)` call with the Ollama OpenAI-compatible endpoint. The exact line depends on the upstream version; look for `https://api.minimaxi.chat` or `api.minimax.io` and replace with:

```js
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const response = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: process.env.OLLAMA_MODEL || 'llama3.1:8b',
    messages: [...same as before...],
    temperature: 0.4,
    num_predict: 2000,        // Ollama-specific; old max_tokens is ignored
    stream: false
  })
})
const data = await response.json()
const text = data?.choices?.[0]?.message?.content
```

The rest of `questionService.js` (parsing the JSON question list out of the model response) should keep working — Ollama returns the same `{choices: [{message: {content: "..."}}]}` shape that MiniMax did.

If you want it cleaner: factor the LLM call into a tiny adapter file like `backend/src/services/llmAdapter.js` with `async function chatCompletion({system, user})` so swapping providers later is one edit, not three.

## 5. Start the backend

```powershell
cd backend
node src/index.js
```

Look for `MongoDB connected`, `backend on :3001`, and the duplicate-index warning (harmless — `expires` field is declared with both `index: true` and `schema.index()`).

## 6. Start the frontend

```powershell
cd frontend
node ../node_modules/vite/bin/vite.js
```

(`npm run dev` also works but this bypasses any workspaces hoisting issues.)

Open http://localhost:5173/spandan/

## 7. Login

| Role | Email | Password |
|---|---|---|
| Teacher | `rashmi@spandan.local` | `Test1234!` |
| Teacher (alt) | `test@spandan.local` | `Test1234!` |
| Student | `student@spandan.local` | `Test1234!` |
| Student (alt) | `student2@spandan.local` | `Test1234!` |

## Common gotchas (Windows + Vite + PowerShell)

- **`npm install` in workspaces sometimes leaves member dirs empty.** Fix: run `npm install` from the repo root, not from `backend/` or `frontend/`.
- **Vite does NOT HMR `vite.config.js`.** If you change it, kill+restart Vite.
- **Vite proxy paths.** The frontend proxies `/api` and `/socket.io` to the backend on :3001. If you run Vite at a sub-path (this repo does — `/spandan/`), the proxy is keyed correctly in `vite.config.js` already.
- **PowerShell `&&` doesn't work.** Use `;` between commands, or `If ($LASTEXITCODE -eq 0) {...}`.
- **PowerShell `curl` is `Invoke-WebRequest`.** Use `node -e "fetch(...)"` or real `curl.exe` (which is in `C:\Windows\System32\`).
- **`event.score` is never stored.** Always compute via `scoreEvent(...)` at read time. Reading `event.score` off the DB doc returns 0.

## Tests

```powershell
cd backend; npm test               # 208/212 (4 pre-existing topicService failures)
cd frontend; npm test              # 38/38
```

## Smoke scripts

```powershell
cd backend
node scripts/smoke/poll_lifecycle_proof.mjs          # 40/40 PASS
node scripts/smoke/recovery_poll_5x_proof.mjs        # 70/70 PASS
node scripts/smoke/poll_recovery_reset_proof.mjs     # 9/9 PASS
node scripts/smoke/fresh_room_topic.mjs              # no-leak check
node scripts/smoke/recovery_flow.mjs                 # 6/6 PASS
```

## When something doesn't work

1. Check Mongo is on :27017 (test with `mongosh` or any client)
2. Check backend log: `%TEMP%\spandan-backend.log` and `%TEMP%\spandan-backend-err.log`
3. Check Vite log: `%TEMP%\spandan-frontend.log`
4. **Stale-PID is the #1 silent failure mode.** If the backend was running before you edited code and isn't picking up your changes:
   ```powershell
   Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId,CreationDate,CommandLine
   ```
   Then `Stop-Process -Id <pid> -Force` and restart.
