import { config } from '../config.js'
import { generateWithGroq, generateWithMiniMax } from './questionService.js'
import Term from '../models/Term.js'

// Prefer Groq (free tier) if configured, fall back to MiniMax — same pattern as mindmap.js.
async function callLLM(prompt) {
  const useGroq = !!config.groqApiKey
  return useGroq ? await generateWithGroq(prompt) : await generateWithMiniMax(prompt)
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
export async function getTermDetails(term) {
  const termLower = term.trim().toLowerCase()
  const existing = await Term.findOne({ termLower })

  if (existing?.definition) {
    // Cache hit — zero AI cost.
    return { definition: existing.definition, studyMaterial: existing.studyMaterial || [], category: existing.category }
  }

  const prompt = `Provide a concise explanation for a student-facing glossary, for the technical term: "${term}"

OUTPUT: Respond with ONLY valid JSON in this exact shape:
{
  "definition": "A clear 2-3 sentence definition/explanation.",
  "category": "A short subject category, e.g. Operating Systems, Networking, Data Structures",
  "studyMaterial": [
    { "title": "Short resource title", "url": "https://..." }
  ]
}
Keep studyMaterial to at most 2 well-known, real, reputable resources (e.g. official docs, GeeksforGeeks, MDN). If you are not confident a URL is real, omit that entry rather than inventing one.`

  const raw = await callLLM(prompt)
  const parsed = extractJson(raw)

  const result = {
    definition: parsed.definition || 'Definition not available.',
    studyMaterial: Array.isArray(parsed.studyMaterial) ? parsed.studyMaterial : [],
    category: parsed.category || null
  }

  // Cache globally for every future lecture, any room, any teacher.
  await Term.findOneAndUpdate(
    { termLower },
    { termLower, term, ...result },
    { upsert: true, new: true }
  )

  return result
}

// ---------------------------------------------------------------------------
// 3. getTermMindmap — lazy, cached globally. Only called when a student clicks
//    "Generate Mindmap" for a specific term.
// ---------------------------------------------------------------------------
export async function getTermMindmap(term) {
  const termLower = term.trim().toLowerCase()
  const existing = await Term.findOne({ termLower })

  if (existing?.mindmapCode) {
    return existing.mindmapCode // cache hit — zero AI cost
  }

  const prompt = `Generate a small Mermaid.js mindmap explaining the concept "${term}" — its definition, sub-concepts, and related ideas.

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

Correct:
mindmap
  root((${term}))
    Factors
      Mass of object
      Radius of planet
    Related concepts
      Orbital velocity

WRONG — do NOT do this (multiple values in one node's parentheses is invalid):
mindmap
  root((${term}))
    factors("mass of object", "radius of planet")

Example format:
mindmap
  root((${term}))
    Sub-concept 1
    Sub-concept 2
      Detail`

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