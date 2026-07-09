# Offline Answer Submission Testing Guide

This guide provides step-by-step instructions for testing the offline answer submission feature.

## Feature Overview

Students can now submit answers while offline. Their submissions are:
1. **Queued locally** with a visual "Saved — will send once reconnected" indicator
2. **Persisted to localStorage** so they survive page refreshes and tab crashes
3. **Automatically synced** when the connection is restored
4. **Protected from duplicates** via the backend's unique constraint on (roomId, questionId, studentId)

## Prerequisites

- Backend server running
- Frontend application running
- A test classroom with at least one teacher and one student
- Chrome DevTools available (for simulating offline mode)

## Test Scenario 1: Basic Offline Submission

**Goal:** Verify that answers are queued and show offline UI when submitted without connection.

### Steps:

1. **Setup**
   - Log in as a student
   - Join a classroom room

2. **Simulate Offline**
   - Open Chrome DevTools (F12)
   - Go to **Network** tab
   - Click the "Throttling" dropdown (usually says "No throttling")
   - Select **Offline**

3. **Submit an Answer**
   - Wait for the teacher to start a question
   - Select an answer option
   - Click "Submit Answer"
   - **Expected:** You should see "💾 Answer Saved Locally" instead of "✓ Answer Submitted"
   - The sync banner at the top should show "1 answer saved. Will sync when reconnected."

4. **Verification**
   - Open DevTools Console (F12 → Console tab)
   - Run: `localStorage.getItem('pendingAnswers')`
   - **Expected:** You should see JSON with your queued answer

5. **Refresh Page**
   - Press F5 to refresh while still offline
   - **Expected:** The pending answer should still be visible in localStorage
   - **Verification:** Run the same localStorage check - answer should still be there

---

## Test Scenario 2: Auto-Sync on Reconnect

**Goal:** Verify that queued answers are automatically sent when connection is restored.

### Steps:

1. **Follow Scenario 1** (submit answer while offline)

2. **Restore Connection**
   - Open Chrome DevTools (F12)
   - Go to **Network** tab
   - Click the throttling dropdown
   - Select **No throttling** (or any online option)

3. **Observe Sync**
   - **Expected:** Within a few seconds, you should see:
     - Banner changes to "🔄 Syncing 1 pending answer..."
     - Submit confirmation changes to show syncing status
     - Then banner shows "✓ All answers synced successfully"

4. **Verify in Database**
   - Check the MongoDB responses collection for the room
   - **Query:** `db.responses.find({questionId: "<id>", studentId: "<id>"})`
   - **Expected:** Exactly one response record (not zero or two)

5. **Verify in UI**
   - On the leaderboard, check that points were awarded correctly
   - Your score should reflect the correct answer and time-decay calculation

---

## Test Scenario 3: Late Arrival (Optional Policy Test)

**Goal:** Verify that answers submitted after question time is up are still processed.

### Steps:

1. **Join a Room**
   - Teacher starts a question with a timer (e.g., 30 seconds)
   - Simulate **Offline** mode (Chrome DevTools → Network → Offline)

2. **Wait for Time to Expire**
   - Let the 30-second timer on the client count down to 0
   - Still offline, do NOT submit yet

3. **Submit After Timer**
   - The question area will show "Waiting for Next Question"
   - But you should still be able to see your pending answer queued
   - Optionally try to submit another question's answer

4. **Restore Connection**
   - Set Network back to **No throttling**
   - Observe sync

5. **Verify Backend Behavior**
   - Check the responses in MongoDB
   - **Expected:** The late answer should be recorded (backend accepts all valid submissions)
   - **Note:** The `responseTime` field will reflect the full time-to-answer, indicating a slow response

---

## Test Scenario 4: Duplicate Prevention

**Goal:** Verify that resending the same offline answer doesn't create duplicates.

### Steps:

1. **Queue an Offline Answer**
   - Follow Scenario 1 to queue an answer while offline
   - Note the localStorage JSON (copy the pending answer object)

2. **Manually Trigger Sync Twice**
   - Open Chrome DevTools Console (F12 → Console)
   - Restore connection (Network → No throttling)
   - Wait for automatic sync to complete (~2-3 seconds)

3. **Verify Single Record**
   - Check MongoDB responses collection:
     ```
     db.responses.find({questionId: "<id>", studentId: "<id>"}).count()
     ```
   - **Expected:** Result is exactly 1 (not 2 or more)
   - **HTTP Status:** First request returns 201 (created), any resend returns 409 (conflict)

4. **Verify localStorage Cleared**
   - Run in Console: `localStorage.getItem('pendingAnswers')`
   - **Expected:** Returns `[]` (empty array) after sync completes

---

## Test Scenario 5: Multiple Pending Answers

**Goal:** Verify that multiple queued answers sync correctly in sequence.

### Steps:

1. **Setup Multiple Questions Offline**
   - Simulate offline mode
   - Teacher rapidly starts multiple questions (2-3)
   - For each, select an answer and submit
   - **Expected:** Sync banner shows "3 answers saved. Will sync when reconnected."

2. **Check localStorage**
   - Run: `const pending = JSON.parse(localStorage.getItem('pendingAnswers')); pending.length`
   - **Expected:** Should show 3

3. **Restore Connection**
   - Set network back online
   - Watch the banner: "🔄 Syncing 3 pending answers..."
   - Should sync each one (may take a few seconds)

4. **Verify All Recorded**
   - Check MongoDB:
     ```
     db.responses.find({studentId: "<id>"}).count()
     ```
   - Should match the number of questions you answered

---

## Test Scenario 6: Page Refresh While Syncing

**Goal:** Verify that pending answers persist even if page is refreshed mid-sync.

### Steps:

1. **Queue 3 Answers Offline**
   - Follow Scenario 5 steps 1-2

2. **Restore Connection But Immediately Refresh**
   - Set network to online
   - Wait 0.5 seconds
   - Press F5 (refresh page) while banner still shows "🔄 Syncing..."

3. **Check Persistence**
   - After page reloads and reconnects to socket
   - Banner should show remaining pending answers
   - Sync should resume automatically

4. **Final Verification**
   - Banner eventually shows all synced
   - MongoDB shows all responses created

---

## Test Scenario 7: Connection Loss During Sync

**Goal:** Verify resilience if connection is lost while syncing.

### Steps:

1. **Queue 2 Answers Offline**
   - Simulate offline, submit two answers

2. **Go Online, Then Offline Again**
   - Set network to online
   - Banner shows "🔄 Syncing..."
   - After ~1 second, set network back to **Offline**

3. **Wait and Observe**
   - First answer may have synced, second may still be pending
   - Pending answers remain in localStorage and banner

4. **Restore Connection Again**
   - Set network back to online
   - Sync should resume and complete
   - Verify exact number of records in MongoDB (should match total submitted)

---

## Browser DevTools Reference

### Simulate Offline in Chrome:

1. Open DevTools: **F12** or **Ctrl+Shift+I**
2. Navigate to **Network** tab
3. Look for the throttling dropdown (top area, usually says "No throttling")
4. Click and select **Offline**
5. To go back online: select **No throttling**

### Alternative: Disable Specific Connections

If you want to test socket disconnect specifically:
1. DevTools → **Network** tab → **XHR/Fetch** filter
2. Right-click on socket.io requests
3. Select **Block request URL** (simulates network error for that endpoint)

---

## Console Commands for Testing

```javascript
// Check pending answers in localStorage
localStorage.getItem('pendingAnswers')

// Parse and pretty-print
JSON.parse(localStorage.getItem('pendingAnswers'))

// Clear pending answers (for test reset)
localStorage.removeItem('pendingAnswers')

// Access the store directly (if exposed)
// Note: Zustand stores require special setup to access from console
// Workaround: dispatch events or use React DevTools
```

---

## Expected Behaviors Summary

| Scenario | Expected Result |
|----------|-----------------|
| Submit offline | Shows "💾 Saved Locally", queues to localStorage |
| Page refresh offline | Pending answers persist in localStorage |
| Reconnect | Banner shows "🔄 Syncing...", then "✓ Synced" |
| Duplicate submission | Server returns 409, prevents duplicate DB record |
| Late arrival | Still accepted, counted as late response |
| Multiple pending | All sync in sequence, no race conditions |
| Connection loss during sync | Remaining answers stay queued, sync resumes on reconnect |

---

## Troubleshooting

### Sync Not Starting on Reconnect?
- Check DevTools Console for errors
- Ensure the socket reconnects (look for "Socket connected" message)
- Verify `registerSyncPendingAnswersCallback` is being called

### Answers Not in localStorage?
- Check if localStorage is enabled in browser settings
- Verify the browser is not in Private/Incognito mode (localStorage is disabled)
- Check for browser errors in DevTools Console

### Duplicate Records Created?
- Indicates unique index may not be working
- Check MongoDB schema: `db.responses.getIndexes()`
- Verify unique constraint on (roomId, questionId, studentId)

### Sync Hanging?
- Check backend logs for errors
- Verify backend is responding with 201 or 409
- Check network throttling isn't too aggressive (set to 3G or higher)

---

## Cleanup for Next Test

```javascript
// Reset for next test
localStorage.removeItem('pendingAnswers')
// Then refresh page
window.location.reload()
```

---

## Notes

- **Timestamps:** All pending answers include a `timestamp` field for debugging
- **Attempt Tracking:** Each pending answer has an `attemptCount` to detect retry loops
- **Connection State:** The UI correctly displays `isConnected` from the Socket.IO store
- **Performance:** Syncing 5+ answers is tested to ensure no UI freezing
