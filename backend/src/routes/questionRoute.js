// backend/src/routes/questionRoute.js
import express from 'express';
import { generateQuestions } from '../services/questionService.js';

const router = express.Router();

const defaultPrompt = 'Generate a short, single-sentence quiz question suitable for a classroom discussion.';

router.post('/generate', async (req, res) => {
  try {
    const prompt = req.body?.prompt || defaultPrompt;
    const questions = await generateQuestions(prompt, { numQuestions: 1 });
    const questionText = questions && questions[0] ? (typeof questions[0] === 'string' ? questions[0] : questions[0].question) : prompt;
    
    // Emit to all participants in the room (room code must be supplied in body)
    const roomCode = req.body?.roomCode;
    if (roomCode && req.app.get('io')) {
      req.app.get('io').to(roomCode).emit('new_question', { question: questionText, questions });
    }
    res.json({ question: questionText, questions });
  } catch (err) {
    console.error('Error generating question:', err);
    res.status(500).json({ error: 'Failed to generate question', details: err.message });
  }
});

export default router;

