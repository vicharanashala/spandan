// questionPromptService.js
// Owns the prompt contract and the parsing of the AI's response back into
// candidate question objects. Adding a new question type = one entry in
// TYPE_DESCRIPTIONS, nothing else in the pipeline needs to change.

const TYPE_DESCRIPTIONS = {
  MCQ: (n) => `${n} MCQ: multiple choice, ONE correct answer, 3 wrong options. Wrong options should be plausible — facts or phrases from the transcript that are incorrect in this specific context, not obviously wrong by common sense. At least 1 wrong option should survive a first read and only fail on re-reading.`,  TF: (n) => `${n} TF: True/False statements.`,
  MSQ: (n) => `${n} MSQ: multiple select, 2-4 correct options out of 4, mark ALL correct ones.`,
  FIB: (n) => `${n} FIB: fill-in-the-blank, one blank, one exact correct answer text.`,
  ORDERING: (n) => `${n} ORDERING: 4-5 items to be arranged in the correct sequence.`,
  MATCHING: (n) => `${n} MATCHING: 3-5 pairs of related items to be matched.`
}

// candidateCounts: { MCQ: 4, TF: 6, ... } — only types with count > 0 are requested.
// difficultyMix: { medium: 70, hard: 30 } (a plain string like 'medium' is also
// accepted for backward compat and treated as { medium: 100 }).
export function buildPrompt(transcript, candidateCounts, difficultyMix) {
  const activeTypes = Object.keys(candidateCounts).filter((t) => candidateCounts[t] > 0)
  const totalCount = activeTypes.reduce((sum, t) => sum + candidateCounts[t], 0)

  const mix = typeof difficultyMix === 'string'
    ? { [difficultyMix]: 100 }
    : (difficultyMix && Object.keys(difficultyMix).length ? difficultyMix : { medium: 100 })

  const difficultyLine = Object.entries(mix)
    .filter(([, w]) => w > 0)
    .map(([level, weight]) => `${weight}% ${level.toUpperCase()}`)
    .join(', ')

  const difficultyGuidance = {
    easy: 'Direct recall of an explicitly stated fact from the transcript. Wrong options should be clearly and obviously wrong.',
    medium: 'Requires connecting two related points from the transcript, not just single-fact recall. Wrong options should be plausible but distinguishable with careful reading.',
    hard: 'Requires connecting 2-3 related points from the transcript or applying a concept beyond direct recall — not single-fact retrieval. Wrong options should be plausible: near-misses or partially-correct statements that sound right to someone who read the transcript casually.'
  }
  const activeLevels = Object.keys(mix).filter((l) => mix[l] > 0)
  const difficultyGuidanceLines = activeLevels
    .map((level) => `  - ${level.toUpperCase()}: ${difficultyGuidance[level] || 'Match the stated difficulty level.'}`)
    .join('\n')

  const sections = activeTypes.map((type, i) => {
    const describe = TYPE_DESCRIPTIONS[type] || ((n) => `${n} ${type} questions.`)
    return `${i + 1}. Generate ${describe(candidateCounts[type])}`
  })

  return `You are an expert quiz question generator. Based on the transcript below, generate EXACTLY ${totalCount} questions total, following this breakdown:

${sections.join('\n')}

Requirements:
- Use ONLY the transcript content below, do not invent facts
- Do not repeat or rephrase the same concept twice within this batch
- Target difficulty distribution across the batch: ${difficultyLine} — assign each question's "difficulty" field so the overall batch roughly matches this split (do not label every question the same level)
- Difficulty definitions (follow these precisely — a question's real difficulty must match its label, not just be tagged as such):
${difficultyGuidanceLines}
- For each question, return a confidence score from 0-100 reflecting how clearly the transcript supports the correct answer
- For each question, return a difficulty of "easy", "medium", or "hard"
- MCQ and MSQ questions MUST have EXACTLY 4 options in the "options" array — never 3, never 5. Count them before responding.
- Mark the correct option(s) for each question
- Explanation must be ONE short sentence, max 15 words — state the fact, not a restated argument

TRANSCRIPT:
${transcript}

OUTPUT FORMAT (respond ONLY with valid JSON, no preamble or markdown fences):
{
  "questions": [
    {
      "type": "MCQ" | "TF" | "MSQ",
      "question": "The question text here?",
      "confidence": 92,
      "difficulty": "medium",
      "explanation": "One short sentence, max 15 words",
      "options": [
        { "text": "Option A", "isCorrect": false },
        { "text": "Option B", "isCorrect": true }
      ]
    }
  ]
}`
}

// Placeholder distractors used only to repair a malformed AI response
// (wrong option count) — never surfaced when the AI behaves correctly.
const PLACEHOLDER_WRONG_OPTIONS = [
  'None of the above',
  'Not mentioned in the transcript',
  'Cannot be determined from the transcript',
  'All of the above'
]

// MCQ/MSQ have a hard contract: exactly 4 options, always. If the AI under-
// or over-produces (seen more often since the difficulty-guidance prompt
// change pushes it toward denser/merged distractors on "hard"), repair the
// array instead of silently shipping a 3- or 5-option question to students.
function repairToFourOptions(normalized) {
  if (normalized.length === 4) return normalized

  if (normalized.length > 4) {
    const correct = normalized.filter((o) => o.isCorrect)
    const wrong = normalized.filter((o) => !o.isCorrect)
    const keepWrong = wrong.slice(0, Math.max(0, 4 - correct.length))
    const combined = [...correct, ...keepWrong].slice(0, 4)
    let i = 0
    while (combined.length < 4) {
      combined.push({ text: PLACEHOLDER_WRONG_OPTIONS[i % PLACEHOLDER_WRONG_OPTIONS.length], isCorrect: false })
      i++
    }
    return combined
  }

  // length < 4: pad with placeholder wrong options
  const padded = [...normalized]
  let i = 0
  while (padded.length < 4) {
    padded.push({ text: PLACEHOLDER_WRONG_OPTIONS[i % PLACEHOLDER_WRONG_OPTIONS.length], isCorrect: false })
    i++
  }
  return padded
}

function parseOptions(options, type) {
  if (type === 'TF') {
    if (Array.isArray(options) && options.length === 2) {
      const trueIdx = options.findIndex((o) => (o.text || '').toLowerCase().startsWith('true'))
      const falseIdx = options.findIndex((o) => (o.text || '').toLowerCase().startsWith('false'))
      if (trueIdx !== -1 && falseIdx !== -1) {
        return [
          { text: 'True', isCorrect: !!options[trueIdx].isCorrect },
          { text: 'False', isCorrect: !!options[falseIdx].isCorrect }
        ]
      }
    }
    return [
      { text: 'True', isCorrect: true },
      { text: 'False', isCorrect: false }
    ]
  }

  if (!Array.isArray(options) || options.length < 2) {
    return [
      { text: 'Option A', isCorrect: true },
      { text: 'Option B', isCorrect: false },
      { text: 'Option C', isCorrect: false },
      { text: 'Option D', isCorrect: false }
    ]
  }

  let normalized = options.map((opt) => ({
    text: opt.text || opt.option || 'Unknown',
    isCorrect: !!(opt.isCorrect || opt.correct)
  }))

  if (type === 'MCQ' || type === 'MSQ') {
    normalized = repairToFourOptions(normalized)
  }

  // Safety net: if the AI marked zero options correct (or, for MCQ, more
  // than one), fix up rather than shipping an unanswerable/ambiguous question.
  const correctCount = normalized.filter((o) => o.isCorrect).length
  if (correctCount === 0) {
    normalized[0].isCorrect = true
  } else if (type === 'MCQ' && correctCount > 1) {
    let kept = false
    normalized = normalized.map((o) => {
      if (!o.isCorrect) return o
      if (!kept) { kept = true; return o }
      return { ...o, isCorrect: false }
    })
  }

  return normalized
}

// Parses the AI's raw text response into normalized candidate objects.
// Any type not recognized falls back to 'TF' rather than being dropped.
export function parseCandidates(responseText) {
  try {
    let jsonStr = responseText

    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) jsonStr = jsonMatch[1]

    const objMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!objMatch) throw new Error('No JSON found in response')

    const parsed = JSON.parse(objMatch[0])
    const questions = parsed.questions || []

    return questions.map((q, index) => {
      const type = TYPE_DESCRIPTIONS[q.type] ? q.type : 'TF'
      return {
        id: `q_${Date.now()}_${index}`,
        type,
        question: q.question || 'Question text missing',
        options: parseOptions(q.options || [], type),
        confidence: typeof q.confidence === 'number' ? q.confidence : 50,
        difficulty: q.difficulty === 'hard' || q.difficulty === 'easy' ? q.difficulty : 'medium',
        explanation: q.explanation || '',
        segmentIndex: 0,
        createdAt: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('Failed to parse candidate questions:', error)
    return []
  }
}

export { TYPE_DESCRIPTIONS }