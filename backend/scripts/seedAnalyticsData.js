// backend/scripts/seedAnalyticsData.js

/**
 * Seed script to generate sample data for Learning Progress Score (LPS) and Analytics Dashboard.
 * Run with: node backend/scripts/seedAnalyticsData.js (ensure dependencies installed)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const getModel = async (name) => {
  const module = await import(`../src/models/${name}.js`);
  return module.default;
};

const main = async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spandan';
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 45000 });
  console.log('Connected to MongoDB');

  const User = await getModel('User');
  const Room = await getModel('Room');
  const RoomMember = await getModel('RoomMember');
  const Question = await getModel('Question');
  const Response = await getModel('Response');
  const Transcript = await getModel('Transcript');

  // Clean any previous sample data (optional)
  await Promise.all([
    User.deleteMany({ email: /@sample\.com$/ }),
    Room.deleteMany({ name: /Sample Room/ }),
    Question.deleteMany({}),
    Response.deleteMany({}),
    Transcript.deleteMany({}),
    RoomMember.deleteMany({})
  ]);

  // Create a teacher
  const teacher = new User({
    name: 'Alice Teacher',
    email: 'alice.teacher@sample.com',
    password: 'password123', // hashed by pre‑save hook
    role: 'teacher',
    department: 'Computer Science'
  });
  await teacher.save();

  // Create students
  const students = [];
  for (let i = 1; i <= 3; i++) {
    const student = new User({
      name: `Student ${i}`,
      email: `student${i}@sample.com`,
      password: 'password123',
      role: 'student',
      class: 'Class A',
      enrollmentNumber: `ENR00${i}`
    });
    await student.save();
    students.push(student);
  }

  // Create a room
  const room = new Room({
    name: 'Sample Room for LPS Demo',
    teacher: teacher._id,
    code: 'DEMO123',
    isActive: true
  });
  await room.save();

  // Add students to room members
  for (const stu of students) {
    const member = new RoomMember({ roomId: room._id, studentId: stu._id, joinedAt: new Date() });
    await member.save();
  }

  // Create sample questions (3)
  const questions = [];
  for (let i = 1; i <= 3; i++) {
    const q = new Question({
      roomId: room._id,
      type: 'MCQ',
      question: `Sample question ${i}`,
      options: [
        { text: 'Option A', isCorrect: true },
        { text: 'Option B', isCorrect: false },
        { text: 'Option C', isCorrect: false },
        { text: 'Option D', isCorrect: false }
      ],
      segmentIndex: i - 1,
      points: 100,
      status: 'approved'
    });
    await q.save();
    questions.push(q);
  }

  // Create transcripts representing class segments
  for (let i = 0; i < 3; i++) {
    const t = new Transcript({
      roomId: room._id,
      segmentIndex: i,
      teacherId: teacher._id,
      text: `Segment text for segment ${i}`,
      duration: 120,
      wordCount: 150
    });
    await t.save();
  }

  // Generate responses for each student/question/segment
  for (const stu of students) {
    for (let idx = 0; idx < questions.length; idx++) {
      const isCorrect = idx % 2 === 0;
      const resp = new Response({
        roomId: room._id,
        questionId: questions[idx]._id,
        studentId: stu._id,
        selectedOption: isCorrect ? 0 : 1, // index of option A (correct) or option B (incorrect)
        isCorrect: isCorrect,
        points: isCorrect ? 100 : 0
      });
      await resp.save();
    }
  }

  console.log('Sample data seeded successfully');
  await mongoose.disconnect();
  process.exit(0);
};

main().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
