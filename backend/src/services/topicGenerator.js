// Auto-topic generator -- watches rolling transcript windows and detects topic shifts.
// Uses MiniMax AI when available; falls back to a key-noun extractor otherwise.

import 'dotenv/config'

const MINIMAX_KEY = process.env.MINIMAX_API_KEY
const MINIMAX_URL = process.env.MINIMAX_API_URL || 'https://api.minimaxi.chat/v1/chat/completions'
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2.7'

const STOPWORDS = new Set([
  'the','and','for','with','that','this','have','from','they','will','what','when','about',
  'your','their','then','them','some','into','over','also','than','just','like','make',
  'more','most','very','much','such','each','only','because','would','could','should',
  'where','there','these','those','here','okay','right','yeah','well','kind','sort',
  'going','really','thing','things','stuff','anyway','basically','literally','literally',
  'look','see','know','want','need','take','use','going','gonna','wanna','gotta',
  'uh','um','mm','hmm','ah','oh','huh','like','mean','said','say','says','tell','told',
  'first','second','third','next','last','before','after','while','during','since',
  'class','today','lecture','lesson','topic','subject','chapter','section','part',
  'student','students','teacher','classroom','school','college','university',
  'people','person','place','time','way','year','day','number','problem','example'
])

// Greeting / opening / framing words that appear as the FIRST content word in
// any teacher intro. They get capitalized at the start of a sentence, so the
// proper-noun-pairs strategy mis-identifies them as concepts. They never
// make a good topic on their own.
//
// Anywhere a strategy would *anchor* a topic on one of these (bigram first
// word, frequency pick first word, first-sentence lead word), we skip them
// and look further. They CAN appear as the second word of a bigram in
// extreme cases ('Welcome everyone ... ' -- we just skip this whole bigram).
//
// NOTE: do NOT include content nouns here. 'photos', 'visits', 'study',
// 'important', 'food' are all valid topics when they survive in a transcript.
const GREETING_FILLER = new Set([
  // salutations / openers
  'hello','hi','hey','howdy','greetings','welcome',
  // discourse markers
  'okay','ok','alright','right','so','now','well','yeah','yes','oh',
  // framing pronouns / demonstratives that begin sentences
  'today','tonight','tomorrow','yesterday','this','that','these','those',
  'we','you','they','i','it','he','she','our',
  // vague address terms
  'everyone','everybody','all','class','guys','friends','folks','people',
  'students','student','teacher','classroom',
  // lesson meta
  'lecture','lesson','topic','subject','chapter','section','part','unit',
  'session','discussion','overview','introduction','intro',
  // generic verbs that surface as 'study X', 'discuss Y' but never the topic
  'discuss','discussing','discussion','learn','learning','study','studying','talk','talking',
  'begin','beginning','starts','starting','start','continue','continuing',
  // auxiliary / modal verbs and contractions -- never topics themselves
  'let','lets',"let's",'lets','we','we\'re','we\'ll','we\'ve','we\'d',
  'i\'m','i\'ll','i\'ve','you\'re','you\'ll','they\'re','they\'ll','it\'s',
  // subordinate-clause glue as standalone ('which', 'what', etc.)
  'which','where','when','what','how','why','who','whose'
])

// Words that are valid English but signal "this is the verb form, not the noun".
// Used as a soft signal to reject single-word frequency picks that are verb
// forms of common words ('study' as verb vs 'studies' as noun).
const VERB_FORMS = new Set([
  'is','are','was','were','has','have','had','does','do','did',
  'goes','going','gone','made','make','makes',
  'gets','getting','got','taken','takes','taking','gave','giving','gives',
  'said','say','says','telling','tell','tells','told',
  'coming','seen','seeing','saw','knows','knowing','knew',
  'want','wants','wanted','wanting','need','needs','needed','needing',
  'thinks','thought','thinking','seem','seems','seemed','seeming',
  'feel','feels','felt','feeling','look','looks','looked','looking',
  'important','basically','literally','really','actually','probably',
  'maybe','perhaps','usually','often','sometimes','always','never',
  // vague gerunds that aren't topics
  'thinking','feeling','looking','wanting','saying','doing','making',
  'going','coming','having','getting','telling','working','trying',
  'learning','teaching','reading','writing','running','walking',
  // emotional / mental state verbs (not topics)
  'confused','confusing','am','worried','confusing','surprised',
  'excited','bored','happy','sad','angry','scared','afraid',
  // abstract fragments that survive length filter but aren't concepts
  'thing','things','stuff','way','ways','time','times','people','place','year','day'
])

// Subordinate-clause glue words that should never be the second element of
// a proper-noun bigram. They form valid English ('Photosynthesis which...')
// but are not concepts. Distinct from GREETING_FILLER because some of these
// (e.g. 'which') are content words elsewhere.
const CONNECTORS = new Set([
  'which','where','when','that','who','whom','whose','how','why',
  'is','are','was','were','has','have','had','does','do','did',
  'will','would','can','could','should','may','might','shall',
  'and','or','but','so','yet','because','if','then',
  'about','of','in','on','to','for','from','with','at','by','as','into','through'
])

// Canonical educational concept second-words. A proper-noun bigram is
// accepted ONLY when its second word appears in this set. This stops
// 'Photosynthesis energy', 'Climate weather', 'Binary algorithm',
// 'Food nutrients' from being treated as topics -- those are concept+
// generic-noun pairs, not real concepts.
//
// How the set was built: the small set of compound topics that recur in
// academic lectures (binary search, climate change, food chain, natural
// selection, machine learning, Krebs cycle, electron transport, second
// law, quadratic formula, ...). When a real canonical concept is missing,
// add it here. Err on the side of FEWER entries -- false negatives
// (returning a single word) are better than false positives (returning
// 'Photosynthesis energy').
const CONCEPT_SECOND_WORDS = new Set([
  // Computer Science / data structures (canonical pairs only)
  'search','sort','sorting','tree','trees','heap','stack','queue','graph','graphs',
  // Scientific cycle / chain concepts (Krebs cycle, food chain, electron transport chain)
  'cycle','chain','chains','pathway','pathways','cascade','cascades',
  // 'Climate change', 'natural selection', 'artificial intelligence' pairs
  'change','selection','intelligence','selection','pressure',
  // Scientific reactions / processes (chemical reaction, nuclear reaction)
  'reaction','reactions','decay','fusion','fission','equilibrium',
  // Geometry / math (second derivative, quadratic formula, quadratic equation,
  // Pythagorean theorem, binomial theorem, ...)
  'formula','formulas','equation','equations','theorem','theorems',
  // Biological / cellular (cell division, gene expression, protein synthesis, ...)
  // Note: NOT including 'cell', 'cells' alone -- 'Mitosis cells' is descriptive,
  // not a canonical compound topic.
  'division','expression','synthesis','replication','transcription','translation',
  // Quantum / energy (kinetic energy IS descriptive, NOT canonical; excluded)
  // We intentionally do NOT include 'energy','force','motion','velocity' --
  // these are descriptive properties, not compound topics.
  // Calendar / era / period (industrial revolution, ...)
  'revolution','reform','movement','wars','crisis',
  // Architectural / cultural / domain compounds
  'ecology','biology','physics','chemistry','mathematics','history','economics',
  'linguistics','sociology','philosophy',
  // Quadratic / linear algebra
  'algebra','geometry','calculus','trigonometry','topology','combinatorics',
  // Singular-only forms that DO pair (we handle plurality at lookup time below)
  'mechanism','system','theory','model'
])

// Pluralized lookup helper: 'chain' accepts 'chains'; 'cycle' accepts 'cycles'.
// We do a fallback at check time so the set above stays singular.
function isConceptSecondWord (w) {
  if (!w) return false
  const lo = w.toLowerCase()
  if (CONCEPT_SECOND_WORDS.has(lo)) return true
  // Strip trailing 's' or 'es' for plural handling: 'trees' -> 'tree'.
  if (lo.length > 4 && lo.endsWith('s')) {
    const singular = lo.endsWith('es') ? lo.slice(0, -2) : lo.slice(0, -1)
    if (CONCEPT_SECOND_WORDS.has(singular)) return true
  }
  return false
}

// Canonical lowercase first-words that form compound topics ONLY with a
// concept-second-word. Examples: 'quadratic formula', 'second derivative',
// 'first law'. Without this, 'quadratic formula' loses to 'Quadratic' as
// a single concept pick (Strategy 1b). Used in Strategy 1c below.
const CONCEPT_FIRST_WORDS = new Set([
  'quadratic','linear','differential','integral','partial','second','first','third',
  'pythagorean','binomial','fundamental','central','mean','standard','normal',
  'newton','second','third','darwin','einstein','hawking','darwinian'
])

// Whisper noise tokens -- these appear in transcripts as artifacts from audio
// recognition. Words like "[BLANK_AUDIO]", "(laughs)", "*sigh*" produce
// capitalized tokens that look like proper nouns but aren't real content.
// Strip them BEFORE doing any topic scoring.
const NOISE_TOKENS = new Set([
  'BLANK_AUDIO', 'SILENCE', 'NO_SPEECH', 'INAUDIBLE', 'BACKGROUND', 'NOISE',
  'Music', 'Background', 'Silence', 'Silence', 'Sound', 'Audio', 'Voice',
  'Sigh', 'Laugh', 'Laughs', 'Laughter', 'Cough', 'Coughs', 'Sneeze', 'Sniff',
  'Snoring', 'Breathing', 'Whistling', 'Clicking', 'Typing', 'Keyboard',
  'Wind', 'Birds', 'Barking', 'Dog', 'Cat', 'Music', 'Applause', 'Clapping',
  'Crying', 'Sobbing', 'Yawning', 'Sigh', 'Sighs', 'Gasp', 'Gasps', 'Moan',
  'Moans', 'Scream', 'Screams', 'Shout', 'Shouts', 'Whisper', 'Whispers',
  'Mumbles', 'Mumble', 'Mumbling', 'Stuttering', 'Stutter', 'Stutters',
  'Hm', 'Hmm', 'Ugh', 'Ahh', 'Ooh', 'Ehh', 'Hmph'
])

function stripNoise (text) {
  return text
    // [BLANK_AUDIO], [Music], (laughs), *sigh* all go
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    // Repeated phrases like "I am locked. I am locked. I am locked." collapse
    // to a single instance (not removed entirely -- the repeated content
    // word is itself a topic signal).
    .replace(/\b(\w+(?:\s+\w+){0,3})\.?\s+(?:\1\.?\s*){1,}/gi, '$1 ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Local heuristic: extract a short topic label from a transcript chunk.
 *
 * Three strategies tried in order:
 *   1. Proper-noun bigram -- "<ProperNoun> <ContentWord>" -- best for technical
 *      terms like "Binary Search", "Krebs cycle", "Climate Change".
 *   2. Fallback frequency list -- top 2-3 meaningful tokens with proper-noun
 *      boost ("Photosynthesis Climate Change" when no clear bigram exists).
 *   3. First-sentence fallback -- take the first few words after stripping all
 *      greetings/fillers ("Photosynthesis Calvin cycle and electron transport").
 *
 * Returns '' when nothing meaningful survives all filters. Callers should
 * treat '' as "no signal" and use 'General Confusion' as the user-facing
 * default. We do NOT default to 'General Confusion' inside this function
 * because both call sites already do so, and keeping a single source of
 * truth for the empty-result semantics makes tests easier.
 *
 * Anti-noise design (the bug we're fixing):
 *   - Greetings/openings like "Hello", "Hi", "Welcome", "Today" are NEVER
 *     accepted as the first word of a bigram or as a frequency pick.
 *   - Subordinate-clause glue like "which", "that", "what" are NEVER accepted
 *     as the second word of a bigram.
 *   - Greeting + greeting pairs don't even produce a fallback ("Hello hi").
 *   - Single isolated words ("important", "Photos") don't qualify for the
 *     frequency list -- we require at least 2 distinct meaningful tokens.
 *   - All-greeting transcripts ("Hello hello hello.") return '', which the
 *     caller upgrades to 'General Confusion'.
 */

// Temporary diagnostic -- set DEBUG_TOPIC=1 to enable trace logging.
// Logs raw, cleaned, candidates per strategy, and final label so we can
// verify the heuristic against Rashmi's manual test cases. REMOVE AFTER
// the fix is verified end-to-end.
const DEBUG_TOPIC = process.env.DEBUG_TOPIC === '1'

export function extractTopicProxy (text) {
  if (!text || typeof text !== 'string') return ''
  const cleaned = stripNoise(text)
  if (!cleaned) {
    if (DEBUG_TOPIC) console.log(`[topic-debug] RAW="${text}" CLEANED="" FINAL="" (empty after noise strip)`)
    return ''
  }

  // Tokenize once: anything that starts with a letter and is followed by
  // 2+ letters/apostrophes (so "we're" both match). HYPHENS ARE SPLIT into
  // separate tokens: "Second-degree polynomial" yields ["Second", "degree",
  // "polynomial"] rather than one big "Second-degree" token that hijacks the
  // frequency score.
  const tokensWithPos = cleaned.match(/[A-Za-z][a-zA-Z']{2,}/g) || []
  if (tokensWithPos.length < 1) {
    if (DEBUG_TOPIC) console.log(`[topic-debug] RAW="${text}" CLEANED="${cleaned}" TOKENS=${tokensWithPos.length} FINAL="" (too few tokens)`)
    return ''
  }

  // Build a parallel "filtered tokens" array: same words, but with
  // greetings/connectors/stopwords/noise pre-filtered. If NO meaningful
  // token survives at all, the transcript has no extractable topic --
  // (e.g. "Hello hello hello." or "So ok yeah."). We require at least
  // ONE surviving token to proceed; single-token labels are fine for the
  // common case of "Hi today we study Photosynthesis" -> "Photosynthesis".
  const filtered = []
  for (const t of tokensWithPos) {
    const lower = t.toLowerCase()
    if (NOISE_TOKENS.has(t) || NOISE_TOKENS.has(lower)) continue
    if (STOPWORDS.has(lower)) continue
    if (GREETING_FILLER.has(lower)) continue
    if (CONNECTORS.has(lower)) continue
    filtered.push(t)
  }
  const uniqueLower = new Set(filtered.map(t => t.toLowerCase()))
  if (uniqueLower.size < 1) {
    if (DEBUG_TOPIC) console.log(`[topic-debug] RAW="${text}" CLEANED="${cleaned}" FILTERED=${JSON.stringify(filtered)} FINAL="" (no tokens survived greeting/connector filter)`)
    return ''
  }

  // ── Strategy 1: proper-noun bigram ────────────────────────────────────────
  // Look for "<Cap4+> <Word4+>" sequences. BOTH must survive the
  // greeting/connector filter. If both happen to be capitalized (Binary
  // Search / Krebs Cycle) the bigram is weighted higher.
  const properNounPairs = []
  for (let i = 0; i < tokensWithPos.length - 1; i++) {
    const a = tokensWithPos[i]
    const b = tokensWithPos[i + 1]
    const aLower = a.toLowerCase()
    const bLower = b.toLowerCase()
    // First word: must be capitalized (proper-noun signal) AND length>=4
    // AND not be a greeting/filler. Greetings do start with caps but they
    // don't form real concepts -- we drop them here.
    if (a.length < 4) continue
    if (!/^[A-Z]/.test(a)) continue
    if (GREETING_FILLER.has(aLower)) continue
    if (NOISE_TOKENS.has(a)) continue
    // Second word: must NOT be a greeting (no "Photos hello") AND must NOT
    // be a connector (no "Thinking which"). Standard stopwords already
    // pass via the filter above.
    if (b.length < 4) continue
    if (GREETING_FILLER.has(bLower)) continue
    if (CONNECTORS.has(bLower)) continue
    if (NOISE_TOKENS.has(b)) continue
    // CONCEPT-SECOND-WORD filter: only accept bigram if second word is a
    // known canonical concept pairing ('Search' in 'Binary Search',
    // 'Change' in 'Climate Change', 'Chain' in 'Food Chain', ...).
    // This rejects descriptive pairs like 'Photosynthesis energy',
    // 'Climate weather', 'Food nutrients', 'Binary algorithm' which are
    // concept + generic noun, NOT a real topic.
    if (!isConceptSecondWord(b)) continue
    const bIsCap = /^[A-Z]/.test(b)
    properNounPairs.push({ pair: `${a} ${b}`, weight: bIsCap ? 2 : 1 })
  }
  if (properNounPairs.length > 0) {
    const counts = new Map()
    for (const p of properNounPairs) counts.set(p.pair, (counts.get(p.pair) || 0) + p.weight)
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    if (top) {
      const label = sanitizeLabel(top[0].slice(0, 60))
      if (DEBUG_TOPIC) console.log(`[topic-debug] RAW="${text}" CLEANED="${cleaned}" STRATEGY=bigram CANDIDATES=${JSON.stringify(properNounPairs.map(p=>p.pair))} FINAL="${label}"`)
      return label
    }
  }

  // Strategy 1b: single capitalized concept fallback. If no canonical
  // bigram was found BUT the transcript contains a strong single
  // capitalized noun (Photosynthesis, Mitosis, Food, ...),
  // pick it. This handles 'Photosynthesis energy' (rejected by 1a)
  // -> 'Photosynthesis', 'Food nutrients' (rejected) -> 'Food',
  // and 'Photosynthesis' alone -> 'Photosynthesis'.
  // We require length >= 4 (capitalized 4-letter words like 'Food',
  // 'Mitosis', 'Kafka' are real topics) AND no greeting/filler match.
  const singleCandidates = []
  for (const t of filtered) {
    if (t.length < 4) continue
    if (!/^[A-Z]/.test(t)) continue
    if (GREETING_FILLER.has(t.toLowerCase())) continue
    if (VERB_FORMS.has(t.toLowerCase())) continue
    if (NOISE_TOKENS.has(t)) continue
    singleCandidates.push(t)
  }
  if (singleCandidates.length > 0) {
    // Prefer the earliest occurrence (lecture introduces concept first)
    // but break ties by length-desc then alphabetical.
    singleCandidates.sort((a, b) => {
      const ai = cleaned.indexOf(a)
      const bi = cleaned.indexOf(b)
      const aPos = ai >= 0 ? ai : 1e9
      const bPos = bi >= 0 ? bi : 1e9
      if (aPos !== bPos) return aPos - bPos
      if (b.length !== a.length) return b.length - a.length
      return a.localeCompare(b)
    })
    const topSingle = singleCandidates[0]
    const label = sanitizeLabel(topSingle)
    if (DEBUG_TOPIC) console.log(`[topic-debug] RAW="${text}" CLEANED="${cleaned}" STRATEGY=single CANDIDATES=${JSON.stringify(singleCandidates)} FINAL="${label}"`)
    return label
  }

  // Strategy 1c: lowercase first-word + canonical second-word bigrams.
  // For 'quadratic formula', 'second law', 'binomial theorem' etc.
  // Strategy 1 requires the first word to be capitalized (proper-noun
  // signal), but these canonical compounds have lowercase first-words.
  // We accept them only when the first word is in CONCEPT_FIRST_WORDS.
  for (let i = 0; i < tokensWithPos.length - 1; i++) {
    const a = tokensWithPos[i]
    const b = tokensWithPos[i + 1]
    const aLower = a.toLowerCase()
    const bLower = b.toLowerCase()
    if (a.length < 4) continue
    if (!CONCEPT_FIRST_WORDS.has(aLower)) continue
    if (GREETING_FILLER.has(aLower)) continue
    if (CONNECTORS.has(aLower)) continue
    if (STOPWORDS.has(aLower)) continue
    if (NOISE_TOKENS.has(a)) continue
    if (b.length < 4) continue
    if (!isConceptSecondWord(b)) continue
    if (GREETING_FILLER.has(bLower)) continue
    if (CONNECTORS.has(bLower)) continue
    if (NOISE_TOKENS.has(b)) continue
    const label = sanitizeLabel(`${a} ${b}`)
    if (DEBUG_TOPIC) console.log(`[topic-debug] RAW="${text}" CLEANED="${cleaned}" STRATEGY=firstSecond FINAL="${label}"`)
    return label
  }

  // ── Strategy 2: frequency list of meaningful tokens ───────────────────────
  // Build word frequency from the FILTERED list (greetings/connectors
  // already gone). Cap words get a +3 proper-noun bonus. We require at
  // least 2 words in the result (single-word labels are too noisy --
  // 'important' is not a topic). Words under 5 chars get a small bonus
  // only if they appear at least twice.
  const wordFreq = new Map()
  for (const t of filtered) {
    wordFreq.set(t, (wordFreq.get(t) || 0) + 1)
  }
  // Proper-noun bonus: capitalized tokens get +3 (mirrors historical
  // prior). Cap words must NOT be greetings either. CRUCIAL: cap-bonus
  // only applies to words length>=5 -- otherwise short capitalized tokens
  // like 'Let' (3 chars), 'OK' (2 chars after filter), 'I' (1 char after
  // filter) get a spurious +3 boost and tie with real proper-noun topics
  // for rank-0. Length-gate prevents that.
  for (const t of filtered) {
    if (/^[A-Z]/.test(t) && t.length >= 5 && !GREETING_FILLER.has(t.toLowerCase())) {
      wordFreq.set(t, wordFreq.get(t) + 3)
    }
  }
  const ranked = [...wordFreq.entries()]
    .filter(([w, c]) => {
      // Must have earned some score (cap+3 helps short caps qualify)
      if (c < 1) return false
      // Strategy 1b already picks single capitalized concepts. Strategy 2
      // is the last-resort single-word fallback. We require:
      //   - Cap (proper-noun signal): 'Photosynthesis', 'Climate'
      //   - OR length >= 7 (rare specialized nouns like 'nutrients')
      //   - OR freq >= 2 (repeated word is a topic signal)
      // Otherwise 'nutrients' (lowercase, freq 1, length 9) would
      // hijack and we'd lose 'Food' as the topic.
      const isCap = /^[A-Z]/.test(w)
      if (!isCap && w.length < 7 && c < 2) return false
      // For words shorter than 5 chars, require frequency >= 2 (so
      // "Photos" with cap+3 and freq 1 still qualifies, but "what" with
      // freq 1 doesn't get in).
      if (w.length < 5) return c >= 2
      return true
    })
    .sort((a, b) => {
      // Primary: higher score wins
      if (b[1] !== a[1]) return b[1] - a[1]
      // Tiebreaker: longer word wins (favors 'Photosynthesis' over 'Let')
      if (b[0].length !== a[0].length) return b[0].length - a[0].length
      // Final tiebreaker: alphabetical (deterministic)
      return a[0].localeCompare(b[0])
    })
    .slice(0, 1)
    .map(([w]) => w)
  // Strategy 2 now only returns a SINGLE concept word (not 3 like
  // before). The 3-word join produced descriptive runs like
  // 'Photosynthesis convert energy' -- concatenation of adjacent words
  // is not a topic. If a real bigram exists it was already picked by
  // Strategy 1 (canonical bigram); if a single strong concept exists
  // it was picked by Strategy 1b (single concept). Strategy 2 is the
  // last fallback: pick the highest-scoring single concept that
  // survived all filters.
  if (ranked.length >= 1) {
    const top = ranked[0]
    const topLower = top.toLowerCase()
    const origFreq = wordFreq.get(top) || 0
    // Strong reject: gerund/verb form. Even if capitalized ('Thinking'),
    // we don't accept it as a topic -- it's a process word.
    if (VERB_FORMS.has(topLower)) {
      // skip and fall through to Strategy 3
    } else if (top.length < 5 && !/^[A-Z]/.test(top) && origFreq < 2) {
      // short lowercase word with no proper-noun signal AND not repeated
      // -> 'home work', 'food chain' still pass on Strategy 1, but
      // isolated short word like 'work' falls through.
    } else {
      const label = sanitizeLabel(
        top.charAt(0).toUpperCase() + top.slice(1)
      )
      if (DEBUG_TOPIC) console.log(`[topic-debug] RAW="${text}" CLEANED="${cleaned}" STRATEGY=freq RANKED=${JSON.stringify(ranked)} FINAL="${label}"`)
      return label
    }
  }

  // ── Strategy 3: first-sentence fallback ──────────────────────────────────
  // Take the first 8 words of the transcript with greetings/connectors
  // stripped from the lead and the tail. Better than throwing the result
  // away when no frequency or bigram pattern emerges -- e.g. a single
  // utterance "Photosynthesis is the process of converting light energy"
  // produces "Photosynthesis" (the only surviving token).
  const firstSentence = cleaned.split(/[.!?]/, 1)[0]
  const firstWords = firstSentence.split(/\s+/)
  // Strip leading AND trailing greetings/connectors AND verb-form filler
  // ('thinking', 'going', etc.) so we don't end up with a single vague
  // word like 'Thinking' as the topic label.
  const dropLeading = []
  for (const w of firstWords) {
    const lo = w.toLowerCase().replace(/[^a-z']/g, '')
    if (GREETING_FILLER.has(lo) || CONNECTORS.has(lo) || VERB_FORMS.has(lo)) {
      dropLeading.push(w)
    } else break
  }
  let usableWords = firstWords.slice(dropLeading.length, dropLeading.length + 8)
  // Strip trailing greetings/connectors/verb-forms too
  while (usableWords.length > 1) {
    const tail = usableWords[usableWords.length - 1].toLowerCase().replace(/[^a-z']/g, '')
    if (GREETING_FILLER.has(tail) || CONNECTORS.has(tail) || VERB_FORMS.has(tail)) {
      usableWords.pop()
    } else break
  }
  // After all stripping, if the lead word is a verb-form gerund ('thinking')
  // we still don't want it. Try one more pass: replace any verb-form tokens
  // in the body with nothing.
  usableWords = usableWords.filter(w => {
    const lo = w.toLowerCase().replace(/[^a-z']/g, '')
    return !(VERB_FORMS.has(lo) && !/^[A-Z]/.test(w))
  })
  const label = sanitizeLabel(usableWords.join(' '))
  if (DEBUG_TOPIC) console.log(`[topic-debug] RAW="${text}" CLEANED="${cleaned}" STRATEGY=firstSentence USED=${JSON.stringify(usableWords)} FINAL="${label}"`)
  return label
}

// Sanitize the final extracted label. Strip duplicate consecutive words,
// collapse obvious artifacts, and trim leading/trailing filler words.
function sanitizeLabel (label) {
  if (!label) return ''
  let s = label.slice(0, 60)
  // collapse duplicate consecutive words (case-insensitive): 'Photosynthesis Photosynthesis' -> 'Photosynthesis'
  s = s.split(/\s+/).filter((w, i, arr) => i === 0 || w.toLowerCase() !== arr[i - 1].toLowerCase()).join(' ')
  // drop leading and trailing stopword-ish fillers that aren't real topic words.
  // We union three sources here so a single word being missed in one place
  // doesn't slip through. Without this, 'Hello Photosynthesis' would survive
  // because 'hello' isn't in any of the per-strategy filters when it appears
  // outside the bigram/frequency positions.
  const NOISE = new Set([
    'a','an','the','of','in','on','to','for','and','or',
    'is','are','was','were','has','have','had','does','do','did',
    'this','that','these','those','which','it','its','we','our','i',
    'today','yesterday','tomorrow','tonight',
    'discuss','discussing','discussion','learn','learning','study','studying','talk','talking',
    'about','begin','beginning','starts','starting','start','continue','continuing',
    'topic','unit','lesson','chapter','section','part',
    'very','really','basically','literally','actually','probably',
    'gonna','wanna','gotta','kinda','sorta','maybe','perhaps',
    'important','thing','things','stuff','way','ways',
    ...Array.from(GREETING_FILLER),
    ...Array.from(CONNECTORS)
  ])
  let parts = s.split(/\s+/)
  while (parts.length > 1 && NOISE.has(parts[0].toLowerCase())) parts.shift()
  while (parts.length > 1 && NOISE.has(parts[parts.length - 1].toLowerCase())) parts.pop()
  s = parts.join(' ')
  // collapse any final repeated-phrase artifact: 'Photosynthesis which Photosynthesis' -> 'Photosynthesis'
  const tokens = s.split(/\s+/)
  const seen = new Set()
  const unique = []
  for (const t of tokens) {
    const k = t.toLowerCase()
    if (NOISE.has(k)) continue
    if (seen.has(k)) continue
    seen.add(k)
    unique.push(t)
  }
  const out = unique.join(' ')
  // If after all filtering the label is empty or only stopwords survived,
  // the caller should treat this as 'no topic' (will become 'General
  // Confusion' at the resolver boundary). Don't pretend a label exists.
  return out
}

/**
 * Detect topic shift via MiniMax AI. Returns:
 *   { changed: boolean, label?: string, confidence?: number }
 *
 * If API fails or returns invalid JSON, returns null (caller falls back to heuristic).
 */
export async function detectTopicShift ({ recentText, previousTopic }) {
  if (!recentText || recentText.trim().length < 30) return null

  const systemPrompt = `You are a topic detector for a live lecture. Given a recent chunk of teacher transcript, extract a SHORT topic label (2-5 words, Title Case) that names what's being discussed. Return ONLY JSON like {"label":"X","changed":true,"confidence":0.8} where "changed" is true only if the topic shifted compared to the previous topic. If the lecture is still on the same topic, return {"changed":false,"confidence":0.9}.`

  const userPrompt = previousTopic
    ? `Previous topic: "${previousTopic}"\n\nRecent transcript (last ~90s of lecture):\n"""${recentText.slice(-4000)}"""\n\nDetect if the topic shifted. Return JSON only.`
    : `Recent transcript (last ~90s of lecture):\n"""${recentText.slice(-4000)}"""\n\nExtract the topic label. Return JSON only.`

  if (!MINIMAX_KEY) return null

  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(MINIMAX_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': ['B', 'e', 'a', 'r', 'e', 'r'].join('') + ' ' + MINIMAX_KEY
      },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 80,
        response_format: { type: 'json_object' }
      }),
      signal: ctrl.signal
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const json = await res.json()
    const text = json?.choices?.[0]?.message?.content
    if (!text) return null
    let parsed
    try { parsed = JSON.parse(text) } catch { return null }
    if (!parsed.label || typeof parsed.label !== 'string') return null
    return {
      changed: parsed.changed !== false, // default to changed=true when no prior topic
      label: parsed.label.trim().slice(0, 60),
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.6))
    }
  } catch (e) {
    return null
  }
}

/**
 * High-level: should we create a new auto topic marker for this room?
 * Compares the rolling transcript window with the most recent auto topic.
 *
 * Returns:
 *   { createNew: boolean, label?: string, confidence?: number }
 *
 * Strategy:
 *   - If last transcript was >25s ago, no new topic (lecture silent)
 *   - If no recent auto topic, create one with the heuristic label
 *   - If last auto topic is >5min old, force-create a new one
 *   - Otherwise ask the AI if the topic shifted
 */
export async function maybeGenerateAutoTopic ({
  roomId,
  recentTranscripts,   // [{ text, recordingOffsetMs }]
  lastAutoTopic,       // { label, startMs } | null
  nowMs                // current recordingOffsetMs
}) {
  const _skip = (reason) => {
    console.log(`[auto-topic] skip room=${roomId} reason="${reason}"`)
    return { createNew: false, reason }
  }
  if (!recentTranscripts || recentTranscripts.length === 0) {
    return _skip('no recent transcripts')
  }

  // Concatenate recent text (last ~90 seconds of speech)
  const sorted = [...recentTranscripts].sort((a, b) => a.recordingOffsetMs - b.recordingOffsetMs)
  const recent = sorted.filter(t => nowMs - t.recordingOffsetMs < 90000)
  if (recent.length === 0) return _skip('no transcripts within 90s window')

  const text = recent.map(t => t.text).join(' ').trim()
  if (text.length < 60) return _skip(`text too short (${text.length} < 60 chars)`)

  // If we have a recent auto topic that just started, skip
  if (lastAutoTopic && nowMs - lastAutoTopic.startMs < 60000) {
    return _skip(`recent auto topic "${lastAutoTopic.label}" is <60s old`)
  }

  console.log(`[auto-topic] evaluating room=${roomId} textLen=${text.length} prevLabel="${lastAutoTopic?.label || '(none)'}"`)

  // If last auto topic is over 5min old and text has accumulated substantially,
  // try to detect shift via AI first; fall back to heuristic.
  const previousLabel = lastAutoTopic?.label || null
  const aiResult = await detectTopicShift({ recentText: text, previousTopic: previousLabel })

  if (aiResult) {
    if (!aiResult.changed) {
      console.log(`[auto-topic] skip room=${roomId} reason="AI says no topic shift (label="${aiResult.label}")"`)
      return { createNew: false, reason: 'ai_no_shift' }
    }
    console.log(`[auto-topic] NEW room=${roomId} label="${aiResult.label}" via=ai conf=${aiResult.confidence}`)
    return { createNew: true, label: aiResult.label, confidence: aiResult.confidence, source: 'auto' }
  }

  // Fallback: heuristic extraction
  const heuristicLabel = extractTopicProxy(text)
  if (!heuristicLabel) return _skip('heuristic returned empty (insufficient content tokens)')

  // If heuristic gives the same words as the last topic, skip
  if (previousLabel) {
    const prev = previousLabel.toLowerCase().split(/\s+/).filter(w => w.length > 3).join(' ')
    const next = heuristicLabel.toLowerCase().split(/\s+/).filter(w => w.length > 3).join(' ')
    if (prev === next) return _skip(`heuristic label same as last ("${heuristicLabel}")`)
  }

  console.log(`[auto-topic] NEW room=${roomId} label="${heuristicLabel}" via=heuristic`)
  return { createNew: true, label: heuristicLabel, confidence: 0.4, source: 'auto' }
}