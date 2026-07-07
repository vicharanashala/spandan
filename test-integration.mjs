import mongoose from 'mongoose';
import Transcript from './backend/src/models/Transcript.js';
import Room from './backend/src/models/Room.js';
import User from './backend/src/models/User.js';

async function runIntegrationTest() {
  console.log('--- Spandan Integration Test ---');
  await mongoose.connect('mongodb://localhost:27017/spandan');

  // 1. Setup a Test Teacher and Room
  console.log('\n1. Creating test teacher and room...');
  let teacher = await User.findOne({ email: 'integration@test.com' });
  if (!teacher) {
    teacher = new User({
      name: 'Integration Teacher',
      email: 'integration@test.com',
      password: 'password123',
      role: 'teacher'
    });
    await teacher.save();
  }

  let room = await Room.findOne({ code: 'INTEGRATION' });
  if (!room) {
    room = new Room({
      name: 'Integration 101',
      code: 'INTEGRATION',
      teacher: teacher._id
    });
    await room.save();
  }
  console.log(`✅ Room Created. Code: ${room.code} (ID: ${room._id})`);

  // 2. Inject a mock transcript directly to DB
  console.log('\n2. Injecting a simulated transcript into the DB...');
  const t = new Transcript({
    roomId: room._id,
    teacherId: teacher._id,
    segmentIndex: 1,
    speaker: 'Teacher',
    text: 'Today we are going to learn about the solar system. The solar system consists of the Sun and the objects that orbit it, including eight planets. The largest planet is Jupiter, and the planet known for its rings is Saturn.'
  });
  await t.save();
  console.log('✅ Transcript injected.');

  // 3. Call AI Service to generate a question
  console.log('\n3. Calling AI Service (port 3002) to generate a question from the transcript...');
  try {
    const aiRes = await fetch('http://localhost:3002/api/ai/generate-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: room._id })
    });
    const aiData = await aiRes.json();
    
    if (aiData.error) {
      console.error('❌ AI Service Error:', aiData.error);
    } else {
      console.log('✅ AI Service Generated Question Successfully:');
      console.log(JSON.stringify(aiData.question, null, 2));

      // 4. Test Evaluation if it's a short answer
      if (aiData.question.type === 'short') {
        console.log('\n4. Testing Short Answer Evaluation...');
        const evalRes = await fetch('http://localhost:3002/api/ai/evaluate-response', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questionId: aiData.question._id,
            studentAnswer: 'Saturn is the one with rings, and Jupiter is the biggest one.' // mock answer
          })
        });
        const evalData = await evalRes.json();
        console.log('✅ AI Evaluation Result:');
        console.log(JSON.stringify(evalData, null, 2));
      }
    }
  } catch (err) {
    console.error('❌ Failed to reach AI Service. Is it running? Error:', err.message);
  }

  // 5. Cleanup (optional, but let's leave it in DB so user can inspect it)
  await mongoose.disconnect();
  console.log('\n--- Test Complete ---');
}

runIntegrationTest();
