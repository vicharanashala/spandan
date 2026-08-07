/**
 * Local question generator - no external API required.
 * Uses heuristic text processing to extract quiz questions from a transcript.
 *
 * Strategy:
 *  1. Split transcript into sentences.
 *  2. Score each sentence by "fact-ness" (contains numbers, named entities,
 *     cause-effect words, definitions, etc.).
 *  3. Build questions from high-scoring sentences:
 *     - Definition pattern -> "What is X?" with answer X
 *     - "X is Y" pattern -> "What is Y?" with answer X
 *     - Number-bearing -> "What number..." with the number as the answer
 *     - Multiple choice: pick 1 right answer + 3 plausible distractors
 *  4. Mix MCQ, true/false, and short-answer per config.
 */
import crypto from 'crypto'

const STOPWORDS = new Set([
  'the','a','an','and','or','but','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','should','could','can',
  'may','might','must','shall','this','that','these','those','i','you','he',
  'she','it','we','they','them','their','our','your','my','his','her','its',
  'of','in','on','at','to','for','with','by','from','as','into','through',
  'during','before','after','above','below','between','out','off','over','under',
  'again','further','then','once','here','there','when','where','why','how',
  'all','any','both','each','few','more','most','other','some','such','no',
  'nor','not','only','own','same','so','than','too','very','s','t','just',
  'now','also','about'
])

function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 300)
}

function tokenize(sentence) {
  return sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function extractKeywords(sentence) {
  return tokenize(sentence).filter(w => w.length > 3 && !STOPWORDS.has(w))
}

function sentenceScore(sentence) {
  let score = 0
  // Numbers = factual
  if (/\b\d+([.,]\d+)?\b/.test(sentence)) score += 3
  // Years
  if (/\b(19|20)\d{2}\b/.test(sentence)) score += 2
  // Definition patterns
  if (/\b(is|are|means|refers to|defined as|known as)\b/i.test(sentence)) score += 4
  // Cause/effect
  if (/\b(because|therefore|thus|hence|results? in|leads? to|causes?)\b/i.test(sentence)) score += 3
  // Has multiple keywords = likely dense with info
  const kws = extractKeywords(sentence)
  score += Math.min(kws.length, 6)
  // Capitalized proper nouns
  const properNouns = (sentence.match(/\b[A-Z][a-z]+\b/g) || []).length
  score += Math.min(properNouns, 3)
  // Penalize first-person or conversational
  if (/^(so|well|now|okay|alright|um|uh|like|let's|let me)/i.test(sentence)) score -= 4
  if (/\b(I think|I believe|in my opinion|you know)\b/i.test(sentence)) score -= 3
  return score
}

// Pattern detectors
const DEFINITION = /^(.+?)\s+(?:is|are|means?)\s+(.+?)[.!?]?$/i
const IS_PATTERN = /^(.+?)\s+is\s+(?:a|an|the)?\s*(.+?)[.!?]?$/i

function pickRandom(arr, n, exclude = []) {
  const pool = arr.filter(x => !exclude.includes(x))
  const out = []
  while (out.length < n && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length)
    out.push(pool.splice(i, 1)[0])
  }
  return out
}

// Generate plausible distractors from other facts in the transcript
function buildDistractors(correctAnswer, allKeywords, n = 3) {
  // Pick keywords/numbers that are not the correct answer
  const candidates = []
  // Numbers in the transcript
  const numbers = allKeywords.filter(k => /^\d+([.,]\d+)?$/.test(k))
  for (const num of numbers) {
    if (num !== correctAnswer) candidates.push(num)
  }
  // Other keywords
  for (const k of allKeywords) {
    if (k !== correctAnswer && k.length > 3) candidates.push(k)
  }
  return pickRandom(candidates, n)
}

function buildMCQ(sentence, allKeywords, index) {
  // Try "X is Y" pattern
  const isMatch = sentence.match(IS_PATTERN)
  if (isMatch) {
    const [, subject, definition] = isMatch
    if (subject.length > 2 && definition.length > 2 && subject.length < 60 && definition.length < 120) {
      const cleanDef = definition.replace(/^(a|an|the)\s+/i, '').trim()
      const correct = cleanDef.split(/[,;]/)[0].trim()
      if (correct.length > 2) {
        return {
          type: 'MCQ',
          question: `What ${subject.toLowerCase().startsWith('the') ? 'is' : 'is'} ${subject}?`,
          options: [
            { text: correct, isCorrect: true },
            ...buildDistractors(correct, allKeywords, 3).map(d => ({ text: d, isCorrect: false }))
          ].slice(0, 4),
          explanation: `${subject} is ${cleanDef}.`
        }
      }
    }
  }

  // Try "Definition means X"
  const defMatch = sentence.match(DEFINITION)
  if (defMatch) {
    const [, term, definition] = defMatch
    if (term.length > 2 && term.length < 50) {
      const correct = definition.split(/[,;]/)[0].trim().replace(/^(a|an|the)\s+/i, '')
      if (correct.length > 2 && correct.length < 100) {
        return {
          type: 'MCQ',
          question: `According to the lecture, ${term} is:__BLANK__`.replace('__BLANK__', '?'),
          options: [
            { text: correct, isCorrect: true },
            ...buildDistractors(correct, allKeywords, 3).map(d => ({ text: d, isCorrect: false }))
          ].slice(0, 4),
          explanation: sentence
        }
      }
    }
  }

  // Number fact: "X produced Y watts of power" -> "How many watts..." -> answer: number
  const numMatch = sentence.match(/([A-Za-z][\w\s]{3,40}?)\s+(?:produces?|generates?|equals?|is|contains?|has|measures?)\s+(\d+(?:[.,]\d+)?)\s*([a-z%]+)?/i)
  if (numMatch) {
    const [, thing, number, unit] = numMatch
    return {
      type: 'MCQ',
      question: `How many ${unit || 'units'}${unit ? '' : ''} does ${thing.trim()} have, according to the lecture?`,
      options: [
        { text: number, isCorrect: true },
        ...buildDistractors(number, allKeywords, 3).map(d => ({ text: d, isCorrect: false }))
      ].slice(0, 4),
      explanation: sentence
    }
  }

  // Generic: cloze from keywords
  const kws = extractKeywords(sentence)
  if (kws.length >= 4) {
    const answer = kws[Math.floor(kws.length / 2)]
    const masked = sentence.replace(new RegExp(`\\b${answer}\\b`, 'i'), '___')
    return {
      type: 'MCQ',
      question: `Fill in the blank: "${masked}"`,
      options: [
        { text: answer, isCorrect: true },
        ...buildDistractors(answer, allKeywords, 3).map(d => ({ text: d, isCorrect: false }))
      ].slice(0, 4),
      explanation: sentence
    }
  }
  return null
}

function buildTF(sentence, allKeywords, index) {
  // Pick a definition sentence and flip it for the false variant
  const isMatch = sentence.match(IS_PATTERN)
  if (isMatch) {
    const [, subject, definition] = isMatch
    const correct = definition.split(/[,;]/)[0].trim().replace(/^(a|an|the)\s+/i, '')
    // Make a plausible false by using a distractor
    const distractors = buildDistractors(correct, allKeywords, 1)
    const isTrue = index % 2 === 0
    return {
      type: 'TF',
      question: `${subject} is ${isTrue ? correct : (distractors[0] || 'something else')}.`,
      options: [
        { text: 'True', isCorrect: isTrue },
        { text: 'False', isCorrect: !isTrue }
      ],
      explanation: isTrue ? sentence : `${subject} is actually ${correct}.`
    }
  }
  // Number fact TF
  const numMatch = sentence.match(/(\d+(?:[.,]\d+)?)/)
  if (numMatch) {
    const num = numMatch[1]
    const isTrue = index % 2 === 0
    const fakeNum = buildDistractors(num, allKeywords, 1)[0] || '0'
    return {
      type: 'TF',
      question: sentence.replace(num, isTrue ? num : fakeNum),
      options: [
        { text: 'True', isCorrect: isTrue },
        { text: 'False', isCorrect: !isTrue }
      ],
      explanation: isTrue ? sentence : `The actual value mentioned was ${num}.`
    }
  }
  return null
}

function buildShortAnswer(sentence, allKeywords, index) {
  const isMatch = sentence.match(IS_PATTERN)
  if (isMatch) {
    const [, subject, definition] = isMatch
    return {
      type: 'SA',
      question: `In your own words, ${subject} is what?`,
      options: [],
      explanation: sentence
    }
  }
  // First keyword as the answer
  const kws = extractKeywords(sentence)
  if (kws.length >= 3) {
    const answer = kws[0]
    return {
      type: 'SA',
      question: `Name one key concept from: "${sentence.slice(0, 100)}${sentence.length > 100 ? '...' : ''}"`,
      options: [],
      explanation: `Possible answers: ${kws.slice(0, 3).join(', ')}`
    }
  }
  return null
}

/**
 * Main entry: generate questions from a transcript without any AI provider.
 * @param {string} transcript - the source text
 * @param {object} cfg - { questionCount, difficulty, types: ['MCQ','TF','SA'] }
 */
export function generateLocalQuestions(transcript, cfg = {}) {
  const {
    questionCount = 5,
    difficulty = 'medium',
    types = ['MCQ', 'TF', 'SA']
  } = cfg

  const sentences = splitSentences(transcript)
  if (sentences.length === 0) {
    throw new Error('Transcript is too short or contains no usable sentences')
  }

  // Score and rank sentences
  const scored = sentences
    .map((s, i) => ({ s, i, score: sentenceScore(s) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) {
    throw new Error('Transcript does not contain enough factual content to generate questions')
  }

  // Collect all keywords for distractor generation
  const allKeywords = [...new Set(scored.flatMap(x => extractKeywords(x.s)))]

  const questions = []
  const targetMix = distributeTypes(questionCount, types)
  const usedSentences = new Set()

  for (let i = 0; i < targetMix.length && questions.length < questionCount; i++) {
    const type = targetMix[i]
    let q = null
    // Try the highest-scoring unused sentences first, fall back to lower-scored
    for (const candidate of scored) {
      if (usedSentences.has(candidate.i)) continue
      if (type === 'MCQ') q = buildMCQ(candidate.s, allKeywords, questions.length)
      else if (type === 'TF') q = buildTF(candidate.s, allKeywords, questions.length)
      else if (type === 'SA') q = buildShortAnswer(candidate.s, allKeywords, questions.length)
      if (q) {
        usedSentences.add(candidate.i)
        break
      }
    }
    if (q) {
      q.id = `q_${crypto.randomBytes(6).toString('hex')}`
      q.segmentIndex = 0
      q.createdAt = new Date().toISOString()
      q.source = 'local-heuristic'
      q.difficulty = difficulty
      questions.push(q)
    }
  }

  if (questions.length === 0) {
    throw new Error('Could not extract any questions from the transcript')
  }

  return questions
}

function distributeTypes(total, types) {
  // Default mix: roughly 60% MCQ, 25% TF, 15% SA
  let mix
  if (!types || types.length === 0) {
    const mcq = Math.round(total * 0.6)
    const tf = Math.round(total * 0.25)
    const sa = total - mcq - tf
    mix = [
      ...Array(mcq).fill('MCQ'),
      ...Array(tf).fill('TF'),
      ...Array(sa).fill('SA')
    ]
  } else {
    mix = []
    while (mix.length < total) {
      mix.push(types[mix.length % types.length])
    }
  }
  // Shuffle so types aren't bunched
  for (let i = mix.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [mix[i], mix[j]] = [mix[j], mix[i]]
  }
  return mix
}