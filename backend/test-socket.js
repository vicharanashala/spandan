import { io } from 'socket.io-client';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Generate mock tokens (in a real app, these come from the /api/auth login endpoint)
const teacherToken = jwt.sign({ userId: 'teacher_1', role: 'teacher' }, JWT_SECRET);
const studentToken = jwt.sign({ userId: 'student_1', role: 'student' }, JWT_SECRET);

const roomCode = 'TEST12';

console.log('Starting Test... Connecting Sockets');

// Connect Teacher
const teacherSocket = io('http://localhost:3001', {
  auth: { token: teacherToken }
});

// Connect Student
const studentSocket = io('http://localhost:3001', {
  auth: { token: studentToken }
});

teacherSocket.on('connect', () => {
    console.log('[Teacher] Connected!');
    teacherSocket.emit('room:join', { roomCode });
});

studentSocket.on('connect', () => {
    console.log('[Student] Connected!');
    studentSocket.emit('room:join', { roomCode });
});

// Coordinate the flow
teacherSocket.on('room:joined', () => {
    console.log(`[Teacher] Joined room ${roomCode}. Waiting for student...`);
});

studentSocket.on('room:joined', () => {
    console.log(`[Student] Joined room ${roomCode}. Waiting for question...`);
    
    // Once student is joined, teacher pushes question
    setTimeout(() => {
        console.log('\n[Teacher] Pushing question to room...');
        teacherSocket.emit('question_push', {
            roomCode,
            questionId: 'q_test_1',
            text: 'Is Spandan real-time?',
            type: 'tf',
            category: 'recall',
            duration: 10000 // 10 seconds
        });
    }, 1000);
});

// Student listens for the pushed question
studentSocket.on('question_push', (data) => {
    console.log(`[Student] Received Question: "${data.text}"`);
    console.log(`[Student] Duration: ${data.duration}ms`);
});

// Student listens for the server-authoritative timer tick
studentSocket.on('timer_tick', (data) => {
    console.log(`[Student] Timer Tick: ${Math.ceil(data.remainingTimeMs / 1000)}s remaining`);
    if (data.remainingTimeMs <= 0) {
        console.log('\n[Student] Time is up!');
        console.log('Test complete. Exiting in 2 seconds...');
        setTimeout(() => process.exit(0), 2000);
    }
});

// Simulate Disconnect/Reconnect Resilience
setTimeout(() => {
    console.log('\n--- Simulating Student Disconnect (Network Drop) ---');
    studentSocket.disconnect();
    
    setTimeout(() => {
        console.log('\n--- Simulating Student Reconnect ---');
        studentSocket.connect();
        studentSocket.emit('room:join', { roomCode });
        // Ask server for the current state to resync timer
        studentSocket.emit('room_sync', { roomCode });
    }, 3000); // Reconnect after 3 seconds
}, 4000); // Disconnect 4 seconds into the 10 second poll

// Listen for the resync response
studentSocket.on('room_state', (data) => {
    if (data.activePoll) {
        console.log(`[Student] Reconnected! Resynced exact remaining time: ${Math.ceil(data.exactRemainingTimeMs / 1000)}s`);
    } else {
        console.log(`[Student] Reconnected, but no active poll.`);
    }
});

// Handle errors
teacherSocket.on('error_msg', (err) => console.error('[Teacher Error]', err.message));
studentSocket.on('error_msg', (err) => console.error('[Student Error]', err.message));
