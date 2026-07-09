import express from 'express';
import { generateQuestionFromTranscript, evaluateShortAnswer, getAdaptiveQuestionCategory } from '../services/llmService.js';
import Question from '../models/Question.js';
import Room from '../models/Room.js';
import Transcript from '../models/Transcript.js';
import User from '../models/User.js';

const router = express.Router();

// 1. Transcript-to-Question Generation
router.post('/generate-question', async (req, res) => {
  try {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: 'roomId is required' });

    // Fetch latest transcripts for the room
    const transcripts = await Transcript.find({ roomId }).sort({ createdAt: -1 }).limit(10);
    if (!transcripts.length) return res.status(404).json({ error: 'No transcripts found for this room' });

    const transcriptText = transcripts.map(t => t.text).join(' ');

    const generatedData = await generateQuestionFromTranscript(transcriptText);

    // Save the new question to the database
    const newQuestion = new Question({
      roomId,
      type: generatedData.type === 'short' ? 'SHORT' : (generatedData.type === 'TF' ? 'TF' : 'MCQ'),
      question: generatedData.question,
      category: generatedData.category,
      options: generatedData.options || [],
      explanation: generatedData.explanation,
      timeToAnswer: Math.round((generatedData.recommendedTimerMs || 30000) / 1000)
    });

    // We store the exact correct answer for short types in the DB, 
    // we can use explanation field or a new correctAnswer string field. 
    // Since Question schema doesn't have correctAnswer, we'll store it in options or explanation.
    // For short answers, we'll store the rubric in `explanation` or a single option.
    if (generatedData.type === 'short') {
      newQuestion.options = [{ text: generatedData.correctAnswer, isCorrect: true }];
    }

    await newQuestion.save();

    res.json({ success: true, question: newQuestion });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Short-Answer Evaluation
router.post('/evaluate-response', async (req, res) => {
  try {
    const { questionId, studentAnswer } = req.body;
    
    const question = await Question.findById(questionId);
    if (!question || question.type !== 'short') {
       return res.status(400).json({ error: 'Invalid question or not a short answer type' });
    }

    const correctAnswerRubric = question.options[0]?.text || question.explanation;

    const evaluation = await evaluateShortAnswer(question.question, correctAnswerRubric, studentAnswer);

    res.json({ success: true, evaluation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Adaptive Question Category Selection
router.get('/adaptive-question-category/:studentId', async (req, res) => {
  try {
    const user = await User.findById(req.params.studentId);
    if (!user) return res.status(404).json({ error: 'Student not found' });

    const stats = user.studentStats || {};
    const recommendedCategory = await getAdaptiveQuestionCategory(stats);

    res.json({ success: true, recommendedCategory });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
