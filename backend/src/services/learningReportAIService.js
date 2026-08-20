import { generateAIText } from './questionService.js'

function buildLearningReportPrompt(metrics, responses, questions, transcript) {
  return `
You are an educational learning analyst.

Analyze a student's performance from a completed learning session.

SESSION TRANSCRIPT:
${transcript || 'No transcript available.'}

PERFORMANCE METRICS:
${JSON.stringify(metrics, null, 2)}

QUESTIONS:
${JSON.stringify(questions, null, 2)}

STUDENT RESPONSES:
${JSON.stringify(responses, null, 2)}

TASK:
Create a concise post-class learning report.

Identify:
1. Overall understanding of the session
2. Topics or concepts the student demonstrated well
3. Concepts where the student struggled
4. Specific recommendations for improvement

IMPORTANT:
- Base the analysis ONLY on the supplied session data.
- Do not invent topics or facts that are not present.
- Do not reveal the correct answers unnecessarily.
- Recommendations should be practical and specific.
- Keep the report concise and useful to a student.

OUTPUT:
Return ONLY valid JSON in exactly this structure:

{
  "summary": "A concise overall assessment.",
  "strengths": [
    "Strength 1",
    "Strength 2"
  ],
  "weaknesses": [
    "Weakness 1",
    "Weakness 2"
  ],
  "recommendations": [
    "Recommendation 1",
    "Recommendation 2"
  ]
}
`
}

function parseLearningReport(responseText) {
  try {
    let jsonText = responseText

    const fenced = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (fenced) {
      jsonText = fenced[1]
    }

    const match = jsonText.match(/\{[\s\S]*\}/)

    if (!match) {
      throw new Error('No JSON found in AI response')
    }

    const parsed = JSON.parse(match[0])

    return {
      summary: typeof parsed.summary === 'string'
        ? parsed.summary
        : '',
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths.filter(item => typeof item === 'string')
        : [],
      weaknesses: Array.isArray(parsed.weaknesses)
        ? parsed.weaknesses.filter(item => typeof item === 'string')
        : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.filter(item => typeof item === 'string')
        : []
    }
  } catch (error) {
    throw new Error(`Failed to parse learning report: ${error.message}`)
  }
}

export async function generateLearningReportAI({
  metrics,
  responses,
  questions,
  transcript = '',
  provider = 'minimax'
}) {
  const prompt = buildLearningReportPrompt(
    metrics,
    responses,
    questions,
    transcript
  )

  const responseText = await generateAIText(prompt, provider)

  return parseLearningReport(responseText)
}

export {
  buildLearningReportPrompt,
  parseLearningReport
}