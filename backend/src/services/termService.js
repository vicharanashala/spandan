import { config } from '../config.js'
import { generateWithGroq, generateWithMiniMax } from './questionService.js'
import Term from '../models/Term.js'
import { isRedisEnabled, getRedisClient } from '../config/redis.js'

// Fallback for when Redis ISN'T configured (matches the codebase's existing
// philosophy: single-instance dev/local setups still work without Redis,
// just without the multi-server guarantee).
const pendingMindmapRequests = new Map()

// Prefer Groq (free tier) if configured, fall back to MiniMax — same pattern as mindmap.js.
async function callLLM(prompt) {
  const useGroq = !!config.groqApiKey
  // [M5] 25s timeout — without this, a hanging LLM call keeps the student's
  //      request stuck indefinitely. 25s is comfortably under the 30s HTTP timeout
  //      so we always return a clean error instead of a gateway timeout.
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('LLM request timed out after 25s')), 25000)
  )
  return Promise.race([
    useGroq ? generateWithGroq(prompt) : generateWithMiniMax(prompt),
    timeoutPromise
  ])
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON found in LLM response')
  return JSON.parse(match[0])
}

// ---------------------------------------------------------------------------
// 1. detectTerms — cheap, upfront. Called automatically every segment.
//    Output is intentionally tiny (just names), so this is a low-cost call
//    even when it runs on every single transcript segment.
// ---------------------------------------------------------------------------
export async function detectTerms(transcript) {
  if (!transcript || transcript.trim().length < 30) return []

  const prompt = `You are identifying important technical/domain-specific terms from a lecture transcript, for a student-facing glossary sidebar.

TRANSCRIPT:
${transcript}

TASK: List ONLY specific, specialized jargon or named concepts that a listener would genuinely need to look up — terms with a precise technical meaning beyond their everyday sense.

STRICT CRITERIA — a term qualifies ONLY if it is:
- A specific named technical concept, mechanism, or protocol (e.g. "Mutex", "TCP Handshake", "Race Condition", "Binary Search", "Deadlock")
- An acronym or specialized vocabulary specific to the subject being taught
- A concept whose precise/formal meaning differs meaningfully from its everyday-English meaning

DO NOT include:
- Common English nouns/verbs, even if central to the topic (e.g. "Addiction", "Notification", "Comparison", "Privacy", "Algorithm" alone without a qualifier — these don't need a specialized dictionary lookup)
- Generic academic words ("Analysis", "Process", "Factor", "Concept", "Issue")
- Anything a general adult audience would already understand without explanation

EXAMPLES:
Good extraction from a transcript about OS: ["Mutex", "Deadlock", "Race Condition", "Critical Section"]
Good extraction from a transcript about networking: ["TCP Handshake", "Packet Loss", "Latency"]
BAD extraction (too generic) from a transcript about social media: ["Addiction", "Notification", "Comparison", "Privacy"] — none of these need a specialized definition, so the correct output for a transcript like that is likely: []

OUTPUT: Respond with ONLY a JSON array of strings, nothing else. Example: ["Mutex", "Deadlock", "Critical Section"]
If NO term in this snippet meets the strict criteria above, respond with exactly: []
Keep the list short — at most 4 terms per snippet, and only the ones you are genuinely confident qualify.`

  try {
    const raw = await callLLM(prompt)
    const terms = extractJson(raw)
    if (!Array.isArray(terms)) return []
    // Basic sanity filtering: drop empty/too-long/non-string entries defensively
    return terms
      .filter(t => typeof t === 'string' && t.trim().length > 0 && t.trim().length < 60)
      .map(t => t.trim())
      .slice(0, 6)
  } catch (err) {
    console.error('[termService] detectTerms failed:', err.message)
    return [] // fail quiet — a missed detection shouldn't break the segment pipeline
  }
}

// ---------------------------------------------------------------------------
// 2. getTermDetails — lazy, cached globally. Only called when a student clicks
//    a term. First lookup checks the Term cache before ever calling the LLM.
// ---------------------------------------------------------------------------
// Heuristic: short, all-caps terms (NSS, RAM, CPU, TCP...) are the highest-risk
// case for ambiguity — the same acronym can mean completely different things
// in different subjects/contexts. Longer, specific terms ("Deadlock", "Race
// Condition") are essentially unambiguous and safe to cache globally.
function looksLikeAmbiguousAcronym(term) {
  const trimmed = term.trim()
  return trimmed.length <= 5 && /^[A-Z0-9]+$/.test(trimmed)
}

export async function getTermDetails(term, context = '') {
  const termLower = term.trim().toLowerCase()
  const isAmbiguous = looksLikeAmbiguousAcronym(term)

  // Ambiguous acronyms SKIP the global cache entirely — a cached definition
  // from one lecture's context could be flatly wrong in another lecture's
  // context (e.g. "NSS" = National Service Scheme here, but Name Service
  // Switch in a different, Unix-systems lecture). Correctness matters more
  // than cost savings for this small subset of terms.
  if (!isAmbiguous) {
    const existing = await Term.findOne({ termLower })
    if (existing?.definition) {
      return { definition: existing.definition, studyMaterial: existing.studyMaterial || [], category: existing.category }
    }
  }

  const contextBlock = context
    ? `\n\nCONTEXT — here is the actual transcript excerpt this term was mentioned in. Use this to determine the CORRECT, INTENDED meaning (this matters a lot for acronyms/short terms that could mean different things in different fields):\n"""${context}"""\n`
    : ''

  // NOTE: we deliberately do NOT ask the LLM for URLs. LLMs don't have real
  // internet access — any URL they produce is a guess from training memory,
  // which is frequently wrong/dead. Instead we build guaranteed-working
  // search links ourselves, directly from the term name.
  const prompt = `Provide a concise explanation for a student-facing glossary, for the term: "${term}"${contextBlock}

OUTPUT: Respond with ONLY valid JSON in this exact shape:
{
  "definition": "A clear 2-3 sentence definition/explanation, matching the meaning actually used in the context above (if provided).",
  "category": "A short subject category, e.g. Operating Systems, Networking, Government Scheme, Data Structures"
}`

  const raw = await callLLM(prompt)
  const parsed = extractJson(raw)

  // Deterministic, always-valid links — built from the term itself, not
  // trusted to the LLM's memory of what a "real" URL looks like.
  const encodedTerm = encodeURIComponent(term)
  const studyMaterial = [
    { title: `${term} — Wikipedia`, url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodedTerm}` },
    { title: `Search: ${term}`, url: `https://www.google.com/search?q=${encodedTerm}` }
  ]

  const result = {
    definition: parsed.definition || 'Definition not available.',
    studyMaterial,
    category: parsed.category || null
  }

  if (isAmbiguous) {
    // Don't pollute the global cache with a context-specific meaning —
    // this result is only reliable for THIS specific mention.
    return result
  }

  // Safe to cache globally for every future lecture, any room, any teacher.
  await Term.findOneAndUpdate(
    { termLower },
    { termLower, term, ...result },
    { upsert: true, new: true }
  )

  return result
}

// ---------------------------------------------------------------------------
// The actual "do the work" function — builds the prompt, calls the LLM,
// cleans up the response, and saves it. This is the ONE thing we want to
// happen at most once per term, no matter how many students click at once.
// ---------------------------------------------------------------------------
async function generateAndSaveMindmap(term, termLower, context = '') {
  const contextBlock = context
    ? `\n\nCONTEXT — here is the actual transcript excerpt this term was mentioned in. Make sure the mindmap reflects the meaning actually used here (this matters for acronyms/short terms that could mean different things in different fields):\n"""${context}"""\n`
    : ''

  const prompt = `Generate a small Mermaid.js mindmap explaining the concept "${term}" — its definition, sub-concepts, and related ideas.${contextBlock}

RULES:
1. Output ONLY valid mermaid.js mindmap syntax.
2. Start the output with "mindmap"
3. Do NOT wrap the output in markdown code blocks.
4. Do NOT include any explanations or other text.
5. Keep it small — max 6-8 nodes total.
6. The root node should be "${term}" itself.
7. CRITICAL — each node has EXACTLY ONE label. NEVER put multiple comma-separated
   values inside one node's parentheses. If a concept has multiple related items,
   give it its own line as a parent and list each item as a separate nested child
   node underneath, one per line.

Correct syntax pattern (this is just an EXAMPLE of the FORMAT — your actual node labels
must be about "${term}" specifically, never copy this example's content):
mindmap
  root((Topic Name))
    Category A
      Detail A1
      Detail A2
    Category B
      Detail B1

WRONG — do NOT do this (multiple values in one node's parentheses is invalid):
mindmap
  root((${term}))
    factors("mass of object", "radius of planet")

Now generate the mindmap for "${term}" — using content that is actually, specifically
about "${term}", not the placeholder example above.`

  let markdown = await callLLM(prompt)
  markdown = markdown.replace(/```mermaid/g, '').replace(/```/g, '').trim()
  if (!markdown.startsWith('mindmap')) {
    markdown = 'mindmap\n' + markdown
  }
  markdown = fixMultiArgNodes(markdown)

  await Term.findOneAndUpdate(
    { termLower },
    { termLower, term, mindmapCode: markdown },
    { upsert: true, new: true }
  )

  return markdown
}

// ---------------------------------------------------------------------------
// A "waiter" helper — used when someone ELSE already holds the lock for this
// term. Instead of doing our own work, we just keep checking the database
// every 300ms until the leader finishes and saves the result.
// ---------------------------------------------------------------------------
async function pollUntilSaved(termLower, maxWaitMs = 12000, intervalMs = 300) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < maxWaitMs) {
    const doc = await Term.findOne({ termLower })
    if (doc?.mindmapCode) return doc.mindmapCode
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error('Timed out waiting for another request to finish generating this mindmap')
}

// ---------------------------------------------------------------------------
// 3. getTermMindmap — lazy, cached globally, and now SAFE against many
//    students clicking the same term at the same instant (the "thundering
//    herd" problem). Only ONE actual LLM call happens per term, cluster-wide,
//    no matter how many requests arrive simultaneously.
// ---------------------------------------------------------------------------
export async function getTermMindmap(term, context = '') {
  const termLower = term.trim().toLowerCase()
  const isAmbiguous = looksLikeAmbiguousAcronym(term)

  if (!isAmbiguous) {
    const existing = await Term.findOne({ termLower })
    if (existing?.mindmapCode) {
      return existing.mindmapCode // cache hit — zero AI cost, zero lock needed
    }
  }

  if (isRedisEnabled()) {
    const redis = getRedisClient()
    const lockKey = `lock:mindmap:${termLower}`

    // Atomic "claim this term" — Redis guarantees only ONE caller across
    // ALL server instances gets `acquired === true`, even under a simultaneous
    // flood of requests. EX: 15 is a safety net in case this server crashes
    // mid-generation, so the lock can't get stuck forever.
    const acquired = await redis.set(lockKey, '1', { NX: true, EX: 15 })

    if (acquired) {
      // We won the race — we're responsible for doing the real work.
      try {
        return await generateAndSaveMindmap(term, termLower, context)
      } finally {
        await redis.del(lockKey) // release immediately so we don't block for the full 15s
      }
    } else {
      // Someone else (maybe on a different server) is already generating
      // this. Don't duplicate the work — just wait for their result.
      return await pollUntilSaved(termLower)
    }
  }

  // No Redis configured (local single-instance dev) — fall back to an
  // in-memory Map. This only protects a single process, but that's exactly
  // matching how the rest of this codebase already treats Redis as optional.
  if (pendingMindmapRequests.has(termLower)) {
    return pendingMindmapRequests.get(termLower)
  }
  const generationPromise = generateAndSaveMindmap(term, termLower, context)
  pendingMindmapRequests.set(termLower, generationPromise)
  try {
    return await generationPromise
  } finally {
    pendingMindmapRequests.delete(termLower)
  }
}

// ---------------------------------------------------------------------------
// Defensive auto-fix: models sometimes still write a node like
//   factors("mass of object", "radius of planet")
// even with the prompt example, which is invalid Mermaid mindmap syntax (only
// ONE label per node is allowed). This splits any such line into a parent node
// plus one properly-nested child node per comma-separated value, so a small
// formatting slip from the model doesn't break rendering entirely.
// ---------------------------------------------------------------------------
export function fixMultiArgNodes(markdown) {
  const lines = markdown.split('\n')
  const fixedLines = []

  for (const line of lines) {
    const match = line.match(/^(\s*)([\w\s]+?)\((".*"(?:\s*,\s*".*")+)\)\s*$/)
    if (match) {
      const [, indent, label, argsBlob] = match
      const args = argsBlob.match(/"[^"]*"/g) || []
      fixedLines.push(`${indent}${label.trim()}`)
      for (const arg of args) {
        fixedLines.push(`${indent}  ${arg.replace(/^"|"$/g, '')}`)
      }
    } else {
      fixedLines.push(line)
    }
  }

  return fixedLines.join('\n')
}