// backend/src/services/questionScheduler.js


// Map of roomCode => interval ID
const intervals = new Map();

const QUESTION_INTERVAL_MS = 25 * 60 * 1000; // 25 minutes

/**
 * Starts a recurring timer for the given room to generate a question every 25 minutes.
 * The timer calls the internal API endpoint which emits the question via Socket.IO.
 */
export function startQuestionScheduler(roomCode, io) {
  if (intervals.has(roomCode)) return; // already running

  const intervalId = setInterval(async () => {
    try {
      // Call the backend route to generate a question and broadcast
      await fetch(`${process.env.BASE_URL || 'http://localhost:3001'}/api/question/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode }),
      });
    } catch (err) {
      console.error('Failed to generate scheduled question for', roomCode, err);
    }
  }, QUESTION_INTERVAL_MS);

  intervals.set(roomCode, intervalId);
  console.log(`Started 25‑min question scheduler for room ${roomCode}`);
}

export function stopQuestionScheduler(roomCode) {
  const intervalId = intervals.get(roomCode);
  if (intervalId) {
    clearInterval(intervalId);
    intervals.delete(roomCode);
    console.log(`Stopped question scheduler for room ${roomCode}`);
  }
}
