import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '');

function parseJsonResponse(textContent) {
  const cleaned = textContent.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, '$1').trim();
  return JSON.parse(cleaned);
}

export const aiService = {
  /**
   * Generates questions from provided text context based on Bloom's Taxonomy.
   */
  async generateQuestionsFromNotes(text, numQuestions = 5, difficulty = 'Medium', bloomLevel = 'Understand', questionType = 'Multiple Choice Questions') {
    if (!text) throw new Error('No context provided for question generation.');
    
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const prompt = `
        You are an expert AI teaching assistant. Based on the provided classroom notes, generate ${numQuestions} ${questionType}.
        
        Difficulty: ${difficulty}
        Bloom's Taxonomy Level: ${bloomLevel}
        
        Notes Context:
        ${text.substring(0, 30000)}
        
        Output the questions strictly in this JSON format:
        {
          "questions": [
            {
              "type": "${questionType}",
              "question": "The question text?",
              "options": [
                { "text": "Option A", "isCorrect": true },
                { "text": "Option B", "isCorrect": false },
                { "text": "Option C", "isCorrect": false },
                { "text": "Option D", "isCorrect": false }
              ],
              "explanation": "Explanation of why the correct option is right."
            }
          ]
        }
        
        Make sure you only output valid JSON. Do not include markdown formatting like \`\`\`json.
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let textContent = response.text();
      
      return parseJsonResponse(textContent);
    } catch (error) {
      console.error('Error generating questions:', error);
      throw new Error('Failed to generate questions using AI.');
    }
  },

  /**
   * Generates a context-aware classroom summary after a poll.
   */
  async generatePollSummary(question, responses, stats) {
    if (!responses || responses.length === 0) {
      return {
        summaryText: 'No responses were collected for this poll. Consider re-asking the question or checking student connectivity.',
        mostUnderstoodConcept: 'No data available — no students responded.',
        mostMisunderstoodConcept: 'No data available — no students responded.',
        suggestedExplanation: 'Re-ask the question and ensure all students can participate.',
        suggestedFollowUpQuestion: 'None — insufficient response data.',
        homeworkRecommendation: 'No homework recommendation — poll had zero responses.',
        nextTopicRecommendation: 'Re-run this poll before advancing to the next topic.',
        recommendations: [
          'Check that all students are connected and able to respond.',
          'Consider extending the time limit for future polls.',
          'Re-ask this question to gather meaningful data.',
          'Do not advance until you have participation data.'
        ],
        isFallback: true
      };
    }

    const {
      correctCount,
      correctPercentage,
      incorrectPercentage,
      participationRate,
      totalStudents,
      totalResponses,
      answerDistribution,
      averageResponseTime,
      topic
    } = stats;

    const correctOption = question.options.find(o => o.isCorrect);
    const optionsDetail = question.options.map((opt, idx) => {
      const count = answerDistribution[idx] || 0;
      const pct = totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0;
      return `${String.fromCharCode(65 + idx)}. "${opt.text}" — ${count} students (${pct}%)${opt.isCorrect ? ' [CORRECT]' : ''}`;
    }).join('\n');

    const incorrectResponses = responses.filter(r => !r.isCorrect);
    const distractorCounts = {};
    incorrectResponses.forEach(r => {
      distractorCounts[r.selectedOption] = (distractorCounts[r.selectedOption] || 0) + 1;
    });
    const topDistractors = Object.entries(distractorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([idx, count]) => {
        const opt = question.options[parseInt(idx, 10)];
        return opt ? `"${opt.text}" (${count} students)` : `Option ${idx} (${count} students)`;
      })
      .join(', ') || 'None — all students answered correctly';

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const prompt = `
You are an expert AI teaching assistant analyzing a live classroom poll. Generate meaningful, context-aware insights using the ACTUAL poll data below.

CRITICAL: Never use generic placeholder text like "correct option details", "distractor choices", "None provided", "Key question core concepts", "the correct answer", "the correct option", or similar vague phrases. Every field must reference specific option texts, concepts, percentages, or data from the ACTUAL poll results below.

=== POLL DATA ===
Question: ${question.question}
Topic/Subject Area: ${topic}
Question Type: ${question.type}
Bloom's Level: ${question.bloomLevel || 'Understand'}
Points: ${question.points}
Time Limit: ${question.timeToAnswer}s

Correct Answer: ${correctOption ? `"${correctOption.text}"` : 'Unknown'}
Explanation: ${question.explanation || 'Not provided'}

=== RESPONSE STATISTICS ===
Total Students in Room: ${totalStudents}
Students Who Responded: ${totalResponses}
Participation Rate: ${participationRate}%
Correct Answers: ${correctCount} (${correctPercentage}%)
Incorrect Answers: ${totalResponses - correctCount} (${incorrectPercentage}%)
Average Response Time: ${averageResponseTime}s

=== ANSWER DISTRIBUTION ===
${optionsDetail}

Most Selected Incorrect Options: ${topDistractors}

=== INSTRUCTIONS ===
Analyze the actual data above and generate a natural-language classroom summary. Reference specific option texts, percentages, and concepts from this question. Every field must contain unique, data-driven content — never generic phrases.

For nextTopicRecommendation, follow these rules based on correct percentage:
- If > 80%: Recommend advancing to the next related topic.
- If 50-80%: Recommend brief revision with one more example before advancing.
- If < 50%: Recommend NOT moving forward; spend more time on fundamentals.

For suggestedFollowUpQuestion: Generate a brand-new related multiple-choice question with 4 options (A-D), formatted as a complete question with options listed on separate lines.

For mostUnderstoodConcept: Write a full sentence referencing the correct answer text and the percentage who got it right.

For mostMisunderstoodConcept: Write a full sentence referencing the specific distractor option text that students most frequently chose.

For homeworkRecommendation: List 2-3 specific, actionable homework tasks as bullet points.

Output strictly in this JSON format:
{
  "summaryText": "A paragraph summarizing performance with specific data and option references.",
  "mostUnderstoodConcept": "Full sentence about what students understood well, referencing the specific correct answer and concept.",
  "mostMisunderstoodConcept": "Full sentence about the main confusion, referencing the specific distractor option students chose.",
  "suggestedExplanation": "A specific teaching action the teacher should take, referencing the actual concepts and options.",
  "suggestedFollowUpQuestion": "A complete new MCQ with question text and 4 labeled options (A, B, C, D) on separate lines.",
  "homeworkRecommendation": "Specific homework tasks as bullet points based on the weakest concept.",
  "nextTopicRecommendation": "Specific recommendation based on the ${correctPercentage}% correct rate, with specific concept references.",
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2", "Actionable recommendation 3", "Actionable recommendation 4"]
}

Make sure you only output valid JSON. Do not include markdown formatting like \`\`\`json.
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const parsed = parseJsonResponse(response.text());
      return { ...parsed, isFallback: false };
    } catch (error) {
      console.error('Error generating poll summary from Gemini API:', error);
      throw error;
    }
  },

  /**
   * Generates a detailed explanation for a student based on a question.
   */
  async explainAnswer(question) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const correctOption = question.options.find(o => o.isCorrect);
      
      const prompt = `
        You are an AI teaching assistant. A student asked for an explanation of the following question.
        
        Question: ${question.question}
        Correct Answer: ${correctOption ? correctOption.text : 'Unknown'}
        
        Provide a comprehensive explanation.
        
        Output strictly in this JSON format:
        {
          "explanation": "Detailed explanation of the correct answer.",
          "whyOthersWrong": "Explanation of why the other options are incorrect.",
          "realWorldExample": "A real-world example illustrating the concept.",
          "easyExplanation": "A very simple, ELI5 (Explain Like I'm 5) explanation.",
          "revisionNotes": "3-4 bullet points of revision notes."
        }
        
        Make sure you only output valid JSON. Do not include markdown formatting like \`\`\`json.
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return parseJsonResponse(response.text());
    } catch (error) {
      console.error('Error generating explanation:', error);
      throw new Error('Failed to generate explanation.');
    }
  },

  /**
   * Analyzes a student report for a question.
   */
  async analyzeQuestionReport(question, reportType, reportMessage) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const correctOption = question.options.find(o => o.isCorrect);
      
      const prompt = `
        You are an AI teaching assistant. A student has reported a potential issue with a classroom question.
        
        Question: ${question.question}
        Options:
        ${question.options.map((o, idx) => `${idx}: ${o.text} (Correct: ${o.isCorrect})`).join('\n')}
        Explanation: ${question.explanation || 'None'}
        
        Student's Report Reason: ${reportType}
        Student's Message: "${reportMessage}"
        
        Analyze the question and the student's report. Determine if the question contains any factual error, incorrect answer marking, ambiguous wording, typo, or missing options.
        Provide a confidence score (0 to 100) indicating how likely the student's report is correct, a suggested correction, and your reasoning.
        
        Output strictly in this JSON format:
        {
          "confidenceScore": 85,
          "suggestedCorrection": "Change correct option to D, or fix typo in question text",
          "reasoning": "Detail your step-by-step reasoning here..."
        }
        
        Make sure you only output valid JSON. Do not include markdown formatting like \`\`\`json.
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return parseJsonResponse(response.text());
    } catch (error) {
      console.error('Error analyzing question report:', error);
      return {
        confidenceScore: 50,
        suggestedCorrection: 'Please review the student\'s report manually.',
        reasoning: 'AI analysis was unavailable. Manual verification is recommended.'
      };
    }
  },

  /**
   * Generates misconception analysis for classroom poll data.
   */
  async generateMisconceptionAnalysis(question, responses, stats) {
    const { correctPercentage, totalResponses, incorrectCount, distractorCounts, correctOptionText } = stats;

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `
You are an AI teaching assistant analyzing classroom poll results to identify misconceptions.

=== QUESTION ===
${question.question}
Type: ${question.type}
Bloom's Level: ${question.bloomLevel || 'Understand'}
Correct Answer: "${correctOptionText}"

=== RESULTS ===
Total Responses: ${totalResponses}
Correct: ${correctPercentage}%
Incorrect: ${incorrectCount} students

=== DISTRACTOR ANALYSIS ===
${Object.entries(distractorCounts).map(([idx, count]) => {
  const opt = question.options[parseInt(idx)];
  return opt ? `Option ${String.fromCharCode(65 + parseInt(idx))}: "${opt.text}" - ${count} students (${Math.round((count / totalResponses) * 100)}%)` : '';
}).join('\n')}

Identify the TOPIC and up to 5 SUBTOPICS where students showed confusion. For each subtopic provide:
- name: A short, specific concept name (e.g., "Memoization vs Recursion")
- confusionScore: 0-100 based on how many students got related questions wrong
- studentsAffected: exact number of students who showed confusion on this subtopic
- recommendation: A specific, actionable teaching recommendation

Output strictly this JSON:
{
  "topic": "The main topic of this question",
  "subtopics": [
    {
      "name": "Specific subtopic name",
      "confusionScore": 75,
      "studentsAffected": 12,
      "recommendation": "Specific teaching action with example"
    }
  ],
  "overallConfusionScore": 40
}
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return JSON.parse(response.text().replace(/^\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`$/i, '$1').trim());
    } catch (error) {
      console.error('Error generating misconception analysis:', error);
      throw error;
    }
  },

  /**
   * Generates personalized homework for a student based on their performance.
   */
  async generatePersonalizedHomework(question, studentResponses, studentStats) {
    const { accuracy, weakSubtopics, topic } = studentStats;

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `
You are an AI tutor creating personalized homework for a student.

=== STUDENT PROFILE ===
Overall Accuracy: ${accuracy}%
Weak Areas: ${weakSubtopics.join(', ') || 'None identified'}
Topic: ${topic}

=== QUESTION THEY ANSWERED ===
${question.question}
Correct Answer: ${question.options.find(o => o.isCorrect)?.text || 'Unknown'}
Explanation: ${question.explanation || 'Not available'}

Generate 3-5 homework items tailored to this student's performance level.

Rules:
- If accuracy < 50%: Create easy, foundational questions with MCQs and short answers
- If accuracy 50-80%: Create medium difficulty questions focusing on weak areas
- If accuracy > 80%: Create challenging questions, advanced problems, higher Bloom's level

Output strictly this JSON:
{
  "topic": "The topic for this homework",
  "items": [
    {
      "type": "MCQ | SHORT_ANSWER | LONG_ANSWER | PRACTICE_PROBLEM | READING | CASE_STUDY",
      "question": "The question text",
      "options": [{ "text": "Option A", "isCorrect": true }, { "text": "Option B", "isCorrect": false }],
      "difficulty": "easy | medium | hard",
      "topic": "Sub-topic",
      "bloomLevel": "Remember | Understand | Apply | Analyze | Evaluate | Create"
    }
  ]
}
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return JSON.parse(response.text().replace(/^\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`$/i, '$1').trim());
    } catch (error) {
      console.error('Error generating personalized homework:', error);
      throw error;
    }
  },

  /**
   * Generates a comprehensive revision sheet for a classroom session.
   */
  async generateRevisionSheet(question, responses, stats) {
    const { correctPercentage, correctOptionText, answerDistribution, topDistractor } = stats;

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `
You are an AI teaching assistant creating a comprehensive revision sheet for a classroom session.

=== QUESTION ===
${question.question}
Type: ${question.type}
Bloom's Level: ${question.bloomLevel || 'Understand'}
Correct Answer: "${correctOptionText}"
${question.explanation ? `Explanation: ${question.explanation}` : ''}

=== POLL RESULTS ===
${correctPercentage}% of students answered correctly.
Answer Distribution: ${Object.entries(answerDistribution).map(([idx, count]) => {
  const opt = question.options[parseInt(idx)];
  return opt ? `${String.fromCharCode(65 + parseInt(idx))}. "${opt.text}": ${count} students` : '';
}).join(', ')}

=== TOP DISTRACTOR ===
${Object.entries(topDistractor).length > 0
  ? `Students most frequently confused "${question.options[parseInt(Object.entries(topDistractor).sort((a,b) => b[1]-a[1])[0][0])]?.text}" with the correct answer.`
  : 'No significant confusion detected.'
}

Generate a comprehensive revision sheet covering:
1. Definitions of key terms related to this topic
2. Important formulae or rules
3. Key concepts with explanations
4. Worked examples
5. Common mistakes students made (based on poll data)
6. Frequently confused concepts
7. Memory tips and mnemonics
8. Exam tips
9. Quick reference table
10. Summary paragraph
11. Practice questions with answers
12. Viva/oral questions
13. MCQs for self-testing

Output strictly this JSON:
{
  "title": "Revision Sheet title",
  "topic": "The topic",
  "definitions": [{ "term": "Term", "definition": "Definition" }],
  "importantFormulae": [{ "formula": "Formula", "description": "What it means" }],
  "keyConcepts": [{ "concept": "Concept name", "definition": "Detailed explanation" }],
  "examples": [{ "title": "Example title", "content": "Step-by-step example" }],
  "commonMistakes": [{ "mistake": "The mistake", "correction": "How to correct it" }],
  "frequentlyConfused": [{ "concept1": "First concept", "concept2": "Second concept", "distinction": "How they differ" }],
  "memoryTips": [{ "tip": "Memory aid", "topic": "Related topic" }],
  "examTips": [{ "tip": "Exam strategy tip" }],
  "quickReferenceTable": [{ "category": "Category name", "details": "Key details" }],
  "summary": "A paragraph summarizing everything",
  "practiceQuestions": [{ "question": "Question", "answer": "Answer", "difficulty": "easy|medium|hard" }],
  "vivaQuestions": [{ "question": "Oral question", "answer": "Expected answer" }],
  "mcqs": [{ "question": "MCQ", "options": [{ "text": "Option", "isCorrect": false }], "explanation": "Why" }]
}
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return JSON.parse(response.text().replace(/^\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`$/i, '$1').trim());
    } catch (error) {
      console.error('Error generating revision sheet:', error);
      throw error;
    }
  },

  /**
   * Generates a session-wide revision sheet covering all questions in a room.
   */
  async generateSessionRevisionSheet(questions, allResponses, stats) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const questionsBlock = questions.map((q, idx) => {
        const qResponses = allResponses.filter(r => r.questionId.toString() === q._id.toString())
        const correctOption = q.options.find(o => o.isCorrect)
        const correctCount = qResponses.filter(r => r.isCorrect).length
        const totalResp = qResponses.length
        const distMap = {}
        qResponses.forEach(r => { distMap[r.selectedOption] = (distMap[r.selectedOption] || 0) + 1 })
        const distStr = Object.entries(distMap).map(([optIdx, count]) => {
          const opt = q.options[parseInt(optIdx)]
          return opt ? `${String.fromCharCode(65 + parseInt(optIdx))}. "${opt.text}": ${count}/${totalResp}` : ''
        }).join(', ')

        return `
Q${idx + 1}: ${q.question}
   Type: ${q.type} | Bloom's: ${q.bloomLevel || 'Understand'}
   Correct: "${correctOption?.text || 'N/A'}"
   ${q.explanation ? `Explanation: ${q.explanation}` : ''}
   Accuracy: ${totalResp > 0 ? Math.round((correctCount / totalResp) * 100) : 0}% (${correctCount}/${totalResp} correct)
   Distribution: ${distStr || 'No responses'}`
      }).join('\n')

      const allDistractors = questions.map((q, idx) => {
        const qResponses = allResponses.filter(r => r.questionId.toString() === q._id.toString())
        const wrongResponses = qResponses.filter(r => !r.isCorrect)
        const distMap = {}
        wrongResponses.forEach(r => { distMap[r.selectedOption] = (distMap[r.selectedOption] || 0) + 1 })
        const top = Object.entries(distMap).sort((a, b) => b[1] - a[1])[0]
        return top && q.options[parseInt(top[0])]
          ? `Q${idx + 1}: ${wrongResponses.length} student(s) chose "${q.options[parseInt(top[0])].text}"`
          : `Q${idx + 1}: No significant confusion`
      }).join('\n')

      const prompt = `
You are an AI teaching assistant creating a comprehensive revision sheet covering an ENTIRE classroom session with multiple questions.

=== ALL QUESTIONS ===
${questionsBlock}

=== COMMON MISTAKES ACROSS QUESTIONS ===
${allDistractors}

=== OVERALL STATS ===
Total Questions: ${stats.totalQuestions}
Total Responses: ${stats.totalResponses}
Overall Accuracy: ${stats.overallAccuracy}%
Average Response Time: ${stats.averageResponseTime || 'N/A'}s
Topics Covered: ${stats.topics?.join(', ') || 'Various'}

Generate a comprehensive revision sheet covering the ENTIRE session. The sheet should:
1. Identify the MAIN TOPIC across all questions
2. Include definitions of key terms
3. Important formulae or rules
4. Key concepts with explanations
5. Common mistakes students made (reference specific questions)
6. Frequently confused concepts
7. Memory tips and mnemonics
8. Exam tips
9. Practice questions (mix from all topics)
10. Viva/oral questions
11. MCQs for self-testing

Output strictly this JSON:
{
  "title": "Session Revision Sheet title",
  "topic": "The main topic covering all questions",
  "definitions": [{ "term": "Term", "definition": "Definition" }],
  "importantFormulae": [{ "formula": "Formula", "description": "What it means" }],
  "keyConcepts": [{ "concept": "Concept name", "definition": "Detailed explanation" }],
  "examples": [{ "title": "Example title", "content": "Step-by-step example" }],
  "commonMistakes": [{ "mistake": "The mistake", "correction": "How to correct it" }],
  "frequentlyConfused": [{ "concept1": "First concept", "concept2": "Second concept", "distinction": "How they differ" }],
  "memoryTips": [{ "tip": "Memory aid", "topic": "Related topic" }],
  "examTips": [{ "tip": "Exam strategy tip" }],
  "quickReferenceTable": [{ "category": "Category name", "details": "Key details" }],
  "summary": "A paragraph summarizing the session",
  "practiceQuestions": [{ "question": "Question", "answer": "Answer", "difficulty": "easy|medium|hard" }],
  "vivaQuestions": [{ "question": "Oral question", "answer": "Expected answer" }],
  "mcqs": [{ "question": "MCQ", "options": [{ "text": "Option", "isCorrect": false }], "explanation": "Why" }]
}
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return JSON.parse(response.text().replace(/^\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`$/i, '$1').trim());
    } catch (error) {
      console.error('Error generating session revision sheet:', error);
      throw error;
    }
  }
};
