/**
 * Rule-based local question generator.
 * Extracts content from text and creates MCQs, True/False, and Fill-in-the-Blanks
 * without any AI provider.
 */

function extractSentences(text) {
  return text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 15)
}

function extractKeywords(sentence) {
  const words = sentence
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !['this', 'that', 'with', 'from', 'have', 'been', 'were', 'what', 'which', 'their', 'there', 'about', 'would', 'could', 'should', 'after', 'before', 'between', 'other', 'these', 'those', 'while', 'where', 'because', 'therefore', 'however', 'although', 'instead', 'without', 'within', 'along', 'during', 'since', 'until', 'above', 'below', 'under', 'over', 'again', 'further', 'moreover', 'then', 'also', 'very', 'just', 'still', 'already', 'always', 'never', 'often', 'seldom', 'usually', 'sometimes', 'finally', 'first', 'second', 'third', 'next', 'last', 'another', 'each', 'every', 'both', 'neither', 'either', 'much', 'many', 'some', 'any', 'few', 'several', 'most', 'all', 'no', 'not', 'only', 'own', 'same', 'such', 'than', 'too', 'very'].includes(w.toLowerCase()))
    .map(w => w.toLowerCase())

  const freq = {}
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1 })
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word)
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function generateMCQ(sentence, keywords, allSentences, idx) {
  const keyword = keywords[idx % keywords.length] || 'concept'
  const correctAnswer = sentence.substring(0, 80).trim()

  // Find the keyword position and create a question
  const kwInSentence = sentence.toLowerCase().includes(keyword)
  const questionText = kwInSentence
    ? `Which of the following best describes "${keyword}"?`
    : `What is the correct statement about this topic?`

  const wrongOptions = allSentences
    .filter(s => s !== sentence)
    .slice(0, 3)
    .map(s => s.substring(0, 60).trim())

  // Pad with generic wrong options if needed
  while (wrongOptions.length < 3) {
    wrongOptions.push(`None of the above`)
  }

  const options = shuffle([
    { text: correctAnswer.substring(0, 80), isCorrect: true },
    ...wrongOptions.map(t => ({ text: t, isCorrect: false }))
  ])

  return {
    id: `local_mcq_${Date.now()}_${idx}`,
    type: 'MCQ',
    question: questionText,
    options,
    explanation: `The correct answer is based on the source material.`,
    segmentIndex: 0,
    createdAt: new Date().toISOString()
  }
}

function generateTF(sentence, allSentences, idx) {
  const isTrue = Math.random() > 0.4
  const questionText = isTrue
    ? sentence.substring(0, 100).trim() + '.'
    : (sentence.substring(0, 80).trim() + ' ' + (allSentences[idx + 1] || allSentences[0]).substring(0, 30).trim()).substring(0, 100) + '.'

  const options = [
    { text: 'True', isCorrect: isTrue },
    { text: 'False', isCorrect: !isTrue }
  ]

  return {
    id: `local_tf_${Date.now()}_${idx}`,
    type: 'TF',
    question: `True or False: ${questionText}`,
    options,
    explanation: `Based on the content, this statement is ${isTrue ? 'true' : 'false'}.`,
    segmentIndex: 0,
    createdAt: new Date().toISOString()
  }
}

function generateFillBlank(sentence, keywords, idx) {
  const kw = keywords[idx % keywords.length]
  if (!kw || !sentence.toLowerCase().includes(kw)) return null

  const blanked = sentence.replace(new RegExp(kw, 'gi'), '________')
  if (blanked === sentence) return null

  return {
    id: `local_fib_${Date.now()}_${idx}`,
    type: 'FILL_BLANK',
    question: `Fill in the blank: ${blanked}`,
    options: shuffle([
      { text: kw, isCorrect: true },
      ...keywords.filter(k => k !== kw).slice(0, 3).map(k => ({ text: k, isCorrect: false }))
    ]),
    explanation: `The correct answer is "${kw}".`,
    segmentIndex: 0,
    createdAt: new Date().toISOString()
  }
}

export function generateQuestionsLocally(transcript, numQuestions = 2) {
  if (!transcript || transcript.trim().length < 10) {
    return []
  }

  const sentences = extractSentences(transcript)
  if (sentences.length < 2) {
    // If too few sentences, split differently
    const parts = transcript.split(/\n+/).filter(p => p.trim().length > 20)
    if (parts.length >= 2) {
      return generateQuestionsLocally(parts.join('. '), numQuestions)
    }
    // As last resort, make one question from whatever we have
    const firstKW = extractKeywords(transcript)
    const q = generateMCQ(transcript.substring(0, 100), firstKW.length ? firstKW : ['concept'], [transcript.substring(0, 100)], 0)
    return [q]
  }

  // Build global keywords from all sentences
  const allKeywords = []
  sentences.forEach(s => {
    allKeywords.push(...extractKeywords(s))
  })

  const uniqueKW = [...new Set(allKeywords)]

  if (uniqueKW.length === 0) {
    uniqueKW.push('key concept', 'important idea', 'main topic')
  }

  const questions = []
  const mcqCount = Math.ceil(numQuestions * 0.5)
  const tfCount = Math.floor(numQuestions * 0.3)
  const fibCount = numQuestions - mcqCount - tfCount

  // Generate MCQs
  for (let i = 0; i < mcqCount && i < sentences.length; i++) {
    questions.push(generateMCQ(sentences[i], uniqueKW, sentences, i))
  }

  // Generate T/F
  for (let i = 0; i < tfCount && i < sentences.length; i++) {
    const idx = (mcqCount + i) % sentences.length
    questions.push(generateTF(sentences[idx], sentences, i))
  }

  // Generate Fill-in-Blanks
  let fibDone = 0
  for (let i = 0; i < sentences.length && fibDone < fibCount; i++) {
    const fib = generateFillBlank(sentences[i], uniqueKW, fibDone)
    if (fib) {
      questions.push(fib)
      fibDone++
    }
  }

  return questions.slice(0, numQuestions)
}

export default {
  generateQuestionsLocally
}
