import mongoose from 'mongoose';
import Transcript from './src/models/Transcript.js';
import Room from './src/models/Room.js';
import User from './src/models/User.js';
import dotenv from 'dotenv';
dotenv.config();

const runTest = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // 1. Setup fake teacher and room
  const teacher = new User({ name: 'AI Teacher', email: 'ai@test.com', password: 'password123', role: 'teacher' });
  await teacher.save();
  
  const room = new Room({ name: 'Bio 101', teacher: teacher._id, code: 'AITEST' });
  await room.save();
  
  // 2. Setup fake transcript
  const t = new Transcript({
    roomId: room._id,
    speaker: 'Teacher',
    text: 'Welcome to biology 101. Today we discuss the mitochondria. The mitochondria is often referred to as the powerhouse of the cell because it generates most of the cell\'s supply of adenosine triphosphate (ATP), used as a source of chemical energy.'
  });
  await t.save();
  
  console.log('Sending request to AI service to generate a question...');
  
  // 3. Call the API
  const res = await fetch('http://localhost:3002/api/ai/generate-question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId: room._id })
  });
  
  const data = await res.json();
  console.log('Generate Question Response:', JSON.stringify(data, null, 2));

  // 4. Test evaluate short answer
  if (data.question) {
    console.log('\nTesting short answer evaluation...');
    const evalRes = await fetch('http://localhost:3002/api/ai/evaluate-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        questionId: data.question._id,
        // Since we don't know what it generated, we will force the model in DB to be short answer for the test
      })
    });
    // For a real test, let's just use the direct service function
  }

  await mongoose.connection.close();
};

runTest().catch(console.error);
