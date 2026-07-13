// backend/src/services/analyticsService.js

import mongoose from 'mongoose';

// Lazy import models to avoid circular dependencies
const getModel = async (name) => {
  const module = await import(`../models/${name}.js`);
  return module.default;
};

/**
 * Calculate attendance as proportion of class segments the student participated in.
 * Uses Transcript entries as segments. Attendance = attendedSegments / totalSegments.
 */
export const calculateAttendance = async (studentId, roomId) => {
  const Transcript = await getModel('Transcript');
  const Response = await getModel('Response');
  const Question = await getModel('Question');
  // Total distinct segments for the room
  const totalSegments = await Transcript.distinct('segmentIndex', { roomId: new mongoose.Types.ObjectId(roomId) });
  if (totalSegments.length === 0) return 0;
  // Get all questionIds the student answered in this room
  const studentResponses = await Response.find({
    studentId: new mongoose.Types.ObjectId(studentId),
    roomId: new mongoose.Types.ObjectId(roomId)
  }).lean();
  if (studentResponses.length === 0) return 0;
  const questionIds = studentResponses.map(r => r.questionId);
  // Get distinct segmentIndexes of those answered questions
  const attendedSegments = await Question.distinct('segmentIndex', {
    _id: { $in: questionIds }
  });
  const attendance = attendedSegments.length / totalSegments.length;
  return attendance; // range 0-1
};

/**
 * Calculate average quiz score as points earned / maximum possible points.
 * Returns a value between 0‑1.
 */
export const calculateQuizScore = async (studentId, roomId) => {
  const Response = await getModel('Response');
  const Question = await getModel('Question');

  // Get all responses for the student in the room
  const responses = await Response.find({ studentId, roomId }).lean();
  if (responses.length === 0) return 0;

  // Sum points earned
  const totalPointsEarned = responses.reduce((sum, r) => sum + (r.points || 0), 0);

  // Determine maximum possible points (assume each question max 100 unless overridden)
  const questionIds = responses.map(r => r.questionId);
  const questions = await Question.find({ _id: { $in: questionIds } }).lean();
  const totalMaxPoints = questions.reduce((sum, q) => sum + (q.points || 100), 0);

  if (totalMaxPoints === 0) return 0;
  return totalPointsEarned / totalMaxPoints; // 0‑1
};

/**
 * Placeholder for assignment completion – currently returns 0.
 */
export const calculateAssignmentCompletion = async (studentId, roomId) => {
  // Future implementation will reference Assignment model.
  return 0;
};

/**
 * Participation = answered questions / launched questions.
 */
export const calculateParticipation = async (studentId, roomId) => {
  const Response = await getModel('Response');
  const Question = await getModel('Question');

  const totalQuestions = await Question.countDocuments({ roomId, status: 'approved' });
  if (totalQuestions === 0) return 0;

  const answeredQuestionIds = await Response.distinct('questionId', { studentId, roomId });
  const answeredCount = answeredQuestionIds.length;
  return answeredCount / totalQuestions;
};

/**
 * Combine metrics into a Learning Progress Score (0‑100).
 */
export const calculateLPS = ({ attendance, quizScore, assignment, participation }) => {
  const weight = {
    attendance: 0.30,
    quizScore: 0.30,
    assignment: 0.20,
    participation: 0.20
  };
  const rawScore =
    attendance * weight.attendance +
    quizScore * weight.quizScore +
    assignment * weight.assignment +
    participation * weight.participation;
  return Math.round(rawScore * 100);
};

/**
 * Helper to calculate full breakdown for a student.
 */
export const getStudentLPSMetrics = async (studentId, roomId) => {
  const [attendance, quizScore, assignment, participation] = await Promise.all([
    calculateAttendance(studentId, roomId),
    calculateQuizScore(studentId, roomId),
    calculateAssignmentCompletion(studentId, roomId),
    calculateParticipation(studentId, roomId)
  ]);
  const lps = calculateLPS({ attendance, quizScore, assignment, participation });
  return { attendance, quizScore, assignment, participation, lps };
};
