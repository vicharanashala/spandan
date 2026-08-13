// backend/scripts/seedData.js
// Seed script to populate MongoDB with sample data for LPS analytics demo

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const { MONGODB_URI } = process.env;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set in .env');
  process.exit(1);
}

// Import models
import User from '../src/models/User.js';
import Room from '../src/models/Room.js';
import RoomMember from '../src/models/RoomMember.js';
import Question from '../src/models/Question.js';
import Response from '../src/models/Response.js';
import Transcript from '../src/models/Transcript.js';

const run = async () => {
  try {
    await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    // Clean existing collections (DEV ONLY)
    await Promise.all([
      User.deleteMany({}),
      Room.deleteMany({}),
      RoomMember.deleteMany({}),
      Question.deleteMany({}),
      Response.deleteMany({}),
      Transcript.deleteMany({}),
    ]);

    // Create a teacher and two students
    const teacher = await User.create({ name: 'Alice Teacher', email: 'alice@school.edu', role: 'teacher', password: 'hashedpw' });
    const student1 = await User.create({ name: 'Bob Student', email: 'bob@student.edu', role: 'student', password: 'hashedpw' });
    const student2 = await User.create({ name: 'Carol Student', email: 'carol@student.edu', role: 'student', password: 'hashedpw' });

    // Create a room owned by teacher
    const room = await Room.create({ name: 'Math 101', teacher: teacher._id, description: 'Intro to Mathematics' });

    // Add students to room
    await RoomMember.create({ roomId: room._id, studentId: student1._id });
    await RoomMember.create({ roomId: room._id, studentId: student2._id });

    // Create 5 questions (segments 0‑4)
    const questions = [];
    for (let i = 0; i < 5; i++) {
      const q = await Question.create({
        roomId: room._id,
        type: 'MCQ',
        question: `Question ${i + 1}`,
        segmentIndex: i,
        points: 10,
        status: 'approved',
        options: [
          { text: 'Option A', isCorrect: true },
          { text: 'Option B', isCorrect: false }
        ],
      });
      questions.push(q);
    }

    // Simulate transcripts (one per segment)
    for (let i = 0; i < 5; i++) {
      await Transcript.create({
        roomId: room._id,
        segmentIndex: i,
        teacherId: teacher._id,
        text: `Transcript for segment ${i}`,
        // optional fields duration and wordCount can be omitted or set to defaults
      });
    }

    // Student responses – varied scores
    const createResponse = async (student, qIdx, earned, selectedOption = 0) => {
      await Response.create({
        studentId: student._id,
        roomId: room._id,
        questionId: questions[qIdx]._id,
        selectedOption,
        points: earned,
        createdAt: new Date(),
      });
    };

    // Bob answers all questions, full points
    for (let i = 0; i < 5; i++) {
      await createResponse(student1, i, 10, 0);
    }
    // Carol answers 3 questions, partial points
    await createResponse(student2, 0, 8, 0);
    await createResponse(student2, 1, 6, 0);
    await createResponse(student2, 2, 5, 0);

    console.log('Sample data seeded successfully');
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
};

run();
