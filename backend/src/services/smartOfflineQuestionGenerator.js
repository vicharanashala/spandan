/**
 * Smart Question Generator Fallback
 * Generates educational MCQs, True/False, and MSQs from text without needing an external API key.
 * Used when no external AI keys are configured or when the AI provider times out/fails.
 */

export function generateOfflineQuestions(text, options = {}) {
  const {
    numQuestions = 5,
    difficulty = 'medium',
    questionTypes = []
  } = options

  // Clean and split text into meaningful sentences
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\[\d+\]/g, '') // remove citation brackets
    .trim()

  // Split into sentences
  const rawSentences = cleaned.split(/(?<=[.?!])\s+/)
  const validSentences = rawSentences
    .map(s => s.trim())
    .filter(s => s.length >= 35 && s.length <= 220 && !s.startsWith('http') && !/^\d+$/.test(s))

  // If there are too few valid sentences, split by lines or commas
  const sentences = validSentences.length >= 3
    ? validSentences
    : cleaned.split('\n').map(s => s.trim()).filter(s => s.length >= 25)

  if (sentences.length === 0) {
    throw new Error('Not enough text content to generate questions. Please provide longer text or PDF.')
  }

  const questions = []
  const count = Math.min(numQuestions, Math.max(sentences.length, numQuestions))

  // Determine question types
  const types = questionTypes.length === count
    ? questionTypes
    : Array.from({ length: count }, (_, i) => {
        if (i % 3 === 0) return 'MCQ'
        if (i % 3 === 1) return 'TF'
        return 'MSQ'
      })

  for (let i = 0; i < count; i++) {
    const sIndex = i % sentences.length
    const mainSentence = sentences[sIndex]
    const qType = types[i] || 'MCQ'
    const qId = `pdf_q_${Date.now()}_${i}`

    // Extract key phrase or subject
    const words = mainSentence.split(' ')
    const subject = words.slice(0, Math.min(6, words.length)).join(' ')

    if (qType === 'TF') {
      // Create a True/False question
      const isTrue = i % 2 === 0
      let statement = mainSentence
      let explanation = `According to the document: "${mainSentence}"`

      if (!isTrue) {
        // Negate statement or introduce contrast
        if (statement.includes(' is ')) {
          statement = statement.replace(' is ', ' is not ')
        } else if (statement.includes(' are ')) {
          statement = statement.replace(' are ', ' are not ')
        } else if (statement.includes(' can ')) {
          statement = statement.replace(' can ', ' cannot ')
        } else {
          statement = `In all cases without exception, ${statement.charAt(0).toLowerCase() + statement.slice(1)}`
        }
        explanation = `The statement is False. The document states: "${mainSentence}"`
      }

      questions.push({
        id: qId,
        type: 'TF',
        question: `True or False: ${statement}`,
        options: [
          { text: 'True', isCorrect: isTrue },
          { text: 'False', isCorrect: !isTrue }
        ],
        explanation,
        segmentIndex: 0,
        timeToAnswer: 30,
        points: 100,
        status: 'approved'
      })
    } else if (qType === 'MSQ') {
      // Multi-Select Question
      const nextSentence = sentences[(sIndex + 1) % sentences.length] || mainSentence
      const distractor1 = sentences[(sIndex + 2) % sentences.length] || 'This statement is not supported by the document'
      const distractor2 = 'None of the principles mentioned in the document apply to this'

      questions.push({
        id: qId,
        type: 'MSQ',
        question: `Based on the provided document, which of the following statements are correct? (Select all that apply)`,
        options: [
          { text: mainSentence, isCorrect: true },
          { text: nextSentence, isCorrect: true },
          { text: `Conversely, it is universally prohibited that ${distractor1.toLowerCase().slice(0, 70)}...`, isCorrect: false },
          { text: distractor2, isCorrect: false }
        ],
        explanation: `Statements A and B are directly verified by the document text.`,
        segmentIndex: 0,
        timeToAnswer: 45,
        points: 100,
        status: 'approved'
      })
    } else {
      // Standard MCQ
      const distractor1 = sentences[(sIndex + 1) % sentences.length] || 'It operates independently of the described mechanism'
      const distractor2 = sentences[(sIndex + 2) % sentences.length] || 'It contradicts the fundamental premise of the discussion'
      const distractor3 = 'It occurs only when external conditions are inverted'

      // Formulate a good question stem
      const questionStem = words.length > 8
        ? `Regarding "${subject}...", which of the following statements is accurate according to the document?`
        : `Which of the following statements is accurate based on the text?`

      // Shuffle options and remember correct index
      const rawOptions = [
        { text: mainSentence, isCorrect: true },
        { text: distractor1.slice(0, 110), isCorrect: false },
        { text: distractor2.slice(0, 110), isCorrect: false },
        { text: distractor3, isCorrect: false }
      ]

      // Deterministic pseudo-shuffle based on i
      const shift = i % 4
      const shuffledOptions = [
        ...rawOptions.slice(shift),
        ...rawOptions.slice(0, shift)
      ]

      questions.push({
        id: qId,
        type: 'MCQ',
        question: questionStem,
        options: shuffledOptions,
        explanation: `Correct: "${mainSentence}". This fact is directly confirmed in the material.`,
        segmentIndex: 0,
        timeToAnswer: 30,
        points: 100,
        status: 'approved'
      })
    }
  }

  return questions
}
