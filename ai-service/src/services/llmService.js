import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

export const generateQuestionFromTranscript = async (transcriptText) => {
  const prompt = `You are an expert AI teacher's assistant. Based on the following transcript of a live class, generate a single interactive question (either MCQ, True/False, or Short Answer) to check student understanding.
  
Return the output strictly as a JSON object matching this schema:
{
  "type": "MCQ" | "TF" | "short",
  "question": "The question text",
  "category": "recall" | "analysis" | "calculation",
  "options": [
    { "text": "Option 1", "isCorrect": false },
    { "text": "Option 2", "isCorrect": true }
  ],
  "correctAnswer": "For short answer types, provide the exact reference correct answer here",
  "explanation": "A short explanation of why the answer is correct",
  "recommendedTimerMs": Number (e.g. 15000 for recall, 30000 for analysis, 45000 for calculation)
}

Transcript:
"${transcriptText}"`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            temperature: 0.7,
        }
    });

    const jsonText = response.text;
    return JSON.parse(jsonText);
  } catch (error) {
    console.error('LLM Generation Error:', error);
    throw new Error('Failed to generate question from transcript');
  }
};

export const evaluateShortAnswer = async (questionText, correctAnswer, studentAnswer) => {
  const prompt = `You are evaluating a student's short answer to a question.
Question: "${questionText}"
Rubric/Correct Answer: "${correctAnswer}"
Student's Answer: "${studentAnswer}"

Does the student's answer correctly capture the meaning of the rubric? Minor typos or synonyms are acceptable.
Return strictly JSON matching this schema:
{
  "isCorrect": boolean,
  "explanation": "Brief explanation of why it is correct or incorrect"
}`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
        }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error('LLM Evaluation Error:', error);
    throw new Error('Failed to evaluate student answer');
  }
};

// Suggests which category of question (recall / analysis /
// calculation) the AI should generate NEXT during a live session,
// based on the student's live performance stats. This steers
// real-time question generation — it is not a post-session study
// recommendation.
export const getAdaptiveQuestionCategory = async (studentStats) => {
  const prompt = `Based on the following student stats, determine the optimal category of question to generate next for them during this live session.
Stats: ${JSON.stringify(studentStats)}

Return strictly JSON matching this schema:
{
  "recommendedCategory": "recall" | "analysis" | "calculation",
  "reasoning": "Why this category is selected based on their live stats"
}`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            temperature: 0.5,
        }
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error('LLM Adaptive Category Error:', error);
    throw new Error('Failed to determine adaptive category');
  }
};
