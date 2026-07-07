import jwt from 'jsonwebtoken';
import { calculateTTAScore } from '../utils/scoring.js';
import mongoose from 'mongoose';

// In-memory Room State mapping roomCode to the active poll and connected students
const activeRooms = new Map();

export function setupSockets(io) {
  // Middleware for Role-Based Authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      socket.data.userId = decoded.userId || decoded.id || 'anonymous';
      socket.data.role = decoded.role || 'student'; // Fallback to student if no role in JWT
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, role } = socket.data;
    console.log(`Client connected: ${socket.id} (user: ${userId}, role: ${role})`);
    
    socket.on('room:join', ({ roomCode }) => {
      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      
      if (!activeRooms.has(roomCode)) {
        activeRooms.set(roomCode, { activePoll: null, students: new Map() });
      }
      
      const roomState = activeRooms.get(roomCode);
      
      if (role === 'student') {
        roomState.students.set(userId, {
          socketId: socket.id,
          status: 'connected',
          hasAnswered: false
        });
      }
      
      io.to(roomCode).emit('room:joined', { userId, role, message: `Joined room ${roomCode}` });
    });
    
    // Teacher only: push question
    socket.on('question_push', (data) => {
      if (role !== 'teacher') {
        return socket.emit('error_msg', { message: 'Unauthorized: Only teachers can push questions' });
      }
      
      const { roomCode, questionId, text, type, options, category, duration } = data;
      const roomState = activeRooms.get(roomCode);
      if (!roomState) {
          return socket.emit('error_msg', { message: 'Room not initialized. Please join first.' });
      }
      
      // Clear any existing timer
      if (roomState.activePoll?.timerIntervalId) {
        clearInterval(roomState.activePoll.timerIntervalId);
      }
      
      // Reset student answers for new poll
      roomState.students.forEach(student => {
          student.hasAnswered = false;
      });
      
      const newPoll = {
        questionId, text, type, options, category, duration,
        serverStartTime: Date.now(),
        timerIntervalId: null
      };
      
      roomState.activePoll = newPoll;
      
      // Broadcast question to room
      io.to(roomCode).emit('question_push', {
        questionId, text, type, options, category,
        serverStartTime: newPoll.serverStartTime,
        duration
      });
      console.log(`Question pushed to ${roomCode}. Duration: ${duration}ms`);
      
      // Start server-authoritative timer
      newPoll.timerIntervalId = setInterval(() => {
        const remainingTimeMs = duration - (Date.now() - newPoll.serverStartTime);
        if (remainingTimeMs <= 0) {
          clearInterval(newPoll.timerIntervalId);
          newPoll.timerIntervalId = null;
          io.to(roomCode).emit('timer_tick', { questionId, remainingTimeMs: 0 });
          // Ensure we don't hold the active poll forever once ended
          console.log(`Poll ${questionId} in room ${roomCode} ended.`);
        } else {
          io.to(roomCode).emit('timer_tick', { questionId, remainingTimeMs });
        }
      }, 1000); // 1-second broadcast interval
    });
    
    // Student only: submit answer
    socket.on('submit_answer', (data) => {
      if (role !== 'student') return;
      
      const { roomCode, questionId, answer } = data;
      const roomState = activeRooms.get(roomCode);
      if (!roomState || !roomState.activePoll || roomState.activePoll.questionId !== questionId) return;
      
      // Check if time is up on server
      const remainingTimeMs = roomState.activePoll.duration - (Date.now() - roomState.activePoll.serverStartTime);
      if (remainingTimeMs <= 0) {
          return socket.emit('error_msg', { message: 'Time is up. Answer not accepted.' });
      }
      
      const studentState = roomState.students.get(userId);
      if (studentState) {
        if (studentState.hasAnswered) {
             return socket.emit('error_msg', { message: 'Answer already locked in.' });
        }
        studentState.hasAnswered = true;
      }
      
      console.log(`Answer submitted by ${userId} for ${questionId}. Remaining time: ${remainingTimeMs}ms`);
      
      // Calculate score and save to DB
      (async () => {
        try {
          if (mongoose.connection.readyState === 1) {
            const Response = (await import('../models/Response.js')).default;
            const Question = (await import('../models/Question.js')).default;
            
            // Get Question to find allotted time and base points (defaulting if needed)
            const questionDoc = await Question.findById(questionId).catch(() => null);
            const allottedTimeMs = roomState.activePoll.duration;
            const basePoints = questionDoc?.points || 1000;
            
            const isCorrect = questionDoc ? (questionDoc.correctAnswer === answer) : false; // Naive check for now
            
            // Calculate TTA score
            let score = 0;
            if (isCorrect) {
               score = calculateTTAScore(remainingTimeMs, allottedTimeMs, basePoints, 0);
            }
            
            const responseDoc = new Response({
              roomId: roomState.roomId || null, // Would need room _id, fallback to null for demo if missing
              questionId: questionId.length === 24 ? questionId : new mongoose.Types.ObjectId(), // Handle demo string IDs
              studentId: userId.length === 24 ? userId : new mongoose.Types.ObjectId(), // Handle demo string IDs
              selectedOption: typeof answer === 'number' ? answer : -1, // Fallback if answer isn't index
              isCorrect: isCorrect,
              responseTime: roomState.activePoll.duration - remainingTimeMs,
              points: score,
              tabSwitched: studentState?.hasTabSwitched || false
            });
            await responseDoc.save();
          }
        } catch (e) {
          console.error('Failed to save response to DB:', e.message);
        }
      })();

      // Broadcast submission to Teacher
      io.to(roomCode).emit('response:new', { studentId: userId, questionId, answer, remainingTimeMs });
    });

    // Reconnect Sync Event
    socket.on('room_sync', ({ roomCode }) => {
      const roomState = activeRooms.get(roomCode);
      if (!roomState || !roomState.activePoll) {
          return socket.emit('room_state', { activePoll: null });
      }
      
      const remainingTimeMs = roomState.activePoll.duration - (Date.now() - roomState.activePoll.serverStartTime);
      if (remainingTimeMs > 0) {
        // Send exact remaining time
        socket.emit('room_state', {
          activePoll: {
             questionId: roomState.activePoll.questionId,
             text: roomState.activePoll.text,
             type: roomState.activePoll.type,
             options: roomState.activePoll.options,
             category: roomState.activePoll.category,
             duration: roomState.activePoll.duration,
             serverStartTime: roomState.activePoll.serverStartTime
          },
          exactRemainingTimeMs: remainingTimeMs
        });
      } else {
        socket.emit('room_state', { activePoll: null });
      }
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.roomCode;
      if (roomCode && activeRooms.has(roomCode)) {
        const roomState = activeRooms.get(roomCode);
        if (role === 'student' && roomState.students.has(userId)) {
          const studentState = roomState.students.get(userId);
          studentState.status = 'disconnected';
          studentState.disconnectTime = Date.now();
          studentState.socketId = null;
          console.log(`Student ${userId} disconnected from ${roomCode}. Marking as poll_paused.`);
        }
      }
    });
  });
}

// Helper for the REST Fallback endpoint
export function getActiveRoomState(roomCode) {
    const roomState = activeRooms.get(roomCode);
    if (!roomState || !roomState.activePoll) return null;
    
    const remainingTimeMs = roomState.activePoll.duration - (Date.now() - roomState.activePoll.serverStartTime);
    if (remainingTimeMs <= 0) return null;
    
    return {
        activePoll: {
            questionId: roomState.activePoll.questionId,
            text: roomState.activePoll.text,
            type: roomState.activePoll.type,
            options: roomState.activePoll.options,
            category: roomState.activePoll.category,
            duration: roomState.activePoll.duration,
            serverStartTime: roomState.activePoll.serverStartTime
        },
        exactRemainingTimeMs: remainingTimeMs
    };
}
